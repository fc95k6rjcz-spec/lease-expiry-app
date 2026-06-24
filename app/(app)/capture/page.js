'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/data';

export default function CapturePage() {
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address,market' });
  const [bldText, setBldText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const router = useRouter();
  const add = (m) => setLog((l) => [...l, m]);

  const bld = useMemo(() => {
    const t = bldText.trim().toLowerCase();
    if (!t) return null;
    return buildings.find((b) => (b.name || '').toLowerCase() === t || (b.street_address || '').toLowerCase() === t) || null;
  }, [bldText, buildings]);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setLog([]);
  }

  async function scan() {
    if (!file) return;
    setBusy(true);
    setLog([]);
    try {
      const path = `${Date.now()}-${(file.name || 'board').replace(/[^a-zA-Z0-9.]/g, '_')}`;
      add('Uploading photo…');
      const { error: upErr } = await supabase.storage.from('directory-photos').upload(path, file, { upsert: false });
      if (upErr) throw new Error('Upload failed: ' + upErr.message);
      const imageUrl = supabase.storage.from('directory-photos').getPublicUrl(path).data.publicUrl;

      add('Reading the board…');
      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
      const b64 = String(dataUrl).split(',')[1];
      const resp = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mimeType: file.type || 'image/jpeg' }) });
      const j = await resp.json();
      if (j.error) throw new Error(j.error);
      const listings = j.listings || [];
      if (!listings.length) throw new Error('No tenants read from that photo — try a clearer, straight-on shot.');

      const rows = listings.map((l) => ({
        source: 'Directory board', confidence: 0.85, status: 'pending',
        building_id: bld?.id || null,
        building_name: bld?.name || (bldText.trim() || null),
        street_address: bld?.street_address || null,
        market: bld?.market || null,
        floor: l.floor || null, suite: l.suite || null, tenant_name: l.tenant,
        image_url: imageUrl,
      }));
      const { error: insErr } = await supabase.from('pending_occupiers').insert(rows);
      if (insErr) throw new Error('Save failed: ' + insErr.message);
      add(`✅ Read ${rows.length} tenants — sent to the review queue.`);
      setTimeout(() => router.push('/review'), 700);
    } catch (e) {
      add('❌ ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Scan a directory board" sub="Photograph a lobby board — LEX reads it into pending occupiers" />
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div className="banner info">Snap the tenant directory in a building lobby. LEX reads each floor/tenant/suite and stages them for review — nothing hits the official stack plan until you approve it.</div>
        <div className="card"><div className="bd pad">
          <label className="t-sub">Which building? (search by name or address — or type a new one)</label>
          <input list="bldlist" value={bldText} onChange={(e) => setBldText(e.target.value)} placeholder="e.g. Angel Place or 123 Pitt Street" style={{ width: '100%', marginTop: 4 }} />
          <datalist id="bldlist">
            {buildings.slice(0, 4000).map((b) => <option key={b.id} value={b.name || b.street_address}>{b.street_address && b.street_address !== b.name ? b.street_address : ''}</option>)}
          </datalist>
          {bld ? <div className="t-sub" style={{ marginTop: 4, color: 'var(--green)' }}>✓ matched {bld.name || bld.street_address}{bld.market ? ' · ' + bld.market : ''}</div>
            : bldText.trim() ? <div className="t-sub" style={{ marginTop: 4, color: 'var(--amber)' }}>new building — will be created on approval</div> : null}

          <div style={{ marginTop: 14 }}>
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} />
          </div>
          {preview ? <img src={preview} alt="board" style={{ marginTop: 12, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} /> : null}

          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={scan} disabled={busy || !file}>{busy ? 'Reading…' : 'Scan board → review'}</button>
          </div>
          {log.length ? <pre style={{ marginTop: 12, background: '#0b1320', color: '#cbd5e1', padding: 12, borderRadius: 10, fontSize: 12.5 }}>{log.join('\n')}</pre> : null}
        </div></div>
      </div>
    </>
  );
}
