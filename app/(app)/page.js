'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../components/Shell';
import { Loading, Pill } from '../../components/ui';
import LeaseDrawer from '../../components/LeaseDrawer';
import { useLeases, useTable, buildingSummaries } from '../../lib/data';
import { fmt, money, money0, expClass, rentOf, dfmt } from '../../lib/format';
import { criticalDates } from '../../lib/crm';
import { rentBenchmarks, benchmark, opportunityScore } from '../../lib/score';
import { fragmentedTargets, multiSiteTargets } from '../../lib/targets';

const whyOf = (bd) => {
  const interesting = bd.filter((f) => !['Size / commission', 'Contactable', 'Lease timing'].includes(f.label));
  return (interesting.length ? interesting : bd).slice(0, 2).map((f) => f.label).join(' · ');
};

export default function Dashboard() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const { rows: signals } = useTable('signals', { select: '*' });
  const { rows: acts } = useTable('interactions', { select: '*' });
  const { rows: contacts } = useTable('contacts', { select: 'tenant_id' });
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
  const clientItems = useMemo(() => {
    const items = [];
    rows.forEach((x) => {
      if (x.tenant_obj?.relationship === 'Client') {
        const cd = criticalDates(x)[0];
        if (cd) items.push({ id: x.id, tenant: x.tenant_name, building: x.building_name, type: cd.type, date: cd.date, tenant_id: x.tenant_id });
      }
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 10);
  }, [rows]);

  const bm = useMemo(() => rentBenchmarks(rows), [rows]);
  const oppSets = useMemo(() => {
    const exp = new Set(signals.filter((s) => s.direction === 'Expansion' && (s.status || 'active') === 'active').map((s) => s.tenant_id));
    const contact = new Set(contacts.map((c) => c.tenant_id));
    const need = new Set([...fragmentedTargets(rows).map((z) => z.tenant_id), ...multiSiteTargets(rows, true).map((z) => z.tenant_id)]);
    return { exp, contact, need };
  }, [rows, signals, contacts]);
  const topLeads = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const best = {};
    rows.forEach((x) => {
      if (!x.tenant_id) return;
      const mte = x.months_to_expiry;
      const b = benchmark(x, bm);
      const ctx = {
        inHoldover: String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < today),
        optionDue: x.has_renewal_option && mte != null && mte >= 0 && mte <= 24,
        hasExpansionSignal: oppSets.exp.has(x.tenant_id),
        contactable: oppSets.contact.has(x.tenant_id),
        fragmentedOrMulti: oppSets.need.has(x.tenant_id),
        benchmarkPct: b ? b.pct : null,
      };
      const sc = opportunityScore(x, ctx);
      if (!best[x.tenant_id] || sc.score > best[x.tenant_id].score) best[x.tenant_id] = { lease: x, ...sc };
    });
    return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [rows, bm, oppSets]);
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
        <div className="card" style={{ borderColor: 'rgba(227,210,164,.35)' }}>
          <div className="hd"><h2>Today’s top leads</h2><span className="tag" style={{ color: '#e3d2a4' }}>ranked by opportunity · updates as new signals land</span></div>
          <div className="bd pad">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {topLeads.map((r, i) => (
                <div key={r.lease.tenant_id} onClick={() => router.push('/crm?tenant=' + r.lease.tenant_id)}
                  style={{ cursor: 'pointer', background: 'linear-gradient(180deg,var(--panel2),var(--panel))', border: '1px solid rgba(227,210,164,.25)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 27, fontWeight: 800, color: '#e3d2a4', letterSpacing: '-.5px' }}>{r.score}</div>
                    <div className="t-sub">#{i + 1}</div>
                  </div>
                  <div className="t-main" style={{ marginTop: 4 }}>{r.lease.tenant_name}</div>
                  <div className="t-sub">{whyOf(r.breakdown)}</div>
                  <div className="t-sub" style={{ marginTop: 6 }}>{r.lease.building_name}{r.lease.size_sqm ? ' · ' + Math.round(r.lease.size_sqm).toLocaleString() + ' m²' : ''} · exp {dfmt(r.lease.expiry_date)}</div>
                </div>
              ))}
              {topLeads.length === 0 ? <div className="t-sub">Load data to see ranked leads.</div> : null}
            </div>
          </div>
        </div>
        {clientItems.length > 0 && (
          <div className="card">
            <div className="hd"><h2>My Clients — upcoming critical dates</h2><span className="tag">your portfolio · stay proactive</span></div>
            <div className="bd">
              <table>
                <thead><tr><th>Client</th><th>Building</th><th>Critical date</th><th>When</th></tr></thead>
                <tbody>
                  {clientItems.map((c) => (
                    <tr key={c.id} onClick={() => router.push('/crm?tenant=' + c.tenant_id)}>
                      <td className="t-main">{c.tenant}</td>
                      <td>{c.building}</td>
                      <td><Pill cls="p-slate">{c.type}</Pill></td>
                      <td>{dfmt(c.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                  <div key={b.id || b.name} className="minirow" onClick={() => router.push('/stack?b=' + encodeURIComponent(b.name))}>
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
            <div className="card">
              <div className="hd"><h2>Follow-ups</h2><span className="tag">upcoming</span></div>
              <div className="bd pad">
                {acts
                  .filter((a) => a.next_action_date && a.next_action_date >= new Date().toISOString().slice(0, 10))
                  .sort((a, b) => (a.next_action_date < b.next_action_date ? -1 : 1))
                  .slice(0, 6)
                  .map((a) => (
                    <div key={a.id} className="minirow" onClick={() => router.push('/crm?tenant=' + a.tenant_id)}>
                      <span><b>{(tenants.find((t) => t.id === a.tenant_id) || {}).legal_name || 'Tenant'}</b><br /><span className="t-sub">{a.next_action || a.type}</span></span>
                      <Pill cls="p-amber">{dfmt(a.next_action_date)}</Pill>
                    </div>
                  ))}
                {acts.filter((a) => a.next_action_date && a.next_action_date >= new Date().toISOString().slice(0, 10)).length === 0 ? (
                  <div className="t-sub">No upcoming follow-ups. Log an action from a Signal or Tenant.</div>
                ) : null}
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
