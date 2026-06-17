'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases, tenantSummaries } from '../../../lib/data';
import { fmt } from '../../../lib/format';

const listingPill = (l) => (!l ? 'p-slate' : l.startsWith('ASX') ? 'p-green' : /NYSE|NASDAQ|LSE/.test(l) ? 'p-amber' : 'p-slate');

export default function MetricsPage() {
  const { rows, loading } = useLeases();
  const [q, setQ] = useState('');
  const [ind, setInd] = useState('all');
  const router = useRouter();

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const enriched = useMemo(
    () => accounts.filter((t) => t.tenant_obj?.business_summary || t.tenant_obj?.metrics_updated),
    [accounts]
  );
  const industries = useMemo(() => ['all', ...Array.from(new Set(enriched.map((t) => t.tenant_obj?.industry).filter(Boolean))).sort()], [enriched]);
  const list = useMemo(() => enriched.filter((t) =>
    (ind === 'all' || t.tenant_obj?.industry === ind) &&
    (!q || (t.name || '').toLowerCase().includes(q.toLowerCase()))
  ).sort((a, b) => b.area - a.area), [enriched, ind, q]);

  return (
    <>
      <Topbar title="Business Metrics" sub="Public-data profile of your CBD tenants" />
      <div className="wrap">
        <div className="filters">
          <select value={ind} onChange={(e) => setInd(e.target.value)}>
            {industries.map((i) => <option key={i} value={i}>{i === 'all' ? 'All industries' : i}</option>)}
          </select>
          <input placeholder="search company…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{list.length} profiled · sourced from public data</span>
        </div>
        <div className="card"><div className="bd">
          {loading ? <Loading /> : (
            <table>
              <thead><tr><th>Company</th><th>Industry</th><th className="num">Founded</th><th className="num">Employees</th><th>Listing</th><th>Revenue</th><th>HQ</th><th className="num">Leased m²</th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const o = t.tenant_obj || {};
                  return (
                    <tr key={t.id} onClick={() => router.push('/crm?tenant=' + t.id)}>
                      <td><div className="t-main">{t.name}</div>{o.business_summary ? <div className="t-sub">{o.business_summary}</div> : null}</td>
                      <td>{o.industry || '—'}</td>
                      <td className="num">{o.founded_year || '—'}</td>
                      <td className="num">{o.headcount ? Math.round(o.headcount).toLocaleString() : '—'}</td>
                      <td>{o.asx_ticker ? <Pill cls={listingPill(o.asx_ticker)}>{o.asx_ticker}</Pill> : '—'}</td>
                      <td>{o.revenue_band || '—'}</td>
                      <td className="t-sub">{o.hq_country || '—'}</td>
                      <td className="num">{fmt(Math.round(t.area))}</td>
                    </tr>
                  );
                })}
                {list.length === 0 ? <tr><td colSpan={8} className="empty">No profiled tenants in this view.</td></tr> : null}
              </tbody>
            </table>
          )}
        </div></div>
      </div>
    </>
  );
}
