'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { SignalForm } from '../../../components/forms';
import LogActionForm from '../../../components/LogActionForm';
import { supabase } from '../../../lib/supabase';
import { useLeases, useTable } from '../../../lib/data';
import { dfmt } from '../../../lib/format';
import { signalAngle } from '../../../lib/angles';
import { AngleBlock } from '../../../components/Angle';

export default function SignalsPage() {
  const { rows: leases } = useLeases();
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const { rows: signals, loading, reload } = useTable('signals', { select: '*', order: { col: 'detected_date', asc: false } });
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState(null); // {tenant_id, signalId}
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();

  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.legal_name])), [tenants]);
  const nextExpiry = useMemo(() => {
    const m = {};
    leases.forEach((x) => {
      if (x.tenant_id && x.months_to_expiry != null && x.months_to_expiry >= 0) {
        if (m[x.tenant_id] == null || x.months_to_expiry < m[x.tenant_id].mte)
          m[x.tenant_id] = { mte: x.months_to_expiry, date: x.expiry_date };
      }
    });
    return m;
  }, [leases]);

  // per-tenant lease context for the "reason to call" angle
  const tenantCtx = useMemo(() => {
    const m = {};
    const today = new Date().toISOString().slice(0, 10);
    leases.forEach((x) => {
      if (!x.tenant_id) return;
      const c = (m[x.tenant_id] = m[x.tenant_id] || { months: null, expiryDate: null, inHoldover: false, optionDue: false });
      const mte = x.months_to_expiry;
      if (mte != null && mte >= 0 && (c.months == null || mte < c.months)) { c.months = mte; c.expiryDate = x.expiry_date; }
      if (String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < today)) c.inHoldover = true;
      if (x.has_renewal_option && mte != null && mte >= 0 && mte <= 24) c.optionDue = true;
    });
    return m;
  }, [leases]);

  const shown = useMemo(
    () => signals.filter((s) => showAll || (s.status || 'active') === 'active'),
    [signals, showAll]
  );
  const closedCount = useMemo(
    () => signals.filter((s) => (s.status || 'active') !== 'active').length,
    [signals]
  );

  async function setStatus(id, status) {
    const { error } = await supabase.from('signals').update({ status }).eq('id', id);
    if (error) return alert(error.message);
    reload();
  }
  async function del(id) {
    if (!confirm('Delete this signal permanently?')) return;
    const { error } = await supabase.from('signals').delete().eq('id', id);
    if (error) return alert(error.message);
    reload();
  }

  return (
    <>
      <Topbar title="Expansion Signals" sub="Trigger events worth a call">
        <button className="btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Hide closed' : `Show closed (${closedCount})`}
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add signal</button>
      </Topbar>
      <div className="wrap">
        <div className="banner info">
          Click a tenant name to open it in the CRM. <b>Log action</b> records the call and sets a follow-up;
          <b> Dismiss</b> closes out signals where a deal is already done or they are already represented. The weekly
          scan keeps appending fresh ones.
        </div>
        {loading ? <Loading /> : shown.length === 0 ? (
          <div className="empty">No {showAll ? '' : 'active '}signals.{!showAll && closedCount > 0 ? ' Closed ones are hidden — use “Show closed”.' : ''}</div>
        ) : (
          <div className="sgrid">
            {shown.map((s) => {
              const exp = nextExpiry[s.tenant_id];
              const st = s.status || 'active';
              const cl = s.impact === 'High' ? 'high' : s.impact === 'Medium' ? 'med' : '';
              return (
                <div key={s.id} className={'scard ' + cl} style={st !== 'active' ? { opacity: 0.6 } : undefined}>
                  <div className="stype">{s.signal_type} · {s.direction}</div>
                  <h4 style={{ cursor: 'pointer' }} onClick={() => router.push('/crm?tenant=' + s.tenant_id)}>
                    {tName[s.tenant_id] || 'Tenant'} <span style={{ color: 'var(--brand)', fontSize: 12 }}>→ CRM</span>
                  </h4>
                  <div className="meta">{s.headline}</div>
                  <div className="meta" style={{ marginTop: 8 }}>
                    {exp ? <>Next expiry <b>{dfmt(exp.date)}</b> · </> : null}
                    {s.magnitude ? s.magnitude + ' · ' : ''}
                    <Pill cls={s.impact === 'High' ? 'p-red' : 'p-amber'}>{s.impact}</Pill>
                    {st !== 'active' ? <span style={{ marginLeft: 8 }}><Pill cls="p-slate">{st}</Pill></span> : null}
                  </div>
                  {st === 'active' ? (
                    <AngleBlock
                      {...signalAngle(s, tenantCtx[s.tenant_id] || {})}
                      compact
                      aiPayload={{
                        tenant: tName[s.tenant_id],
                        tenant_id: s.tenant_id,
                        signal: { signal_type: s.signal_type, direction: s.direction, headline: s.headline, magnitude: s.magnitude },
                        lease: tenantCtx[s.tenant_id] || {},
                      }}
                    />
                  ) : null}
                  <div style={{ marginTop: 12, display: 'flex', gap: 14, fontSize: 12.5 }}>
                    {st === 'active' ? (
                      <>
                        <span style={{ color: 'var(--brand)', cursor: 'pointer', fontWeight: 700 }}
                              onClick={() => setAction({ tenant_id: s.tenant_id, signalId: s.id })}>Log action</span>
                        <span style={{ color: 'var(--muted)', cursor: 'pointer' }} onClick={() => setStatus(s.id, 'dismissed')}>Dismiss</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted)', cursor: 'pointer' }} onClick={() => setStatus(s.id, 'active')}>Reopen</span>
                    )}
                    <span style={{ color: 'var(--red)', cursor: 'pointer', marginLeft: 'auto' }} onClick={() => del(s.id)}>delete</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {adding && <SignalForm tenants={tenants} onClose={() => setAdding(false)} onSaved={reload} />}
      {action && (
        <LogActionForm
          tenant_id={action.tenant_id}
          signalId={action.signalId}
          onClose={() => setAction(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
