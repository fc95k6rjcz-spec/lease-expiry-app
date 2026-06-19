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

    // Guard 1: only accept CSV. Reject Excel/binary before it can pollute the data.
    const nameOk = /\.csv$/i.test(file.name);
    if (!nameOk) {
      e.target.value = '';
      alert(`That's not a CSV — "${file.name}".\n\nExcel files (.xlsx/.xls) can't be imported directly. In Excel: File → Save As → CSV, then upload that.`);
      return;
    }
    setLog([]);
    setBusy(true);
    try {
      const text = await file.text();
      // Guard 2: binary/Excel sniff — real CSV is printable text.
      if (/PK/.test(text.slice(0, 8)) || /�/.test(text.slice(0, 2000))) {
        throw new Error('This file looks like a binary spreadsheet, not a CSV. In Excel, use File → Save As → CSV.');
      }
      const rows = parseCSV(text);
      // Guard 3: must look like a CityScope export (recognised columns).
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const known = ['Building Name', 'Property Address', 'Tenant Name', 'Lessee Registered', 'Expiry Date', 'Level'];
      if (!cols.some((c) => known.includes(c))) {
        throw new Error('No recognised CityScope columns found (e.g. "Building Name", "Tenant Name", "Expiry Date"). This doesn\'t look like a CityScope CSV — nothing imported.');
      }
      if (!rows.length) throw new Error('No rows found in CSV.');
      add(`Parsed ${rows.length} rows.`);

      // Load what already exists: buildings, tenants, and a signature of every lease on file.
      const [{ data: exB }, { data: exT }, { data: exL }] = await Promise.all([
        supabase.from('buildings').select('id,name,street_address').limit(50000),
        supabase.from('tenants').select('id,legal_name').limit(50000),
        supabase.from('leases').select('building_id,suite,levels,expiry_date').limit(100000),
      ]);
      const bMap = new Map(), idToBKey = new Map();
      (exB || []).forEach((b) => {
        const k = ((b.name || b.street_address) || '').toLowerCase().trim();
        bMap.set(k, b.id); idToBKey.set(b.id, k);
      });
      const tMap = new Map();
      (exT || []).forEach((t) => tMap.set((t.legal_name || '').toLowerCase().trim(), t.id));

      // A tenancy is uniquely identified by building + suite + levels + expiry.
      // This survives tenant-name cleanups, so re-importing the same file is a no-op.
      const sig = (bk, suite, levels, expiry) =>
        [bk || '', (suite || '').toLowerCase().trim(), (levels || '').toLowerCase().trim(), expiry || ''].join('|');
      const onFile = new Set();
      (exL || []).forEach((l) => onFile.add(sig(idToBKey.get(l.building_id) || '', l.suite, l.levels, l.expiry_date)));

      // Decide which rows are genuinely new BEFORE changing anything.
      const seen = new Set();
      const planned = [];
      let dup = 0;
      for (const r of rows) {
        const bRaw = pick(r, ['Building Name']) || pick(r, ['Property Address']);
        const bKey = (bRaw || '').toLowerCase().trim();
        const k = sig(bKey, pick(r, ['Suite']), pick(r, ['Level']), toDate(pick(r, ['Expiry Date'])));
        if (onFile.has(k) || seen.has(k)) { dup++; continue; }
        seen.add(k);
        planned.push(r);
      }
      add(`${planned.length} new tenancies · ${dup} already on file (skipped).`);
      if (!planned.length) {
        add('✅ Nothing new — your data already matches this file. No duplicates created.');
        setBusy(false); e.target.value = ''; return;
      }

      // Guard 4: conscious confirmation, now showing the real (deduped) impact.
      if (!window.confirm(`Import ${planned.length} NEW tenancies from "${file.name}"?\n\n${dup} rows are already in LEX and will be skipped, so this won't create duplicates.`)) {
        add('Cancelled.'); setBusy(false); e.target.value = ''; return;
      }

      // Create only the buildings/tenants the NEW tenancies need.
      const newB = new Map(), newT = new Map();
      for (const r of planned) {
        const bRaw = pick(r, ['Building Name']) || pick(r, ['Property Address']);
        const bKey = (bRaw || '').toLowerCase().trim();
        if (bRaw && !bMap.has(bKey) && !newB.has(bKey))
          newB.set(bKey, { name: pick(r, ['Building Name']) || null, street_address: pick(r, ['Property Address']) || bRaw, suburb: pick(r, ['Property Suburb']) || null, cityscope_ref: pick(r, ['Cityscope Reference', 'Building Name']) || null });
        const tRaw = pick(r, ['Tenant Name']) || pick(r, ['Lessee Registered']);
        const tKey = (tRaw || '').toLowerCase().trim();
        if (tRaw && !tMap.has(tKey) && !newT.has(tKey))
          newT.set(tKey, { legal_name: tRaw, website: pick(r, ['Internet']) || null, source: 'Import' });
      }

      if (newB.size) {
        for (const part of chunk([...newB.values()], 500)) {
          const { data, error } = await supabase.from('buildings').insert(part).select('id,name,street_address');
          if (error) throw error;
          (data || []).forEach((b) => bMap.set(((b.name || b.street_address) || '').toLowerCase().trim(), b.id));
        }
      }
      add(`Buildings: +${newB.size} new.`);
      if (newT.size) {
        for (const part of chunk([...newT.values()], 500)) {
          const { data, error } = await supabase.from('tenants').insert(part).select('id,legal_name');
          if (error) throw error;
          (data || []).forEach((t) => tMap.set((t.legal_name || '').toLowerCase().trim(), t.id));
        }
      }
      add(`Tenants: +${newT.size} new.`);

      // Build leases ONLY for the new tenancies.
      const leases = planned.map((r) => {
        const bKey = (pick(r, ['Building Name']) || pick(r, ['Property Address']) || '').toLowerCase().trim();
        const tKey = (pick(r, ['Tenant Name']) || pick(r, ['Lessee Registered']) || '').toLowerCase().trim();
        const fixed = toNum(pick(r, ['Fixed%*', 'Fixed%']));
        const cpi = toNum(pick(r, ['CPI%*', 'CPI%']));
        let incType = 'Other', incVal = null;
        if (fixed != null) { incType = 'Fixed %'; incVal = fixed <= 1 ? Math.round(fixed * 10000) / 100 : fixed; }
        else if (cpi != null) { incType = 'CPI'; incVal = cpi <= 1 ? Math.round(cpi * 10000) / 100 : cpi; }
        const options = pick(r, ['Options Detail']);
        return {
          building_id: bMap.get(bKey) || null,
          tenant_id: tMap.get(tKey) || null,
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
        };
      });

      let inserted = 0;
      for (const part of chunk(leases, 500)) {
        const { error } = await supabase.from('leases').insert(part);
        if (error) throw error;
        inserted += part.length;
        add(`Inserted ${inserted}/${leases.length} new tenancies…`);
      }
      add(`✅ Done. Added ${inserted} new tenancies (${dup} duplicates skipped).`);
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
              In CityScope, export your data and save it as <b>CSV</b> (Excel files must be saved as CSV first). The
              importer matches each tenancy by building, suite, level and expiry, so it only adds what&apos;s genuinely
              new — <b>re-importing the same file is safe and won&apos;t create duplicates</b>. It tells you how many new
              tenancies it found and asks you to confirm before loading them.
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
