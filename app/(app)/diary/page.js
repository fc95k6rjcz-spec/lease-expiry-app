'use client';
import Link from 'next/link';
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
const SIZE_BANDS = [['all', 'Any size'], ['sm', '< 1,000'], ['mid', '1,000–4,999'], ['lg', '5,000+']];
const EXP_BANDS = [['any', 'Any'], ['le6', '≤6 mo'], ['6to24', '6–24 mo'], ['2to4y', '2–4 yr'], ['3to5y', '3–5 yr'], ['gt5y', '5 yr+']];

function sizeMatch(band, s) {
  if (band === 'all') return true;
  if (s == null) return false;
  if (band === 'sm') return s < 1000;
  if (band === 'mid') return s >= 1000 && s < 5000;
  if (band === 'lg') return s >= 5000;
  return true;
}
function expMatch(band, m) {
  if (band === 'any') return true;
  if (m == null) return false;
  if (band === 'le6') return m >= 0 && m <= 6;
  if (band === '6to24') return m > 6 && m <= 24;
  if (band === '2to4y') return m >= 24 && m <= 48;
  if (band === '3to5y') return m >= 36 && m <= 60;
  if (band === 'gt5y') return m > 60;
  return true;
}
// Smart targets: big leases earlier, small leases later; never <6 months.
function smartMatch(x) {
  const s = Number(x.size_sqm), m = x.months_to_expiry;
  if (!s || m == null || m < 6) return false;
  if (s >= 5000) return m >= 36 && m <= 60;
  if (s >= 1000) return m >= 24 && m <= 48;
  return m >= 12 && m <= 24;
}

export default function DiaryPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const [size, setSize] = useState('all');
  const [exp, setExp] = useState('any');
  const [smart, setSmart] = useState(false);
  const [bf, setBf] = useState('');
  const [q, setQ] = useState('');
  const [year, setYear] = useState(null);
  const [sortKey, setSortKey] = useState('mte');
  const [sortDir, setSortDir] = useState(1);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const y = sp.get('year');
    if (y) { setYear(+y); setExp('any'); setSmart(false); }
    const b = sp.get('b');
    if (b) setBf(b);
  }, []);

  const filtered = useMemo(() => {
    let r = rows.filter((x) => {
      if (bf && x.building_name !== bf) return false;
      if (q) {
        const hay = (x.tenant_name + ' ' + x.building_name + ' ' + (x.levels || '') + ' ' + (x.suite || '')).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (year) return x.expiry_date && +String(x.expiry_date).slice(0, 4) === year;
      if (smart) return smartMatch(x);
      return sizeMatch(size, Number(x.size_sqm)) && expMatch(exp, x.months_to_expiry);
    });
    const val = {
      tenant: (x) => (x.tenant_name || '').toLowerCase(), building: (x) => x.building_name.toLowerCase(),
      unit: (x) => x.lvlkey, area: (x) => Number(x.size_sqm) || 0, rent: (x) => Number(rentOf(x)) || 0,
      review: (x) => x.next_review_date || '', expiry: (x) => x.expiry_date || '9999',
      mte: (x) => (x.months_to_expiry == null ? 1e9 : x.months_to_expiry),
    };
    const f = val[sortKey] || val.mte;
    return r.sort((a, b) => { const av = f(a), bv = f(b); return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir; });
  }, [rows, bf, q, year, smart, size, exp, sortKey, sortDir]);

  function clickSort(k) {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(1); }
  }
  function exportCsv() {
    const cols = [
      { label: 'Tenant', get: (x) => x.tenant_name }, { label: 'Building', get: (x) => x.building_name },
      { label: 'Address', get: (x) => x.address }, { label: 'Level', get: (x) => x.levels },
      { label: 'Suite', get: (x) => x.suite }, { label: 'Area sqm', get: (x) => x.size_sqm },
      { label: 'Rent pa', get: (x) => rentOf(x) }, { label: 'Expiry', get: (x) => x.expiry_date },
      { label: 'Months to expiry', get: (x) => x.months_to_expiry }, { label: 'Status', get: (x) => x.status },
    ];
    downloadCSV('lease-diary.csv', toCSV(filtered, cols));
  }

  return (
    <>
      <Topbar title="Lease Expiry Diary" sub="Filter by size, expiry window or smart targets">
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add lease</button>
      </Topbar>
      <div className="wrap">
        <div className="filters">
          <select value={bf} onChange={(e) => setBf(e.target.value)}>
            <option value="">All buildings</option>
            {[...new Set(rows.map((x) => x.building_name))].sort().map((b) => <option key={b}>{b}</option>)}
          </select>
          <button
            className={'btn' + (smart ? ' primary' : '')}
            onClick={() => { setSmart((s) => !s); setYear(null); }}
            title="5,000+ m² 3–5yr · 1,000–4,999 m² 2–4yr · <1,000 m² 1–2yr · excludes <6mo"
          >⚡ Smart targets</button>
          <input placeholder="search tenant…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{filtered.length} tenancies{year ? ` · expiring ${year}` : ''}</span>
        </div>
        {!smart && !year && (
          <div className="filters" style={{ marginTop: -6 }}>
            <div className="chipset">
              {SIZE_BANDS.map(([k, lab]) => (
                <button key={k} className={'chip' + (size === k ? ' on' : '')} onClick={() => setSize(k)}>{lab}</button>
              ))}
            </div>
            <div className="chipset">
              {EXP_BANDS.map(([k, lab]) => (
                <button key={k} className={'chip' + (exp === k ? ' on' : '')} onClick={() => setExp(k)}>{lab}</button>
              ))}
            </div>
          </div>
        )}
        {smart && <div className="banner info" style={{ marginTop: 4 }}>Smart targets: 5,000+ m² expiring in 3–5 yrs · 1,000–4,999 m² in 2–4 yrs · under 1,000 m² in 1–2 yrs. Anything under 6 months is excluded (out of runway).</div>}
        <div className="card">
          <div className="bd">
            {loading ? <Loading /> : (
              <table className="cardify">
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
                        <td data-label="Tenant"><div className="t-main">{x.tenant_name}</div></td>
                        <td data-label="Building" onClick={(e) => e.stopPropagation()}>
                          <Link href={'/stack?b=' + encodeURIComponent(x.building_name)} title="Open this building's stack plan">{x.building_name}</Link>
                        </td>
                        <td data-label="Level / Suite">{x.levels || ''}{x.suite ? <span className="t-sub">{x.suite}</span> : null}</td>
                        <td className="num" data-label="m²">{x.size_sqm ? Math.round(x.size_sqm).toLocaleString() : '—'}</td>
                        <td className="num" data-label="Rent p.a.">{money0(rentOf(x))}</td>
                        <td data-label="Next review">{dfmt(x.next_review_date)}</td>
                        <td data-label="Expiry">{dfmt(x.expiry_date)}</td>
                        <td data-label="To expiry"><Pill cls={c}>{l}</Pill></td>
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
