'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases, useTable, tenantSummaries } from '../../../lib/data';
import { fmt, money, rentOf } from '../../../lib/format';
import { PIPELINE_STEPS, currentStage, stageProbability, STAGE_PROB } from '../../../lib/crm';

const COLS = ['Identified', ...PIPELINE_STEPS];

export default function AnalyticsPage() {
  const { rows, loading } = useLeases();
  const { rows: acts } = useTable('interactions', { select: 'type,next_action_date' });
  const [rate, setRate] = useState(12.5);
  const router = useRouter();

  const accounts = useMemo(() => tenantSummaries(rows), [rows]);
  const rentOfTenant = (t) => t.leases.reduce((s, x) => s + (Number(rentOf(x)) || 0), 0);

  const m = useMemo(() => {
    const prospects = accounts.filter((t) => t.tenant_obj?.relationship === 'Prospect');
    const clients = accounts.filter((t) => t.tenant_obj?.relationship === 'Client');
    const lost = accounts.filter((t) => ['Lost', 'Competitor'].includes(t.tenant_obj?.relationship));
    const funnel = Object.fromEntries(COLS.map((c) => [c, 0]));
    prospects.forEach((t) => { funnel[currentStage(t.tenant_obj?.pipeline) || 'Identified'] += 1; });
    const tracked = prospects.length + clients.length + lost.length;
    const conversion = (clients.length + lost.length) ? Math.round((clients.length / (clients.length + lost.length)) * 100) : 0;
    return { prospects, clients, lost, funnel, tracked, conversion };
  }, [accounts]);

  const forecast = useMemo(() => {
    const r = rate / 100;
    let weighted = 0, gross = 0;
    const perStage = Object.fromEntries(COLS.map((c) => [c, 0]));
    m.prospects.forEach((t) => {
      const comm = rentOfTenant(t) * r;
      const p = stageProbability(t.tenant_obj?.pipeline);
      gross += comm;
      weighted += comm * p;
      perStage[currentStage(t.tenant_obj?.pipeline) || 'Identified'] += comm * p;
    });
    const clientValue = m.clients.reduce((s, t) => s + rentOfTenant(t) * r, 0);
    return { weighted, gross, perStage, clientValue };
  }, [m, rate]);

  const activity = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const byType = {};
    let due = 0, overdue = 0;
    acts.forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
      if (a.next_action_date) { if (a.next_action_date >= today) due += 1; else overdue += 1; }
    });
    return { total: acts.length, byType, due, overdue };
  }, [acts]);

  if (loading) return (<><Topbar title="Analytics" sub="Run the desk like a business" /><div className="wrap"><Loading /></div></>);

  const maxF = Math.max(1, ...COLS.map((c) => m.funnel[c]));
  const kpis = [
    ['Tracked', fmt(m.tracked), 'in your CRM', ''],
    ['Prospects', fmt(m.prospects.length), 'in pipeline', ''],
    ['Clients', fmt(m.clients.length), 'won', ''],
    ['Win rate', m.conversion + '%', 'of closed', ''],
    ['Weighted forecast', money(forecast.weighted), 'probability-adjusted', 'warn'],
    ['Activities', fmt(activity.total), `${activity.overdue} overdue`, activity.overdue ? 'alert' : ''],
  ];

  return (
    <>
      <Topbar title="Analytics" sub="Run the desk like a business" />
      <div className="wrap">
        <div className="kpis">
          {kpis.map((c) => (
            <div key={c[0]} className={'kpi ' + c[3]}><div className="lab">{c[0]}</div><div className="val">{c[1]}</div><div className="hint">{c[2]}</div></div>
          ))}
        </div>
        <div className="grid2">
          <div className="card">
            <div className="hd"><h2>Prospect pipeline</h2><span className="tag">by furthest stage</span></div>
            <div className="bd pad">
              {COLS.map((c) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', cursor: 'pointer' }} onClick={() => router.push('/pipeline')}>
                  <div style={{ width: 86, fontSize: 12.5, color: 'var(--muted)' }}>{c}</div>
                  <div style={{ flex: 1, background: '#0e131b', borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: (m.funnel[c] / maxF * 100) + '%', minWidth: m.funnel[c] ? 6 : 0, height: '100%', background: 'linear-gradient(90deg,#38bdf8,#6366f1)' }} />
                  </div>
                  <div style={{ width: 30, textAlign: 'right', fontWeight: 700 }}>{m.funnel[c]}</div>
                  <div style={{ width: 34, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{Math.round((STAGE_PROB[c] || 0) * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="hd"><h2>Commission forecast</h2><span className="tag">probability-weighted</span></div>
            <div className="bd pad">
              <div className="filters" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Commission rate</label>
                <input type="number" step="0.5" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} style={{ width: 80 }} />
                <span className="t-sub">% of annual rent</span>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><div className="t-sub">Weighted forecast</div><div style={{ fontSize: 26, fontWeight: 800, color: '#fbbf24' }}>{money(forecast.weighted)}</div></div>
                <div><div className="t-sub">Gross if all won</div><div style={{ fontSize: 18, fontWeight: 700 }}>{money(forecast.gross)}</div></div>
                <div><div className="t-sub">Client base value /yr</div><div style={{ fontSize: 18, fontWeight: 700 }}>{money(forecast.clientValue)}</div></div>
              </div>
              <p className="t-sub" style={{ marginTop: 12 }}>Each prospect's commission ({rate}% of their annual rent) weighted by its pipeline stage's close probability. Move a prospect along the pipeline and this updates.</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="hd"><h2>Activity</h2><span className="tag">{activity.due} upcoming · {activity.overdue} overdue follow-ups</span></div>
          <div className="bd pad" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {Object.keys(activity.byType).length === 0 ? <span className="t-sub">No activity logged yet — use “Log action” on signals and tenants.</span> :
              Object.entries(activity.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <div key={t}><div className="t-sub">{t}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div></div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
