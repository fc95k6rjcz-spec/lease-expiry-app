'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/data';
import { useAuth } from '../../../lib/auth';
import { sourceConf, confidenceBand } from '../../../lib/sources';
import { dfmt } from '../../../lib/format';

export default function ReviewPage() {
  const { rows, loading, reload } = useTable('pending_occupiers', { select: '*', order: { col: 'created_at', asc: false } });
  const { user } = useAuth();
  const [filter, setFilter] = useState('pending');
  const [edits, setEdits] = useState({});
  const [busyId, setBusyId] = useState(null);

  const list = useMemo(() => rows.filter((r) => (filter === 'all' ? true : r.status === filter)), [rows, filter]);
  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows]);

  const val = (p, f) => (edits[p.id]?.[f] !== undefined ? edits[p.id][f] : (p[f] || ''));
  const setVal = (id, f, v) => setEdits((s) => ({ ...s, [id]: { ...s[id], [f]: v } }));

  async function approve(p) {
    setBusyId(p.id);
    try {
      let buildingId = p.building_id;
      if (!buildingId) {
        const bn = val(p, 'building_name').trim();
        const ba = val(p, 'street_address').trim();
        let found = null;
        if (bn) { const { data } = await supabase.from('buildings').select('id').ilike('name', bn).limit(1); found = data?.[0]; }
        if (!found && ba) { const { data } = await supabase.from('buildings').select('id').ilike('street_address', ba).limit(1); found = data?.[0]; }
        if (found) buildingId = found.id;
        else {
          const { data, error } = await supabase.from('buildings').insert({ name: bn || null, street_address: ba || bn || null, market: val(p, 'market') || null }).select('id').single();
          if (error) throw error;
          buildingId = data.id;
        }
      }
      const tn = val(p, 'tenant_name').trim();
      let tenantId = null;
      { const { data } = await supabase.from('tenants').select('id').ilike('legal_name', tn).limit(1); tenantId = data?.[0]?.id; }
      if (!tenantId) {
        const { data, error } = await supabase.from('tenants').insert({ legal_name: tn, source: p.source }).select('id').single();
        if (error) throw error;
        tenantId = data.id;
      }
      const { error: le } = await supabase.from('leases').insert({ building_id: buildingId, tenant_id: tenantId, levels: val(p, 'floor') || null, suite: val(p, 'suite') || null, status: 'Active' });
      if (le) throw le;
      await supabase.from('pending_occupiers').update({
        status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.email || null,
        tenant_name: tn, floor: val(p, 'floor'), suite: val(p, 'suite'), building_name: val(p, 'building_name'), market: val(p, 'market'),
      }).eq('id', p.id);
      reload();
    } catch (e) { alert(e.message || e); } finally { setBusyId(null); }
  }

  async function reject(p) {
    setBusyId(p.id);
    await supabase.from('pending_occupiers').update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.email || null }).eq('id', p.id);
    setBusyId(null); reload();
  }

  return (
    <>
      <Topbar title="Review queue" sub="Verify scanned & researched occupiers before they go official" />
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="filters">
          {[['pending', `Pending (${counts.pending})`], ['approved', `Approved (${counts.approved})`], ['rejected', `Rejected (${counts.rejected})`], ['all', 'All']].map(([k, lab]) => (
            <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{lab}</button>
          ))}
        </div>
        {loading ? <Loading /> : list.length === 0 ? (
          <div className="empty">Nothing {filter === 'all' ? '' : filter} here. Scan a board or send Bulk Research unknowns to fill the queue.</div>
        ) : list.map((p) => {
          const sc = sourceConf(p.source);
          const [band, bandCls] = confidenceBand(p.confidence ?? sc.conf);
          const editable = p.status === 'pending';
          return (
            <div className="card" key={p.id} style={{ marginBottom: 12 }}>
              <div className="bd pad" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {p.image_url ? <a href={p.image_url} target="_blank" rel="noreferrer"><img src={p.image_url} alt="source" style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} /></a> : null}
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Pill cls="p-slate">{sc.label}</Pill>
                    <Pill cls={bandCls}>{band} · {Math.round((p.confidence ?? sc.conf) * 100)}%</Pill>
                    {p.status !== 'pending' ? <Pill cls={p.status === 'approved' ? 'p-green' : 'p-red'}>{p.status}</Pill> : null}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
                    <label className="t-sub">Tenant<input value={val(p, 'tenant_name')} onChange={(e) => setVal(p.id, 'tenant_name', e.target.value)} disabled={!editable} style={{ width: '100%' }} /></label>
                    <label className="t-sub">Floor<input value={val(p, 'floor')} onChange={(e) => setVal(p.id, 'floor', e.target.value)} disabled={!editable} style={{ width: '100%' }} /></label>
                    <label className="t-sub">Suite<input value={val(p, 'suite')} onChange={(e) => setVal(p.id, 'suite', e.target.value)} disabled={!editable} style={{ width: '100%' }} /></label>
                    <label className="t-sub">Building<input value={val(p, 'building_name')} onChange={(e) => setVal(p.id, 'building_name', e.target.value)} disabled={!editable} style={{ width: '100%' }} /></label>
                    <label className="t-sub">Market<input value={val(p, 'market')} onChange={(e) => setVal(p.id, 'market', e.target.value)} disabled={!editable} style={{ width: '100%' }} /></label>
                  </div>
                  {p.notes ? <div className="t-sub" style={{ marginTop: 6 }}>{p.notes}</div> : null}
                  {p.status === 'pending' ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                      <button className="btn primary" onClick={() => approve(p)} disabled={busyId === p.id}>{busyId === p.id ? '…' : '✓ Approve → stack plan'}</button>
                      <button className="btn" style={{ color: 'var(--red)' }} onClick={() => reject(p)} disabled={busyId === p.id}>Reject</button>
                    </div>
                  ) : (
                    <div className="t-sub" style={{ marginTop: 8 }}>{p.reviewed_by ? p.reviewed_by + ' · ' : ''}{dfmt(p.reviewed_at)}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
