'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';

const INC = ['Fixed %', 'Fixed $', 'CPI', 'CPI + %', 'Market', 'None', 'Other'];
const num = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };

export default function ImportLeasePage() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lease, setLease] = useState(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const router = useRouter();

  const set = (k, v) => setLease((s) => ({ ...s, [k]: v }));

  async function extract() {
    if (!file) return;
    setBusy(true); setErr(''); setLease(null); setDone(false);
    try {
      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
      const b64 = String(dataUrl).split(',')[1];
      const r = await fetch('/api/lease-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: b64, mimeType: file.type || 'application/pdf' }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setLease(j.lease || {});
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const L = lease;
      let buildingId = null;
      const bn = (L.building || '').trim(); const ba = (L.address || '').trim();
      if (bn) { const { data } = await supabase.from('buildings').select('id').ilike('name', bn).limit(1); buildingId = data?.[0]?.id; }
      if (!buildingId && ba) { const { data } = await supabase.from('buildings').select('id').ilike('street_address', ba).limit(1); buildingId = data?.[0]?.id; }
      if (!buildingId && (bn || ba)) {
        const { data, error } = await supabase.from('buildings').insert({ name: bn || null, street_address: ba || bn || null }).select('id').single();
        if (error) throw error; buildingId = data.id;
      }
      const tn = (L.tenant || '').trim();
      if (!tn) throw new Error('Tenant name is required.');
      let tenantId = null;
      { const { data } = await supabase.from('tenants').select('id').ilike('legal_name', tn).limit(1); tenantId = data?.[0]?.id; }
      if (!tenantId) { const { data, error } = await supabase.from('tenants').insert({ legal_name: tn, source: 'Import' }).select('id').single(); if (error) throw error; tenantId = data.id; }

      const sqm = num(L.size_sqm), rpa = num(L.rent_per_annum);
      const row = {
        building_id: buildingId, tenant_id: tenantId,
        levels: L.levels || null, size_sqm: sqm,
        rent_per_annum: rpa, rent_per_sqm: (rpa && sqm) ? Math.round((rpa / sqm) * 100) / 100 : null,
        rent_basis: L.rent_basis || 'Net', annual_increase_value: num(L.annual_increase_value),
        has_mid_term_review: !!L.has_mid_term_review, mid_term_review_date: L.mid_term_review_date || null,
        commencement_date: L.commencement_date || null, expiry_date: L.expiry_date || null,
        has_break_right: !!L.has_break_right, break_date: L.break_date || null, break_notice_months: num(L.break_notice_months),
        has_renewal_option: !!L.has_renewal_option, option_terms: L.option_terms || null, option_notice_months: num(L.option_notice_months),
        notes: L.notes || null, status: 'Active',
      };
      if (INC.includes(L.annual_increase_type)) row.annual_increase_type = L.annual_increase_type;
      const { error } = await supabase.from('leases').insert(row);
      if (error) throw error;
      setDone(true);
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  const T = ({ k, label, type = 'text' }) => (
    <div>
      <label className="t-sub">{label}</label>
      <input type={type} value={lease[k] ?? ''} onChange={(e) => set(k, e.target.value)} style={{ width: '100%' }} />
    </div>
  );
  const Chk = ({ k, label }) => (
    <label className="t-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!lease[k]} onChange={(e) => set(k, e.target.checked)} style={{ width: 'auto' }} /> {label}
    </label>
  );

  return (
    <>
      <Topbar title="Import a lease PDF" sub="LEX reads the lease and fills the diary — you confirm before it saves" />
      <div className="wrap" style={{ maxWidth: 760 }}>
        <div className="card"><div className="bd pad">
          <label className="bigcam">
            <input type="file" accept="application/pdf" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setLease(null); setDone(false); }} disabled={busy} />
            <span className="bigcam-ic">▤</span>
            <span>{file ? file.name : 'Choose a lease PDF'}</span>
          </label>
          {file && !lease ? (
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={extract} disabled={busy}>
              {busy ? 'Reading the lease…' : '✦ Extract terms'}
            </button>
          ) : null}
          {err ? <div className="banner err" style={{ marginTop: 12 }}>{err}</div> : null}
        </div></div>

        {lease ? (
          <div className="card" style={{ marginTop: 16 }}><div className="bd pad">
            {done ? <div className="banner info" style={{ marginBottom: 12 }}>✓ Saved to the diary.
              <span style={{ marginLeft: 8, color: 'var(--brand)', cursor: 'pointer' }} onClick={() => router.push('/diary')}>Open diary →</span></div> : null}
            <div className="form-grid">
              <T k="tenant" label="Tenant" /><T k="building" label="Building" />
              <T k="address" label="Address" /><T k="levels" label="Level / floor" />
              <T k="size_sqm" label="Area (m²)" type="number" /><T k="rent_per_annum" label="Rent p.a. ($)" type="number" />
              <T k="rent_basis" label="Rent basis (Net/Gross)" /><T k="annual_increase_type" label="Increase type" />
              <T k="annual_increase_value" label="Increase value" type="number" />
              <T k="commencement_date" label="Commencement" type="date" /><T k="expiry_date" label="Expiry" type="date" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', margin: '12px 0' }}>
              <Chk k="has_mid_term_review" label="Mid-term review" />
              <Chk k="has_break_right" label="Break right" />
              <Chk k="has_renewal_option" label="Option to renew" />
            </div>
            <div className="form-grid">
              {lease.has_mid_term_review ? <T k="mid_term_review_date" label="Review date" type="date" /> : null}
              {lease.has_break_right ? <T k="break_date" label="Break date" type="date" /> : null}
              {lease.has_renewal_option ? <T k="option_terms" label="Option terms" /> : null}
            </div>
            <label className="t-sub" style={{ marginTop: 10, display: 'block' }}>Notes</label>
            <textarea rows={2} value={lease.notes ?? ''} onChange={(e) => set('notes', e.target.value)} style={{ width: '100%' }} />
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={save} disabled={busy || done}>
              {busy ? 'Saving…' : done ? 'Saved ✓' : 'Add to diary'}
            </button>
          </div></div>
        ) : null}
      </div>
    </>
  );
}
