'use client';
import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading } from '../../../components/ui';
import TenantDrawer from '../../../components/TenantDrawer';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { TenantForm } from '../../../components/forms';
import { useLeases, useTable, tenantSummaries } from '../../../lib/data';
import { fmt } from '../../../lib/format';

export default function CrmPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [leaseSel, setLeaseSel] = useState(null);
  const [adding, setAdding] = useState(false);

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tenant');
    if (p && accounts.length) {
      const a = accounts.find((x) => x.id === p);
      if (a) setSel(a);
    }
  }, [accounts]);

  const list = useMemo(
    () => accounts.filter((t) => !q || (t.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 120),
    [accounts, q]
  );

  return (
    <>
      <Topbar title="Tenants / CRM" sub="Accounts and decision-maker contacts">
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add tenant</button>
      </Topbar>
      <div className="wrap">
        <div className="banner">Add the two key decision-makers (CEO/CFO or foreign equivalent) per tenant — open a card, then <b>+ Add</b> under Decision-makers. Source from LinkedIn / Lusha.</div>
        <div className="filters">
          <input placeholder="search tenant…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
          <span className="count">{accounts.length} tenants</span>
        </div>
        {loading ? <Loading /> : (
          <div className="bgrid">
            {list.map((t) => (
              <div key={t.id} className="bcard" onClick={() => setSel(t)}>
                <h3>{t.name}</h3>
                <div className="addr">{[...t.buildings].slice(0, 2).join(' · ')}{t.buildings.size > 2 ? ' +' + (t.buildings.size - 2) : ''}</div>
                <div className="row">
                  <div className="stat">{t.leases.length}<small>Tenancies</small></div>
                  <div className="stat">{fmt(Math.round(t.area))}<small>m² total</small></div>
                  <div className="stat">{t.buildings.size}<small>Buildings</small></div>
                </div>
              </div>
            ))}
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
