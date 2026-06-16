'use client';
import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import TenantDrawer from '../../../components/TenantDrawer';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { TenantForm } from '../../../components/forms';
import { useLeases, useTable, tenantSummaries } from '../../../lib/data';
import { fmt } from '../../../lib/format';
import { relPill, currentStage } from '../../../lib/crm';

const TABS = ['All', 'Prospect', 'Client', 'Competitor', 'Lost', 'Untracked'];

export default function CrmPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [sel, setSel] = useState(null);
  const [leaseSel, setLeaseSel] = useState(null);
  const [adding, setAdding] = useState(false);

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const relOf = (t) => t.tenant_obj?.relationship || null;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tenant');
    if (p && accounts.length) {
      const a = accounts.find((x) => x.id === p);
      if (a) setSel(a);
    }
  }, [accounts]);

  const counts = useMemo(() => {
    const c = { Prospect: 0, Client: 0, Competitor: 0, Lost: 0, Untracked: 0 };
    accounts.forEach((t) => { const r = relOf(t); c[r || 'Untracked'] = (c[r || 'Untracked'] || 0) + 1; });
    return c;
  }, [accounts]);

  const list = useMemo(() => {
    let r = accounts;
    if (tab !== 'All') r = r.filter((t) => (tab === 'Untracked' ? !relOf(t) : relOf(t) === tab));
    if (q) r = r.filter((t) => (t.name || '').toLowerCase().includes(q.toLowerCase()));
    // tracked first, then by area
    return r.slice().sort((a, b) => (!!relOf(b) - !!relOf(a)) || b.area - a.area).slice(0, 160);
  }, [accounts, tab, q]);

  return (
    <>
      <Topbar title="Tenants / CRM" sub="Accounts, pipeline & decision-makers">
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add tenant</button>
      </Topbar>
      <div className="wrap">
        <div className="filters">
          <div className="chipset">
            {TABS.map((t) => (
              <button key={t} className={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
                {t}{t !== 'All' ? ` (${counts[t] || 0})` : ''}
              </button>
            ))}
          </div>
          <input placeholder="search tenant…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <span className="count">{list.length} shown</span>
        </div>
        {loading ? <Loading /> : (
          <div className="bgrid">
            {list.map((t) => {
              const rel = relOf(t);
              const stage = currentStage(t.tenant_obj?.pipeline);
              return (
                <div key={t.id} className="bcard" onClick={() => setSel(t)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, flex: 1 }}>{t.name}</h3>
                    {rel ? <Pill cls={relPill(rel)}>{rel}</Pill> : null}
                  </div>
                  <div className="addr">{rel === 'Prospect' && stage ? 'Stage: ' + stage + ' · ' : ''}{[...t.buildings].slice(0, 2).join(' · ')}{t.buildings.size > 2 ? ' +' + (t.buildings.size - 2) : ''}</div>
                  <div className="row">
                    <div className="stat">{t.leases.length}<small>Tenancies</small></div>
                    <div className="stat">{fmt(Math.round(t.area))}<small>m² total</small></div>
                    <div className="stat">{t.buildings.size}<small>Buildings</small></div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 ? <div className="empty">No tenants in this view.</div> : null}
          </div>
        )}
      </div>
      {sel && (
        <TenantDrawer
          account={sel}
          onClose={() => setSel(null)}
          onChanged={reload}
          onOpenLease={(x) => { setSel(null); setLeaseSel(x); }}
        />
      )}
      {leaseSel && <LeaseDrawer lease={leaseSel} buildings={buildings} tenants={tenants} onClose={() => setLeaseSel(null)} onChanged={reload} />}
      {adding && <TenantForm onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
