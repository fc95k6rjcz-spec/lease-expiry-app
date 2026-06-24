'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases } from '../../../lib/data';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { normName } from '../../../lib/sources';
import { parseFeed, ACTIONS } from '../../../lib/repfeed';

const BUCKET_ORDER = { suppress: 0, lead: 1, ours: 2, watch: 3 };

export default function FeedPage() {
  const { rows, loading } = useLeases();
  const { user } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [parsed, setParsed] = useState(null);   // [{...row, match, key}]
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);

  // Occupier index from CityScope-loaded leases (strongest source) for matching.
  const idx = useMemo(() => {
    const m = {};
    rows.forEach((x) => {
      if (!x.tenant_id || !x.tenant_name) return;
      const n = normName(x.tenant_name);
      if (n && !m[n]) m[n] = { id: x.tenant_id, name: x.tenant_name, n };
    });
    return { byNorm: m, list: Object.values(m) };
  }, [rows]);

  function match(norm) {
    if (!norm) return null;
    if (idx.byNorm[norm]) return idx.byNorm[norm];
    return idx.list.find((o) => o.n && norm.length >= 4 && (o.n.includes(norm) || (norm.includes(o.n) && o.n.length >= 4))) || null;
  }

  function run() {
    const { reportDate, rows: pr } = parseFeed(text);
    const out = pr.map((r, i) => ({ ...r, key: i, match: match(r.company_norm) }));
    setParsed(out);
    setDate(reportDate || new Date().toISOString().slice(0, 10));
    const c = {};
    out.forEach((p) => { c[p.key] = p.action !== 'watch'; });
    setChecked(c);
  }

  const counts = useMemo(() => {
    const c = { suppress: 0, lead: 0, ours: 0, watch: 0, matched: 0, missing: 0 };
    (parsed || []).forEach((p) => {
      c[ACTIONS[p.action].bucket]++;
      if (p.match) c.matched++; else c.missing++;
    });
    return c;
  }, [parsed]);

  const ordered = useMemo(() =>
    [...(parsed || [])].sort((a, b) =>
      (BUCKET_ORDER[ACTIONS[a.action].bucket] - BUCKET_ORDER[ACTIONS[b.action].bucket])
      || (b.size_max || 0) - (a.size_max || 0)), [parsed]);

  async function apply() {
    if (!parsed) return;
    setBusy(true);
    try {
      const sigs = parsed.map((p) => ({
        report_date: date || null, source: 'Property Daily', raw_line: p.raw_line,
        company_name: p.company_name, company_norm: p.company_norm, deal_type: p.deal_type,
        size_min: p.size_min, size_max: p.size_max, market: p.market, agent: p.agent,
        agent_role: p.agent_role, expiry_on: p.expiry_on, action: p.action,
        matched_tenant_id: p.match?.id || null, created_by: user?.email || null,
      }));
      const { error: se } = await supabase.from('rep_signals').insert(sigs);
      if (se) throw se;

      let suppressed = 0, tagged = 0;
      for (const p of parsed) {
        if (!p.match || !checked[p.key]) continue;
        const meta = ACTIONS[p.action];
        const upd = {
          rep_broker: p.agent || null, rep_role: p.agent_role || null,
          rep_source: 'Property Daily', rep_asof: date || null, rep_note: p.raw_line,
        };
        if (meta.status) { upd.occupier_status = meta.status; suppressed++; } else tagged++;
        const { error } = await supabase.from('tenants').update(upd).eq('id', p.match.id);
        if (error) throw error;
      }
      alert(`Saved ${sigs.length} signals.\n${suppressed} occupier(s) suppressed, ${tagged} tagged.\n${counts.missing} not yet in LEX (logged for the radar).`);
      setParsed(null); setText('');
    } catch (e) { alert(e.message || e); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Market Feed" sub="Paste the Property Daily daily — LEX turns it into a represented/white-space scoreboard" />
      <div className="wrap">
        <div className="banner info">
          By the time an occupier appears here, someone usually has them. So this feed is a <b>kill-list + scoreboard</b>:
          anyone with a rival agent <i>handling advocacy</i> gets suppressed out of your panel, your own firm&apos;s deals are
          tagged, and any live requirement with <b>no agent named</b> is white space worth chasing. Private to you — never shared.
        </div>

        <div className="card"><div className="bd pad">
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }}
            placeholder={'Paste the whole Property Daily email here (summary lines).'} />
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={run} disabled={!text.trim()}>Parse feed</button>
            {parsed ? (
              <>
                <label className="t-sub">Report date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <span className="count">{parsed.length} lines · {counts.matched} in LEX</span>
              </>
            ) : null}
          </div>
        </div></div>

        {loading ? <Loading /> : parsed ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
              <Pill cls="p-red">{counts.suppress} already repped / done</Pill>
              <Pill cls="p-amber">{counts.lead} white space</Pill>
              <Pill cls="p-green">{counts.ours} your firm</Pill>
              <Pill cls="p-slate">{counts.missing} not in LEX</Pill>
            </div>
            <div className="card"><div className="bd">
              <table>
                <thead><tr>
                  <th>Apply</th><th>Company</th><th>Action</th><th>Deal</th><th>Size (m²)</th>
                  <th>Market</th><th>Agent</th><th>In LEX</th>
                </tr></thead>
                <tbody>
                  {ordered.map((p) => {
                    const meta = ACTIONS[p.action];
                    const size = p.size_min ? (p.size_max && p.size_max !== p.size_min ? `${p.size_min.toLocaleString()}–${p.size_max.toLocaleString()}` : p.size_min.toLocaleString()) : '—';
                    return (
                      <tr key={p.key}>
                        <td><input type="checkbox" checked={!!checked[p.key]} disabled={!p.match}
                          onChange={(e) => setChecked((s) => ({ ...s, [p.key]: e.target.checked }))} /></td>
                        <td className="t-main">{p.company_name}</td>
                        <td><Pill cls={meta.cls}>{meta.label}</Pill></td>
                        <td className="t-sub">{p.deal_type}{p.expiry_on ? ` · ${p.expiry_on}` : ''}</td>
                        <td>{size}</td>
                        <td className="t-sub">{p.market || '—'}</td>
                        <td className="t-sub">{p.agent || '—'}{p.agent_role && p.agent_role !== 'advocacy' && p.agent_role !== 'none' ? ` (${p.agent_role})` : ''}</td>
                        <td>{p.match
                          ? <span onClick={() => router.push('/crm?tenant=' + p.match.id)} style={{ cursor: 'pointer' }}><Pill cls="p-green">matched</Pill></span>
                          : <Pill cls="p-slate">new</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn primary" onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply to LEX'}</button>
              <span className="t-sub">Ticked + matched rows update the occupier (repped → suppressed, reversible). All lines are logged.</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
