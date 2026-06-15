'use client';
import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { LeaseForm } from '../../../components/forms';
import { useLeases, useTable } from '../../../lib/data';
import { dfmt, money0, expClass, rentOf, toCSV, downloadCSV } from '../../../lib/format';

const COLS = [
  ['tenant', 'Tenant'], ['building', 'Building'], ['unit', 'Level / Suite'],
  ['area', 'm²'], ['rent', 'Rent p.a.'], ['review', 'Next review'], ['expiry', 'Expiry'], ['mte', 'To expiry'],
];

export default function DiaryPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const [win, setWin] = useState('24');
  const [bf, setBf] = useState('');
  const [q, setQ] = useState('');
  const [year, setYear] = useState(null);
  const [sortKey, setSortKey] = useState('mte');
  const [sortDir, setSortDir] = useState(1);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('year');
    if (p) { setYear(+p); setWin('all'); }
  }, []);

  const filtered = useMemo(() => {
    let r = rows.filter((x) => {
      if (bf && x.building_name !== bf) return false;
      if (year) { if (!x.expiry_date || +String(x.expiry_date).slice(0, 4) !== year) return false; }
      else if (win !== 'all') { const m = x.months_to_expiry; if (m == null || m < 0 || m > +win) return false; }
      if (q) {
        const hay = (x.tenant_name + ' ' + x.building_name + ' ' + (x.levels || '') + ' ' + (x.suite || '')).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    const val = {
      tenant: (x) => (x.tenant_name || '').toLowerCase(), building: (x) => x.building_name.toLowerCase(),
      unit: (x) => x.lvlkey, area: (x) => Number(x.size_sqm) || 0, rent: (x) => Number(rentOf(x)) || 0,
      review: (x) => x.next_review_date || '', expiry: (x) => x.expiry_date || '9999',
      mte: (x) => (x.months_to_expiry == null ? 1e9 : x.months_to_expiry),
    };
    const f = val[sortKey] || val.mte;
    return r.sort((a, b) => { const av = f(a), bv = f(b); return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir; });
  }, [rows, bf, year, win, q, sortKey, sortDir]);

  function clickSort(k) {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(1); }
  }
  function exportCsv() {
    const cols = [
      { label: 'Tenant', get: (x) => x.tenant_name }, { label: 'Building', get: (x) => x.building_name },
      { label: 'Address', get: (x) => x.address }, { label: 'Level', get: (x) => x.levels },
      { label: 'Suite', get: (x) => x.suite }, { label: 'Area sqm', get: (x) => x.size_sqm },
      { label: 'Rent pa', get: (x) => rentOf(x) }, { label: 'Rent psqm', get: (x) => x.rent_per_sqm },
      { label: 'Commenced', get: (x) => x.commencement_date }, { label: 'Expiry', get: (x) => x.expiry_date },
      { label: 'Months to expiry', get: (x) => x.months_to_expiry }, { label: 'Status', get: (x) => x.status },
    ];
    downloadCSV('lease-diary.csv', toCSV(filtered, cols));
  }

  return (
    <>
      <Topbar title="Lease Expiry Diary" sub="Every tenancy, sortable by expiry">
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add lease</button>
      </Topbar>
      <div className="wrap">
        <div className="filters">
          <select value={bf} onChange={(e) => setBf(e.target.value)}>
            <option value="">All buildings</option>
            {[...new Set(rows.map((x) => x.building_name))].sort().map((b) => <option key={b}>{b}</option>)}
          </select>
          <div className="chipset">
            {[['6', '≤6 mo'], ['12', '≤12 mo'], ['24', '≤24 mo'], ['all', 'All']].map(([w, lab]) => (
              <button key={w} className={'chip' + (win === w && !year ? ' on' : '')} onClick={() => { setWin(w); setYear(null); }}>{lab}</button>
            ))}
          </div>
          <input placeholder="filter tenant…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{filtered.length} tenancies{year ? ` · expiring ${year}` : ''}</span>
        </div>
        <div className="card">
          <div className="bd">
            {loading ? <Loading /> : (
              <table>
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c[0]} className={(c[0] === 'area' || c[0] === 'rent' ? 'num ' : '') + (sortKey === c[0] ? 'sorted' : '')} onClick={() => clickSort(c[0])}>{c[1]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 600).map((x) => {
                    const [c, l] = expClass(x.months_to_expiry);
                    return (
                      <tr key={x.id} onClick={() => setSel(x)}>
                        <td><div className="t-main">{x.tenant_name}</div></td>
                        <td>{x.building_name}</td>
                        <td>{x.levels || ''}{x.suite ? <div className="t-sub">{x.suite}</div> : null}</td>
                        <td className="num">{x.size_sqm ? Math.round(x.size_sqm).toLocaleString() : '—'}</td>
                        <td className="num">{money0(rentOf(x))}</td>
                        <td>{dfmt(x.next_review_date)}</td>
                        <td>{dfmt(x.expiry_date)}</td>
                        <td><Pill cls={c}>{l}</Pill></td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 ? <tr><td colSpan={8} className="empty">No tenancies match these filters.</td></tr> : null}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {sel && <LeaseDrawer lease={sel} buildings={buildings} tenants={tenants} onClose={() => setSel(null)} onChanged={reload} />}
      {adding && <LeaseForm buildings={buildings} tenants={tenants} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
