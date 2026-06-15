'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading } from '../../../components/ui';
import { BuildingForm } from '../../../components/forms';
import { useLeases, useTable, buildingSummaries } from '../../../lib/data';
import { fmt } from '../../../lib/format';

export default function BuildingsPage() {
  const { rows, loading } = useLeases();
  const { rows: dbBuildings, reload } = useTable('buildings', { select: '*' });
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const router = useRouter();

  // merge lease-derived stats onto the building records
  const summaries = useMemo(() => buildingSummaries(rows), [rows]);
  const byName = useMemo(() => Object.fromEntries(summaries.map((s) => [s.name, s])), [summaries]);
  const list = useMemo(() => {
    const base = dbBuildings.map((b) => {
      const s = byName[b.name || b.street_address] || {};
      return {
        ...b, _name: b.name || b.street_address,
        leases: s.leases || 0, area: s.area || b.total_lettable_area_sqm || 0,
        levels: s.levels || b.num_levels || 0, exp24: s.exp24 || 0,
      };
    });
    const f = q ? base.filter((b) => (b._name + ' ' + (b.street_address || '')).toLowerCase().includes(q.toLowerCase())) : base;
    return f.sort((a, b) => b.leases - a.leases);
  }, [dbBuildings, byName, q]);

  return (
    <>
      <Topbar title="Buildings" sub="Stack-plan & building data">
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add building</button>
      </Topbar>
      <div className="wrap">
        <div className="filters">
          <input placeholder="search building / address…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <span className="count">{list.length} buildings</span>
        </div>
        {loading ? <Loading /> : (
          <div className="bgrid">
            {list.map((b) => (
              <div key={b.id} className="bcard">
                <div onClick={() => router.push('/stack?b=' + encodeURIComponent(b._name))}>
                  <h3>{b._name}</h3>
                  <div className="addr">{b.street_address || ''}</div>
                  <div className="row">
                    <div className="stat">{b.leases}<small>Tenancies</small></div>
                    <div className="stat">{fmt(Math.round(b.area))}<small>m² NLA</small></div>
                    <div className="stat">{b.levels}<small>Levels</small></div>
                    <div className="stat" style={{ color: b.exp24 ? 'var(--amber)' : undefined }}>{b.exp24}<small>Exp ≤24mo</small></div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => setEditing(b)}>Edit details</button>
                </div>
              </div>
            ))}
            {list.length === 0 ? <div className="empty">No buildings yet. Add one, or import a CityScope export.</div> : null}
          </div>
        )}
      </div>
      {adding && <BuildingForm onClose={() => setAdding(false)} onSaved={reload} />}
      {editing && <BuildingForm initial={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
