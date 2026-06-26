'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/data';
import { reconcileBoard } from '../../../lib/reconcile';

const MODES = [
  { key: 'auto', label: 'Anything', hint: 'Board, list, schedule or a table on screen' },
  { key: 'board', label: 'Lobby board', hint: 'A building directory sign' },
];

export default function CapturePage() {
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address,market' });
  const [mode, setMode] = useState('auto');
  const [bldText, setBldText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);   // extracted listings
  const [delta, setDelta] = useState(null);   // board reconciliation result
  const [err, setErr] = useState('');
  const router = useRouter();

  const bld = useMemo(() => {
    const t = bldText.trim().toLowerCase();
    if (!t) return null;
    return buildings.find((b) => (b.name || '').toLowerCase() === t || (b.street_address || '').toLowerCase() === t) || null;
  }, [bldText, buildings]);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setFound(null); setDelta(null); setErr('');
  }

  async function scan() {
    if (!file) return;
    setBusy(true); setErr(''); setFound(null); setDelta(null);
    try {
      const path = `${Date.now()}-${(file.name || 'scan').replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('directory-photos').upload(path, file, { upsert: false });
      if (upErr) throw new Error('Upload failed: ' + upErr.message);
      const imageUrl = supabase.storage.from('directory-photos').getPublicUrl(path).data.publicUrl;

      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
      const b64 = String(dataUrl).split(',')[1];
      const resp = await fetch('/api/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mimeType: file.type || 'image/jpeg', mode }),
      });
      const j = await resp.json();
      if (j.error) throw new Error(j.error);
      const listings = j.listings || [];
      if (!listings.length) throw new Error('Nothing readable — try a clearer, straight-on shot with good light.');

      const source = mode === 'board' ? 'Directory board' : 'Scan';
      const confidence = mode === 'board' ? 0.85 : 0.8;
      const rows = listings.map((l) => ({
        source, confidence, status: 'pending',
        building_id: bld?.id || null,
        building_name: l.building || bld?.name || (bldText.trim() || null),
        street_address: bld?.street_address || null,
        market: l.market || bld?.market || null,
        floor: l.floor || null, suite: l.suite || null, tenant_name: l.tenant,
        size_sqm: l.size_sqm ?? null, expiry_date: l.expiry || null,
        image_url: imageUrl,
      }));
      const { error: insErr } = await supabase.from('pending_occupiers').insert(rows);
      if (insErr) throw new Error('Save failed: ' + insErr.message);
      setFound(rows);

      // Delta engine — only a full lobby board can prove who has LEFT, so
      // departure detection is board-mode + known-building only.
      if (mode === 'board' && bld?.id) {
        const { data: ex } = await supabase
          .from('leases')
          .select('levels, tenant:tenants(legal_name)')
          .eq('building_id', bld.id);
        const existing = (ex || []).map((l) => ({ tenant_name: l.tenant?.legal_name, levels: l.levels }));
        setDelta({ ...reconcileBoard(listings, existing), building: bld.name || bld.street_address, known: existing.length });
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Scan into LEX" sub="Point the camera at any tenant data — LEX reads it into the review queue" />
      <div className="wrap mobile-narrow">
        <div className="banner info">
          Snap a lobby board, a company list, a tenancy schedule, or a table on your screen. LEX reads every occupier it
          can — nothing hits your official data until you approve it in the review queue.
        </div>

        <div className="card"><div className="bd pad">
          <div className="seg" style={{ marginBottom: 14 }}>
            {MODES.map((m) => (
              <button key={m.key} className={'segbtn' + (mode === m.key ? ' on' : '')} onClick={() => setMode(m.key)}>
                {m.label}<span>{m.hint}</span>
              </button>
            ))}
          </div>

          {mode === 'board' ? (
            <>
              <label className="t-sub">Which building? (optional — search name or address)</label>
              <input list="bldlist" value={bldText} onChange={(e) => setBldText(e.target.value)}
                placeholder="e.g. Angel Place or 123 Pitt Street" style={{ width: '100%', marginTop: 4 }} />
              <datalist id="bldlist">
                {buildings.slice(0, 4000).map((b) => <option key={b.id} value={b.name || b.street_address} />)}
              </datalist>
              {bld ? <div className="t-sub" style={{ marginTop: 4, color: 'var(--green)' }}>✓ {bld.name || bld.street_address}{bld.market ? ' · ' + bld.market : ''}</div>
                : bldText.trim() ? <div className="t-sub" style={{ marginTop: 4, color: 'var(--amber)' }}>new building — created on approval</div> : null}
            </>
          ) : null}

          <label className="bigcam" style={{ marginTop: 14 }}>
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} hidden />
            <span className="bigcam-ic">⊙</span>
            <span>{file ? 'Retake / choose another' : 'Open camera'}</span>
          </label>

          {preview ? <img src={preview} alt="scan" className="scanprev" /> : null}

          {file ? (
            <button className="btn primary block" onClick={scan} disabled={busy} style={{ marginTop: 12 }}>
              {busy ? 'Reading…' : 'Read this'}
            </button>
          ) : null}

          {err ? <div className="banner err" style={{ marginTop: 12 }}>{err}</div> : null}
        </div></div>

        {found ? (
          <div className="card"><div className="bd pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>✅ Read {found.length} occupier{found.length === 1 ? '' : 's'}</b>
              <button className="btn primary" onClick={() => router.push('/review')}>Review →</button>
            </div>
            <div className="scanlist">
              {found.map((r, i) => (
                <div className="scanrow" key={i}>
                  <span className="t-main">{r.tenant_name}</span>
                  <span className="t-sub">{[r.floor, r.suite, r.building_name, r.market, r.size_sqm ? r.size_sqm + ' m²' : '', r.expiry_date].filter(Boolean).join(' · ') || '—'}</span>
                </div>
              ))}
            </div>
            <div className="t-sub" style={{ marginTop: 10 }}>Sent to the review queue — approve there to make them official.</div>
          </div></div>
        ) : null}

        {delta ? (
          <div className="card"><div className="bd pad">
            <b>What changed{delta.building ? ` · ${delta.building}` : ''}</b>
            <div className="t-sub" style={{ marginTop: 2, marginBottom: 12 }}>
              Reconciled against the {delta.known} occupier{delta.known === 1 ? '' : 's'} LEX already holds for this building.
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                ['New · off-market', delta.summary.newcomers, 'var(--green)'],
                ['Gone · space may free up', delta.summary.departed, 'var(--amber)'],
                ['Moved floor', delta.summary.moved, 'var(--ink)'],
                ['Confirmed', delta.summary.matched, 'var(--muted)'],
              ].map(([lab, n, c]) => (
                <div key={lab} style={{ flex: '1 1 120px', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
                  <div className="t-sub">{lab}</div>
                </div>
              ))}
            </div>

            {delta.newcomers.length ? (
              <div style={{ marginTop: 14 }}>
                <div className="t-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>Off-market — not in your data yet:</div>
                <div className="scanlist">
                  {delta.newcomers.map((n, i) => (
                    <div className="scanrow" key={i}>
                      <span className="t-main">{n.tenant}</span>
                      <span className="t-sub">{[n.floor, n.suite, n.size_sqm ? n.size_sqm + ' m²' : ''].filter(Boolean).join(' · ') || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {delta.departed.length ? (
              <div style={{ marginTop: 14 }}>
                <div className="t-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>No longer on the board — space likely coming available:</div>
                <div className="scanlist">
                  {delta.departed.map((n, i) => (
                    <div className="scanrow" key={i}>
                      <span className="t-main">{n.tenant}</span>
                      <span className="t-sub">{n.floor || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {delta.moved.length ? (
              <div style={{ marginTop: 14 }}>
                <div className="t-sub" style={{ fontWeight: 600 }}>Moved floor — possible expansion or contraction:</div>
                <div className="scanlist">
                  {delta.moved.map((n, i) => (
                    <div className="scanrow" key={i}>
                      <span className="t-main">{n.tenant}</span>
                      <span className="t-sub">{n.from || '?'} → {n.to || '?'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div></div>
        ) : null}
      </div>
    </>
  );
}
