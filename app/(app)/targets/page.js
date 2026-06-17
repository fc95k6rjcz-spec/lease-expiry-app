'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import TenantDrawer from '../../../components/TenantDrawer';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { useLeases, tenantSummaries } from '../../../lib/data';
import { fmt, dfmt } from '../../../lib/format';
import { reasonsList, fragmentedTargets, multiSiteTargets, reasonPill } from '../../../lib/targets';

export default function TargetsPage() {
  const { rows, loading, reload } = useLeases();
  const [tab, setTab] = useState('reasons');
  const [ops, setOps] = useState(false);
  const [sel, setSel] = useState(null);
  const [leaseSel, setLeaseSel] = useState(null);

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const openTenant = (tenant_id) => { const a = accounts.find((x) => x.id === tenant_id); if (a) setSel(a); };

  const reasons = useMemo(() => reasonsList(rows), [rows]);
  const fragmented = useMemo(() => fragmentedTargets(rows), [rows]);
  const multi = useMemo(() => multiSiteTargets(rows, ops), [rows, ops]);

  const TABS = [['reasons', `Reasons to call (${reasons.length})`], ['consolidate', `Consolidation (${fragmented.length + multi.length})`]];

  return (
    <>
      <Topbar title="Targets" sub="Non-obvious reasons to call — straight from the lease terms" />
      <div className="wrap">
        <div className="filters">
          <div className="chipset">
            {TABS.map(([k, lab]) => (
              <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{lab}</button>
            ))}
          </div>
        </div>

        {loading ? <Loading /> : tab === 'reasons' ? (
          <div className="card"><div className="bd">
            <table>
              <thead><tr><th>Tenant</th><th>Building</th><th>Level</th><th className="num">m²</th><th>Reason to call</th><th>Expiry</th></tr></thead>
              <tbody>
                {reasons.slice(0, 400).map((r) => (
                  <tr key={r.id} onClick={() => openTenant(r.tenant_id)}>
                    <td className="t-main">{r.tenant}</td>
                    <td>{r.building}</td>
                    <td>{r.levels || ''}</td>
                    <td className="num">{r.sqm ? Math.round(r.sqm).toLocaleString() : '—'}</td>
                    <td><Pill cls={reasonPill(r.key)}>{r.reason}</Pill></td>
                    <td>{dfmt(r.expiry)}</td>
                  </tr>
                ))}
                {reasons.length === 0 ? <tr><td colSpan={6} className="empty">No lease-event triggers found.</td></tr> : null}
              </tbody>
            </table>
          </div></div>
        ) : (
          <>
            <div className="banner info">Companies in <b>non-contiguous suites</b> in one building, or across <b>multiple buildings</b> — prime consolidation pitches. Click any row to open the tenant and start a pipeline.</div>

            <div className="card">
              <div className="hd"><h2>Fragmented in one building</h2><span className="tag">non-contiguous suites · {fragmented.length}</span></div>
              <div className="bd"><table>
                <thead><tr><th>Tenant</th><th>Building</th><th>Suites</th><th>Levels held</th><th className="num">Total m²</th><th>Next expiry</th></tr></thead>
                <tbody>
                  {fragmented.slice(0, 100).map((z) => (
                    <tr key={z.tenant_id + z.building} onClick={() => openTenant(z.tenant_id)}>
                      <td className="t-main">{z.tenant}</td>
                      <td>{z.building}</td>
                      <td>{z.count}</td>
                      <td>{z.floors.length ? z.floors.map((f) => 'L' + f).join(', ') : z.levelText.join(', ')}</td>
                      <td className="num">{z.sqm ? Math.round(z.sqm).toLocaleString() : '—'}</td>
                      <td>{dfmt(z.nextExpiry)}</td>
                    </tr>
                  ))}
                  {fragmented.length === 0 ? <tr><td colSpan={6} className="empty">No fragmented occupiers found.</td></tr> : null}
                </tbody>
              </table></div>
            </div>

            <div className="card">
              <div className="hd"><h2>Multiple sites in the CBD</h2><span className="tag">{multi.length} occupiers</span>
                <label style={{ marginLeft: 12, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={ops} onChange={(e) => setOps(e.target.checked)} /> include operators
                </label>
              </div>
              <div className="bd"><table>
                <thead><tr><th>Tenant</th><th className="num">Sites</th><th>Where</th><th className="num">Total m²</th><th>Next expiry</th></tr></thead>
                <tbody>
                  {multi.slice(0, 100).map((z) => (
                    <tr key={z.tenant_id} onClick={() => openTenant(z.tenant_id)}>
                      <td className="t-main">{z.tenant}</td>
                      <td className="num">{z.siteCount}</td>
                      <td className="t-sub">{z.buildingList.join(' · ')}</td>
                      <td className="num">{z.sqm ? Math.round(z.sqm).toLocaleString() : '—'}</td>
                      <td>{dfmt(z.nextExpiry)}</td>
                    </tr>
                  ))}
                  {multi.length === 0 ? <tr><td colSpan={5} className="empty">No multi-site occupiers found.</td></tr> : null}
                </tbody>
              </table></div>
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
