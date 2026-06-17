'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import TenantDrawer from '../../../components/TenantDrawer';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { useLeases, useTable, tenantSummaries } from '../../../lib/data';
import { fmt, dfmt } from '../../../lib/format';
import { fragmentedTargets, multiSiteTargets } from '../../../lib/targets';
import { rentBenchmarks, benchmark, opportunityScore, availableSpace, spaceNeeders, matchSize } from '../../../lib/score';

const today = () => new Date().toISOString().slice(0, 10);
const isHoldover = (x) => String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < today());

export default function OpportunitiesPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: signals } = useTable('signals', { select: 'tenant_id,direction,status' });
  const { rows: contacts } = useTable('contacts', { select: 'tenant_id' });
  const [tab, setTab] = useState('ranked');
  const [sel, setSel] = useState(null);
  const [leaseSel, setLeaseSel] = useState(null);

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const openTenant = (id) => { const a = accounts.find((x) => x.id === id); if (a) setSel(a); };

  const ctxSets = useMemo(() => {
    const exp = new Set(signals.filter((s) => s.direction === 'Expansion' && (s.status || 'active') === 'active').map((s) => s.tenant_id));
    const con = new Set(signals.filter((s) => s.direction === 'Contraction').map((s) => s.tenant_id));
    const contact = new Set(contacts.map((c) => c.tenant_id));
    const frag = fragmentedTargets(rows);
    const multi = multiSiteTargets(rows, true);
    const fragBuildings = new Set(frag.map((z) => z.tenant_id + '|' + z.building));
    const need = new Set([...frag.map((z) => z.tenant_id), ...multi.map((z) => z.tenant_id)]);
    return { exp, con, contact, fragBuildings, need };
  }, [rows, signals, contacts]);

  const bm = useMemo(() => rentBenchmarks(rows), [rows]);

  const ranked = useMemo(() => {
    const best = {};
    rows.forEach((x) => {
      if (!x.tenant_id) return;
      const m = x.months_to_expiry;
      const b = benchmark(x, bm);
      const ctx = {
        inHoldover: isHoldover(x),
        optionDue: x.has_renewal_option && m != null && m >= 0 && m <= 24,
        hasExpansionSignal: ctxSets.exp.has(x.tenant_id),
        contactable: ctxSets.contact.has(x.tenant_id),
        fragmentedOrMulti: ctxSets.need.has(x.tenant_id),
        benchmarkPct: b ? b.pct : null,
      };
      const sc = opportunityScore(x, ctx);
      const prev = best[x.tenant_id];
      if (!prev || sc.score > prev.score) best[x.tenant_id] = { lease: x, ...sc, bench: b };
    });
    return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 150);
  }, [rows, bm, ctxSets]);

  const avail = useMemo(() => availableSpace(rows, ctxSets.con, ctxSets.fragBuildings).slice(0, 40), [rows, ctxSets]);
  const needers = useMemo(() => spaceNeeders(rows, ctxSets.exp, ctxSets.need), [rows, ctxSets]);

  const scoreColor = (s) => (s >= 70 ? 'p-red' : s >= 45 ? 'p-amber' : 'p-slate');

  return (
    <>
      <Topbar title="Opportunities" sub="The whole market, ranked — and who needs whose space" />
      <div className="wrap">
        <div className="filters">
          <div className="chipset">
            <button className={'chip' + (tab === 'ranked' ? ' on' : '')} onClick={() => setTab('ranked')}>Ranked ({ranked.length})</button>
            <button className={'chip' + (tab === 'match' ? ' on' : '')} onClick={() => setTab('match')}>Matchmaking ({avail.length})</button>
          </div>
        </div>

        {loading ? <Loading /> : tab === 'ranked' ? (
          <div className="card"><div className="bd">
            <table>
              <thead><tr><th className="num">Score</th><th>Tenant</th><th>Building</th><th className="num">m²</th><th>Why</th><th>$/m² vs mkt</th><th>Expiry</th></tr></thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.lease.tenant_id} onClick={() => openTenant(r.lease.tenant_id)}>
                    <td className="num"><Pill cls={scoreColor(r.score)}>{r.score}</Pill></td>
                    <td className="t-main">{r.lease.tenant_name}</td>
                    <td>{r.lease.building_name}</td>
                    <td className="num">{r.lease.size_sqm ? Math.round(r.lease.size_sqm).toLocaleString() : '—'}</td>
                    <td><span className="t-sub">{r.breakdown.slice(0, 3).map((f) => f.label).join(' · ')}</span></td>
                    <td>{r.bench ? <span style={{ color: r.bench.pct > 5 ? 'var(--red)' : r.bench.pct < -5 ? 'var(--green)' : 'var(--muted)' }}>{r.bench.pct > 0 ? '+' : ''}{r.bench.pct}%</span> : '—'}</td>
                    <td>{dfmt(r.lease.expiry_date)}</td>
                  </tr>
                ))}
                {ranked.length === 0 ? <tr><td colSpan={7} className="empty">No scored opportunities.</td></tr> : null}
              </tbody>
            </table>
          </div></div>
        ) : (
          <>
            <div className="banner info">Floors likely to come available (expiring, holdover, contracting, or consolidating) matched to tenants who need that much space (growing or fragmented). Broker both sides of the move.</div>
            <div className="bgrid" style={{ gridTemplateColumns: '1fr' }}>
              {avail.map((a) => {
                const matches = needers.filter((n) => n.tenant_id !== a.tenant_id && matchSize(Number(a.size_sqm), n.sqm)).slice(0, 4);
                return (
                  <div key={a.id} className="bcard" style={{ cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0 }} onClick={() => openTenant(a.tenant_id)}>{a.tenant_name}</h3>
                      <span className="t-sub">{a.building_name} · {a.levels || ''} · <b>{a.size_sqm ? Math.round(a.size_sqm).toLocaleString() + ' m²' : '—'}</b></span>
                      {a.why.map((w) => <Pill key={w} cls="p-amber">{w}</Pill>)}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12.5 }}>
                      <span className="t-sub">Could suit: </span>
                      {matches.length ? matches.map((n) => (
                        <span key={n.tenant_id} onClick={() => openTenant(n.tenant_id)} style={{ cursor: 'pointer', marginRight: 10, color: 'var(--brand)' }}>
                          {n.tenant} ({fmt(Math.round(n.sqm))} m²)
                        </span>
                      )) : <span className="t-sub">no size-matched needers</span>}
                    </div>
                  </div>
                );
              })}
              {avail.length === 0 ? <div className="empty">No space-availability signals yet.</div> : null}
            </div>
          </>
        )}
      </div>
      {sel && (
        <TenantDrawer account={sel} onClose={() => setSel(null)} onChanged={reload}
          onOpenLease={(x) => { setSel(null); setLeaseSel(x); }} />
      )}
      {leaseSel && <LeaseDrawer lease={leaseSel} buildings={[]} tenants={[]} onClose={() => setLeaseSel(null)} onChanged={reload} />}
    </>
  );
}
