'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { SignalForm } from '../../../components/forms';
import { supabase } from '../../../lib/supabase';
import { useLeases, useTable } from '../../../lib/data';
import { dfmt } from '../../../lib/format';

export default function SignalsPage() {
  const { rows: leases } = useLeases();
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const { rows: signals, loading, reload } = useTable('signals', { select: '*', order: { col: 'detected_date', asc: false } });
  const [adding, setAdding] = useState(false);

  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.legal_name])), [tenants]);
  const nextExpiry = useMemo(() => {
    const m = {};
    leases.forEach((x) => {
      if (x.tenant_id && x.months_to_expiry != null && x.months_to_expiry >= 0) {
        if (m[x.tenant_id] == null || x.months_to_expiry < m[x.tenant_id].mte) m[x.tenant_id] = { mte: x.months_to_expiry, date: x.expiry_date, area: x.size_sqm };
      }
    });
    return m;
  }, [leases]);

  async function del(id) {
    if (!confirm('Delete this signal?')) return;
    const { error } = await supabase.from('signals').delete().eq('id', id);
    if (error) return alert(error.message);
    reload();
  }

  return (
    <>
      <Topbar title="Expansion Signals" sub="Trigger events worth a call">
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add signal</button>
      </Topbar>
      <div className="wrap">
        <div className="banner info">Signals flag tenants that are growing — headcount, hiring, M&amp;A, funding, new contracts. Pair a signal with a near-term expiry and it&apos;s a priority call. A scheduled job can append these automatically once sources are agreed.</div>
        {loading ? <Loading /> : signals.length === 0 ? (
          <div className="empty">No signals yet. Add one, or wire up an automated scan.</div>
        ) : (
          <div className="sgrid">
            {signals.map((s) => {
              const exp = nextExpiry[s.tenant_id];
              const cl = s.impact === 'High' ? 'high' : s.impact === 'Medium' ? 'med' : '';
              return (
                <div key={s.id} className={'scard ' + cl}>
                  <div className="stype">{s.signal_type} · {s.direction}</div>
                  <h4>{tName[s.tenant_id] || 'Tenant'}</h4>
                  <div className="meta">{s.headline}</div>
                  <div className="meta" style={{ marginTop: 8 }}>
                    {exp ? <>Next expiry <b>{dfmt(exp.date)}</b> · </> : null}
                    {s.magnitude ? s.magnitude + ' · ' : ''}
                    <Pill cls={s.impact === 'High' ? 'p-red' : 'p-amber'}>{s.impact}</Pill>
                    <span style={{ marginLeft: 10, cursor: 'pointer', color: 'var(--red)', fontSize: 12 }} onClick={() => del(s.id)}>delete</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {adding && <SignalForm tenants={tenants} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
