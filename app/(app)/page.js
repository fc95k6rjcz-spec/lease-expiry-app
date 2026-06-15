'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../components/Shell';
import { Loading, Pill } from '../../components/ui';
import LeaseDrawer from '../../components/LeaseDrawer';
import { useLeases, useTable, buildingSummaries } from '../../lib/data';
import { fmt, money, money0, expClass, rentOf } from '../../lib/format';

export default function Dashboard() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const { rows: signals } = useTable('signals', { select: '*' });
  const [sel, setSel] = useState(null);
  const router = useRouter();

  const kpi = useMemo(() => {
    const area = rows.reduce((a, x) => a + (Number(x.size_sqm) || 0), 0);
    const rent = rows.reduce((a, x) => a + (Number(rentOf(x)) || 0), 0);
    const within = (n) => rows.filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= n).length;
    return { leases: rows.length, area, rent, exp12: within(12), exp24: within(24), contact: rows.filter((x) => x.tenant_obj?.website || x.tenant_obj?.linkedin_url).length };
  }, [rows]);

  const hist = useMemo(() => {
    const y = {};
    rows.forEach((x) => {
      if (x.expiry_date) {
        const yr = +String(x.expiry_date).slice(0, 4);
        if (yr >= 2024 && yr <= 2035) y[yr] = (y[yr] || 0) + 1;
      }
    });
    return Object.keys(y).map(Number).sort().map((yr) => ({ year: yr, count: y[yr] }));
  }, [rows]);

  const sigTenants = useMemo(() => new Set(signals.map((s) => s.tenant_id)), [signals]);
  const hot = useMemo(
    () =>
      rows
        .filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= 24 && x.size_sqm)
        .sort((a, b) => (sigTenants.has(b.tenant_id) - sigTenants.has(a.tenant_id)) || a.months_to_expiry - b.months_to_expiry)
        .slice(0, 12),
    [rows, sigTenants]
  );
  const topB = useMemo(() => buildingSummaries(rows).slice(0, 6), [rows]);
  const maxH = Math.max(1, ...hist.map((h) => h.count));

  if (loading) return (<><Topbar title="Dashboard" sub="Portfolio overview" /><div className="wrap"><Loading /></div></>);

  const cards = [
    ['Tenancies', fmt(kpi.leases), buildings.length + ' buildings', ''],
    ['Total NLA', fmt(Math.round(kpi.area)) + ' m²', 'leased area', ''],
    ['Rent roll', money(kpi.rent), 'p.a. tracked', ''],
    ['Expiring ≤ 12 mo', fmt(kpi.exp12), 'act now', 'alert'],
    ['Expiring ≤ 24 mo', fmt(kpi.exp24), 'pipeline', 'warn'],
    ['Signals live', fmt(signals.length), 'tenants flagged', ''],
  ];

  return (
    <>
      <Topbar title="Dashboard" sub="Portfolio overview" />
      <div className="wrap">
        <div className="kpis">
          {cards.map((c) => (
            <div key={c[0]} className={'kpi ' + c[3]}>
              <div className="lab">{c[0]}</div>
              <div className="val">{c[1]}</div>
              <div className="hint">{c[2]}</div>
            </div>
          ))}
        </div>
        <div className="grid2">
          <div>
            <div className="card">
              <div className="hd"><h2>Lease expiries by year</h2><span className="tag">click to open the diary</span></div>
              <div className="chart">
                {hist.map((h) => (
                  <div
                    key={h.year}
                    className={'bar ' + (h.year <= new Date().getFullYear() + 1 ? 'near' : '')}
                    title={h.count + ' expire in ' + h.year}
                    onClick={() => router.push('/diary?year=' + h.year)}
                  >
                    <div className="n">{h.count}</div>
                    <div className="col" style={{ height: Math.max(4, (h.count / maxH) * 150) }} />
                    <div className="y">{h.year}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="hd"><h2>Hot prospects</h2><span className="tag">≤ 24 mo · signal-ranked</span></div>
              <div className="bd">
                <table>
                  <thead><tr><th>Tenant</th><th className="num">m²</th><th className="num">Rent p.a.</th><th>Expiry</th><th></th></tr></thead>
                  <tbody>
                    {hot.map((x) => {
                      const [c, l] = expClass(x.months_to_expiry);
                      return (
                        <tr key={x.id} onClick={() => setSel(x)}>
                          <td><div className="t-main">{x.tenant_name}</div><div className="t-sub">{x.building_name} · {x.levels || ''}</div></td>
                          <td className="num">{x.size_sqm ? Math.round(x.size_sqm).toLocaleString() : '—'}</td>
                          <td className="num">{money0(rentOf(x))}</td>
                          <td><Pill cls={c}>{l}</Pill></td>
                          <td>{sigTenants.has(x.tenant_id) ? <Pill cls="p-green">▲ signal</Pill> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <div className="card">
              <div className="hd"><h2>Largest buildings</h2></div>
              <div className="bd pad">
                {topB.map((b) => (
                  <div key={b.name} className="minirow" onClick={() => router.push('/stack?b=' + encodeURIComponent(b.name))}>
                    <span><b>{b.name}</b> · {b.leases} tenancies</span>
                    <span>{fmt(Math.round(b.area))} m²</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="hd"><h2>Recent signals</h2></div>
              <div className="bd pad">
                {signals.slice(0, 6).map((s) => (
                  <div key={s.id} className="minirow" onClick={() => router.push('/signals')}>
                    <span><b>{(tenants.find((t) => t.id === s.tenant_id) || {}).legal_name || 'Tenant'}</b><br /><span className="t-sub">{s.signal_type}</span></span>
                    <Pill cls={s.impact === 'High' ? 'p-red' : 'p-amber'}>{s.impact}</Pill>
                  </div>
                ))}
                {signals.length === 0 ? <div className="t-sub">No signals yet — add them on the Signals page.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {sel && (
        <LeaseDrawer lease={sel} buildings={buildings} tenants={tenants} onClose={() => setSel(null)} onChanged={reload} />
      )}
    </>
  );
}
