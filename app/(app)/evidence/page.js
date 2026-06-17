'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import DealForm from '../../../components/DealForm';
import { useTable } from '../../../lib/data';
import { dfmt, fmt } from '../../../lib/format';
import { GRADES, dealNER, ner, compStats, verdict, filterComps } from '../../../lib/deals';

export default function EvidencePage() {
  const { rows: deals, loading, reload } = useTable('deals', { select: '*', order: { col: 'deal_date', asc: false } });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [grade, setGrade] = useState('all');
  const [q, setQ] = useState('');
  const [b, setB] = useState({ grade: 'A', area: '', face: '', incentive: '' });

  const filtered = useMemo(() => deals.filter((d) =>
    (grade === 'all' || d.grade === grade) &&
    (!q || `${d.building_name || ''} ${d.tenant || ''} ${d.suburb || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [deals, grade, q]);
  const stats = useMemo(() => compStats(filtered), [filtered]);

  const proposedNer = ner(b.face, b.incentive);
  const benchComps = useMemo(() => filterComps(deals, { grade: b.grade, areaSqm: b.area ? Number(b.area) : null }), [deals, b.grade, b.area]);
  const benchStats = useMemo(() => compStats(benchComps), [benchComps]);
  const v = verdict(proposedNer, benchStats.nerMed);
  const setb = (k) => (e) => setB((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <Topbar title="Deal Evidence" sub="Comparable transactions · net effective rent">
        <button className="btn primary" onClick={() => setAdding(true)}>+ Record deal</button>
      </Topbar>
      <div className="wrap">
        <div className="card">
          <div className="hd"><h2>Benchmark a deal</h2><span className="tag">net effective vs market</span></div>
          <div className="bd pad">
            <div className="filters" style={{ marginBottom: 12 }}>
              <select value={b.grade} onChange={setb('grade')}><option value="all">Any grade</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
              <input type="number" placeholder="Area m²" value={b.area} onChange={setb('area')} style={{ width: 110 }} />
              <input type="number" placeholder="Face $/m²" value={b.face} onChange={setb('face')} style={{ width: 120 }} />
              <input type="number" placeholder="Incentive %" value={b.incentive} onChange={setb('incentive')} style={{ width: 120 }} />
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <div><div className="t-sub">Proposed net effective</div><div style={{ fontSize: 22, fontWeight: 800 }}>{proposedNer != null ? '$' + proposedNer.toLocaleString() + ' /m²' : '—'}</div></div>
              <div><div className="t-sub">Market NER (median · {benchStats.count} comps)</div><div style={{ fontSize: 22, fontWeight: 800 }}>{benchStats.nerMed != null ? '$' + benchStats.nerMed.toLocaleString() + ' /m²' : '—'}</div></div>
              <div><div className="t-sub">Market range</div><div style={{ fontSize: 14, fontWeight: 600 }}>{benchStats.nerMin != null ? `$${benchStats.nerMin.toLocaleString()} – $${benchStats.nerMax.toLocaleString()}` : '—'}</div></div>
              {v && <div><div className="t-sub">Verdict</div><Pill cls={v.tone === 'good' ? 'p-green' : v.tone === 'bad' ? 'p-red' : 'p-amber'}>{v.pct > 0 ? '+' : ''}{v.pct}% · {v.label}</Pill></div>}
            </div>
            <p className="t-sub" style={{ marginTop: 12 }}>Lower net effective = better for the tenant. Use this to support a rent review, prep a valuation, or advise whether a deal is market.</p>
          </div>
        </div>

        <div className="filters">
          <div className="chipset">
            {['all', ...GRADES].map((g) => <button key={g} className={'chip' + (grade === g ? ' on' : '')} onClick={() => setGrade(g)}>{g === 'all' ? 'All grades' : g}</button>)}
          </div>
          <input placeholder="search building / tenant…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{filtered.length} comps · median NER {stats.nerMed != null ? '$' + stats.nerMed.toLocaleString() : '—'} · median incentive {stats.incMed != null ? stats.incMed + '%' : '—'}</span>
        </div>

        <div className="card"><div className="bd">
          {loading ? <Loading /> : (
            <table>
              <thead><tr><th>Building</th><th>Grade</th><th>Floor</th><th className="num">m²</th><th>Date</th><th className="num">Term</th><th className="num">Face</th><th className="num">Inc%</th><th className="num">NER</th><th>Source</th></tr></thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onClick={() => setEditing(d)}>
                    <td className="t-main">{d.building_name || d.address || '—'}</td>
                    <td>{d.grade}</td>
                    <td>{d.floor || ''}</td>
                    <td className="num">{d.area_sqm ? Math.round(d.area_sqm).toLocaleString() : '—'}</td>
                    <td>{dfmt(d.deal_date)}</td>
                    <td className="num">{d.lease_term_years ? d.lease_term_years + 'y' : '—'}</td>
                    <td className="num">{d.face_rent_sqm ? '$' + Math.round(d.face_rent_sqm).toLocaleString() : '—'}</td>
                    <td className="num">{d.incentive_pct != null ? d.incentive_pct + '%' : '—'}</td>
                    <td className="num"><b>{dealNER(d) != null ? '$' + dealNER(d).toLocaleString() : '—'}</b></td>
                    <td><span className="t-sub">{d.source || '—'}</span>{d.confidence ? <span style={{ marginLeft: 6 }}><Pill cls="p-slate">{d.confidence}</Pill></span> : null}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? <tr><td colSpan={10} className="empty">No comps yet. Record your first deal.</td></tr> : null}
              </tbody>
            </table>
          )}
        </div></div>
      </div>
      {adding && <DealForm onClose={() => setAdding(false)} onSaved={reload} />}
      {editing && <DealForm initial={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
