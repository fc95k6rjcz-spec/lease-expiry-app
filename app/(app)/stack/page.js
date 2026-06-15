'use client';
import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading } from '../../../components/ui';
import LeaseDrawer from '../../../components/LeaseDrawer';
import { useLeases, useTable, buildingSummaries } from '../../../lib/data';
import { dfmt, fmt, unitClass } from '../../../lib/format';

export default function StackPage() {
  const { rows, loading, reload } = useLeases();
  const { rows: buildings } = useTable('buildings', { select: 'id,name,street_address' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const [name, setName] = useState('');
  const [sel, setSel] = useState(null);

  const summaries = useMemo(() => buildingSummaries(rows), [rows]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('b');
    if (p) setName(p);
  }, []);
  useEffect(() => {
    if (!name && summaries.length) setName(summaries[0].name);
  }, [summaries, name]);

  const items = useMemo(() => rows.filter((x) => x.building_name === name), [rows, name]);
  const meta = summaries.find((b) => b.name === name);

  const levels = useMemo(() => {
    const by = {};
    items.forEach((x) => { (by[x.lvlkey] = by[x.lvlkey] || []).push(x); });
    return Object.keys(by).map(Number).sort((a, b) => b - a).map((k) => ({
      key: k,
      label: k === 999 ? 'Other' : k < 0 ? 'B' + -k : k === 0 ? 'Grnd' : 'L' + k,
      units: by[k].sort((a, b) => (Number(b.size_sqm) || 0) - (Number(a.size_sqm) || 0)),
    }));
  }, [items]);

  return (
    <>
      <Topbar title="Stack Plans" sub="Who sits where, by level" />
      <div className="wrap">
        <div className="filters">
          <select value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 280 }}>
            {summaries.map((b) => <option key={b.name}>{b.name}</option>)}
          </select>
          {meta ? <span className="count">{meta.leases} tenancies · {fmt(Math.round(meta.area))} m² · {meta.levels} levels{meta.address ? ' · ' + meta.address : ''}</span> : null}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--redbg)', border: '1px solid #f6c9c9' }} />Expired</span>
          <span><i style={{ background: 'var(--amberbg)' }} />≤12 mo</span>
          <span><i style={{ background: 'var(--slatebg)' }} />12–24 mo</span>
          <span><i style={{ background: 'var(--greenbg)' }} />&gt;24 mo</span>
        </div>
        <div className="card">
          <div className="bd pad">
            {loading ? <Loading /> : (
              <div className="stack">
                {levels.map((lv) => (
                  <div className="lvl" key={lv.key}>
                    <div className="lname">{lv.label}</div>
                    <div className="units">
                      {lv.units.map((x) => (
                        <div key={x.id} className={'unit ' + unitClass(x.months_to_expiry)} onClick={() => setSel(x)}>
                          <div className="un">{x.tenant_name || '—'}</div>
                          <div className="ud">
                            <span>{x.size_sqm ? Math.round(x.size_sqm).toLocaleString() + ' m²' : (x.suite || '')}</span>
                            <span>{x.expiry_date ? dfmt(x.expiry_date) : '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {levels.length === 0 ? <div className="empty">No tenancies recorded for this building.</div> : null}
              </div>
            )}
          </div>
        </div>
      </div>
      {sel && <LeaseDrawer lease={sel} buildings={buildings} tenants={tenants} onClose={() => setSel(null)} onChanged={reload} />}
    </>
  );
}
