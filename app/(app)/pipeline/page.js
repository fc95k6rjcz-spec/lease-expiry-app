'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import TenantDrawer from '../../../components/TenantDrawer';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { useLeases, tenantSummaries } from '../../../lib/data';
import { fmt } from '../../../lib/format';
import { PIPELINE_STEPS, currentStage } from '../../../lib/crm';

const COLUMNS = ['Identified', ...PIPELINE_STEPS];

export default function PipelinePage() {
  const { rows, loading, reload } = useLeases();
  const [sel, setSel] = useState(null);
  const [leaseSel, setLeaseSel] = useState(null);

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const prospects = useMemo(() => accounts.filter((t) => t.tenant_obj?.relationship === 'Prospect'), [accounts]);
  const clients = useMemo(() => accounts.filter((t) => t.tenant_obj?.relationship === 'Client').length, [accounts]);
  const lost = useMemo(() => accounts.filter((t) => ['Lost', 'Competitor'].includes(t.tenant_obj?.relationship)).length, [accounts]);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    prospects.forEach((t) => { m[currentStage(t.tenant_obj?.pipeline) || 'Identified'].push(t); });
    return m;
  }, [prospects]);

  return (
    <>
      <Topbar title="Prospect Pipeline" sub={`${prospects.length} prospects · ${clients} clients · ${lost} lost`} />
      <div className="wrap">
        {loading ? <Loading /> : prospects.length === 0 ? (
          <div className="empty">No prospects yet. Open a tenant in the CRM and tag it <b>Prospect</b>, then tick pipeline steps as you progress.</div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
            {COLUMNS.map((col) => (
              <div key={col} style={{ minWidth: 230, flex: '0 0 230px' }}>
                <div className="sec-t" style={{ marginTop: 0 }}>{col} <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{byStage[col].length}</span></div>
                {byStage[col].map((t) => (
                  <div key={t.id} className="bcard" style={{ marginBottom: 10, padding: 12 }} onClick={() => setSel(t)}>
                    <h3 style={{ fontSize: 13.5, margin: '0 0 4px' }}>{t.name}</h3>
                    <div className="t-sub">{fmt(Math.round(t.area))} m² · {t.leases.length} {t.leases.length === 1 ? 'lease' : 'leases'}</div>
                    {col === 'Contract' ? <div style={{ marginTop: 6 }}><Pill cls="p-amber">close to won</Pill></div> : null}
                  </div>
                ))}
                {byStage[col].length === 0 ? <div className="t-sub" style={{ padding: '4px 2px' }}>—</div> : null}
              </div>
            ))}
          </div>
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
