'use client';
import { useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';
import { parseCSV, toCSV, downloadCSV } from '../../../lib/format';

const pick = (row, names) => {
  for (const n of names) if (row[n] != null && row[n] !== '') return row[n];
  return '';
};
const toDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};
const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
};
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

export default function ImportPage() {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const add = (m) => setLog((l) => [...l, m]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLog([]);
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      add(`Parsed ${rows.length} rows.`);
      if (!rows.length) throw new Error('No rows found in CSV.');

      // existing maps (idempotent-ish)
      const [{ data: exB }, { data: exT }] = await Promise.all([
        supabase.from('buildings').select('id,name,street_address').limit(10000),
        supabase.from('tenants').select('id,legal_name').limit(10000),
      ]);
      const bMap = new Map();
      (exB || []).forEach((b) => bMap.set(((b.name || b.street_address) || '').toLowerCase(), b.id));
      const tMap = new Map();
      (exT || []).forEach((t) => tMap.set((t.legal_name || '').toLowerCase(), t.id));

      // collect new buildings & tenants
      const newB = new Map(), newT = new Map();
      for (const r of rows) {
        const bname = pick(r, ['Building Name']) || pick(r, ['Property Address']);
        const baddr = pick(r, ['Property Address']) || bname;
        const bkey = (bname || '').toLowerCase();
        if (bname && !bMap.has(bkey) && !newB.has(bkey)) newB.set(bkey, { name: pick(r, ['Building Name']) || null, street_address: baddr, suburb: null, cityscope_ref: pick(r, ['Building Name']) || null });
        const tname = pick(r, ['Tenant Name']) || pick(r, ['Lessee Registered']);
        const tkey = (tname || '').toLowerCase();
        if (tname && !tMap.has(tkey) && !newT.has(tkey)) newT.set(tkey, { legal_name: tname, website: pick(r, ['Internet']) || null });
      }

      if (newB.size) {
        for (const part of chunk([...newB.values()], 500)) {
          const { data, error } = await supabase.from('buildings').insert(part).select('id,name,street_address');
          if (error) throw error;
          (data || []).forEach((b) => bMap.set(((b.name || b.street_address) || '').toLowerCase(), b.id));
        }
        add(`Inserted ${newB.size} buildings.`);
      } else add('No new buildings.');

      if (newT.size) {
        for (const part of chunk([...newT.values()], 500)) {
          const { data, error } = await supabase.from('tenants').insert(part).select('id,legal_name');
          if (error) throw error;
          (data || []).forEach((t) => tMap.set((t.legal_name || '').toLowerCase(), t.id));
        }
        add(`Inserted ${newT.size} tenants.`);
      } else add('No new tenants.');

      // build leases
      const leases = rows.map((r) => {
        const bname = (pick(r, ['Building Name']) || pick(r, ['Property Address']) || '').toLowerCase();
        const tname = (pick(r, ['Tenant Name']) || pick(r, ['Lessee Registered']) || '').toLowerCase();
        const fixed = toNum(pick(r, ['Fixed%*', 'Fixed%']));
        const cpi = toNum(pick(r, ['CPI%*', 'CPI%']));
        let incType = 'Other', incVal = null;
        if (fixed != null) { incType = 'Fixed %'; incVal = fixed <= 1 ? Math.round(fixed * 10000) / 100 : fixed; }
        else if (cpi != null) { incType = 'CPI'; incVal = cpi <= 1 ? Math.round(cpi * 10000) / 100 : cpi; }
        const options = pick(r, ['Options Detail']);
        return {
          building_id: bMap.get(bname) || null,
          tenant_id: tMap.get(tname) || null,
          levels: pick(r, ['Level']) || null,
          suite: pick(r, ['Suite']) || null,
          size_sqm: toNum(pick(r, ['Area*', 'Area'])),
          rent_per_annum: toNum(pick(r, ['Current $/year**', 'Base $/year*', 'Current $/year', 'Base $/year'])),
          rent_per_sqm: toNum(pick(r, ['Current $/sqm**', 'Base $/sqm*', 'Current $/sqm', 'Base $/sqm'])),
          annual_increase_type: incType,
          annual_increase_value: incVal,
          commencement_date: toDate(pick(r, ['Start Date'])),
          expiry_date: toDate(pick(r, ['Expiry Date'])),
          next_review_date: toDate(pick(r, ['Review Date*', 'Review Date'])),
          review_type: pick(r, ['Review Type*', 'Review Type']) || null,
          has_renewal_option: !!options,
          option_terms: options || null,
          status: 'Active',
          cityscope_ref: pick(r, ['Building Name']) ? null : null,
        };
      });

      let inserted = 0;
      for (const part of chunk(leases, 500)) {
        const { error } = await supabase.from('leases').insert(part);
        if (error) throw error;
        inserted += part.length;
        add(`Inserted ${inserted}/${leases.length} leases…`);
      }
      add(`✅ Done. Imported ${inserted} tenancies.`);
    } catch (e) {
      add('❌ ' + (e.message || e));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function exportTable(table, filename, cols) {
    const { data, error } = await supabase.from(table).select('*').limit(10000);
    if (error) return alert(error.message);
    downloadCSV(filename, toCSV(data || [], cols));
  }

  return (
    <>
      <Topbar title="Import / Export" sub="Load a CityScope export · download your data" />
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="hd"><h2>Import CityScope (CSV)</h2></div>
          <div className="bd pad">
            <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
              In CityScope, export your data and save it as <b>CSV</b> (or open the .xlsx and Save As CSV). The importer
              maps the standard CityScope columns, creates any missing buildings and tenants, then loads each tenancy.
              It reuses buildings/tenants that already exist, so re-importing won&apos;t duplicate them (it will add the
              lease rows again — clear the <code>leases</code> table first if you&apos;re reloading the same file).
            </p>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} />
            {log.length > 0 && (
              <pre style={{ marginTop: 14, background: '#0b1320', color: '#cbd5e1', padding: 14, borderRadius: 10, fontSize: 12.5, maxHeight: 260, overflow: 'auto' }}>
                {log.join('\n')}
              </pre>
            )}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>Export</h2></div>
          <div className="bd pad" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => exportTable('v_lease_diary', 'lease-diary.csv', [
                { label: 'Building', get: (r) => r.building }, { label: 'Tenant', get: (r) => r.tenant },
                { label: 'Levels', get: (r) => r.levels }, { label: 'Area sqm', get: (r) => r.size_sqm },
                { label: 'Rent pa', get: (r) => r.rent_per_annum }, { label: 'Expiry', get: (r) => r.expiry_date },
                { label: 'Months to expiry', get: (r) => r.months_to_expiry }, { label: 'Status', get: (r) => r.status },
              ])}
            >
              Export lease diary
            </button>
            <button
              className="btn"
              onClick={() => exportTable('contacts', 'contacts.csv', [
                { label: 'Name', get: (r) => r.full_name }, { label: 'Title', get: (r) => r.title },
                { label: 'Role', get: (r) => r.role_category }, { label: 'Email', get: (r) => r.email },
                { label: 'Mobile', get: (r) => r.mobile }, { label: 'Primary', get: (r) => r.is_primary },
              ])}
            >
              Export contacts
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
