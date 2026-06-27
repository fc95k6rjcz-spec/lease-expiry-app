'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLeases, useTable } from '../../lib/data';
import { fmt, money, rentOf, dfmt } from '../../lib/format';
import { rentBenchmarks, benchmark, opportunityScore } from '../../lib/score';
import { fragmentedTargets, multiSiteTargets } from '../../lib/targets';
import { useAuth } from '../../lib/auth';
import { displayName, timeGreeting } from '../../lib/personal';
import { isSuppressed } from '../../lib/occupier';
import { supabase } from '../../lib/supabase';

const today = () => new Date().toISOString().slice(0, 10);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const cmoney = (n) => (n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(0) + 'M' : money(n));

// Pass reasons -> existing suppression statuses (keeps isSuppressed working).
const PASS_REASONS = [
  { label: 'Represented by…', status: 'Already Represented', rep: true, red: true },
  { label: 'Just renewed', status: 'Already Renewed' },
  { label: 'Moved out', status: 'Already Relocated' },
  { label: 'Not in market', status: 'Not a Fit' },
  { label: 'Mate — soft touch', status: 'Do Not Contact' },
  { label: 'Too small', status: 'Not a Fit' },
];

function Ring({ score, t, size, r, stroke, color }) {
  const c = 2 * Math.PI * r;
  const off = c * (1 - (score / 100) * t);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--d-line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="dring-num" style={{ fontSize: size > 80 ? 30 : 17 }}>{Math.round(score * t)}</text>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" dy={size > 80 ? 22 : 13} className="dring-lbl">SCORE</text>
    </svg>
  );
}

const ringColor = (s) => (s >= 88 ? 'var(--d-accent)' : s >= 78 ? 'var(--d-accent2)' : 'var(--d-warn)');
const expiryMeta = (mte, holdover) => {
  if (holdover) return ['holdover', 'var(--d-bad)'];
  if (mte == null) return ['no expiry', 'var(--d-muted)'];
  if (mte <= 6) return [`in ${Math.round(mte)} mo`, 'var(--d-bad)'];
  if (mte <= 12) return [`in ${Math.round(mte)} mo`, 'var(--d-warn)'];
  return [`in ${Math.round(mte)} mo`, 'var(--d-muted)'];
};

export default function Dashboard() {
  const { rows, loading } = useLeases();
  const { rows: signals } = useTable('signals', { select: '*' });
  const { rows: contacts } = useTable('contacts', { select: 'tenant_id' });
  const { rows: briefs } = useTable('lead_briefs', { select: '*' });
  const { rows: shortRows } = useTable('daily_shortlist', { select: '*' });
  const { user } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState('aurora');
  const [t, setT] = useState(0);
  const [clock, setClock] = useState('');
  const [gym, setGym] = useState(false);
  const [decisions, setDecisions] = useState({});   // {tenant_id: {status:'up'|'down', reason, repBy}}
  const [choosing, setChoosing] = useState(null);
  const [repDraft, setRepDraft] = useState('');
  const [copied, setCopied] = useState(null);
  const seeded = useRef(false);

  // count-up
  useEffect(() => {
    let raf, start;
    const tick = (ts) => { if (!start) start = ts; const p = Math.min(1, (ts - start) / 1150); setT(easeOutCubic(p)); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // clock
  useEffect(() => {
    const f = () => setClock(new Date().toLocaleTimeString('en-AU', { hour12: false }));
    f(); const i = setInterval(f, 1000); return () => clearInterval(i);
  }, []);
  // ritual persist
  useEffect(() => { try { setGym(JSON.parse(localStorage.getItem('lex_rowan_v1') || '{}').gym || false); } catch {} }, []);
  const toggleGym = () => setGym((v) => { const nv = !v; try { localStorage.setItem('lex_rowan_v1', JSON.stringify({ gym: nv })); } catch {} return nv; });

  // seed today's shortlist -> decisions 'up'
  useEffect(() => {
    if (seeded.current || !shortRows.length) return;
    const d0 = today();
    const seed = {};
    shortRows.forEach((s) => { if (String(s.the_date).slice(0, 10) === d0) seed[s.tenant_id] = { status: 'up' }; });
    if (Object.keys(seed).length) { setDecisions((p) => ({ ...seed, ...p })); seeded.current = true; }
  }, [shortRows]);

  const greeting = `${timeGreeting()}, ${displayName(user?.email)}`;
  const briefBy = useMemo(() => Object.fromEntries(briefs.map((b) => [b.tenant_id, b])), [briefs]);

  const kpi = useMemo(() => {
    const area = rows.reduce((a, x) => a + (Number(x.size_sqm) || 0), 0);
    const rent = rows.reduce((a, x) => a + (Number(rentOf(x)) || 0), 0);
    const within = (n) => rows.filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= n).length;
    return { leases: rows.length, area, rent, exp12: within(12), exp24: within(24) };
  }, [rows]);
  const sigTenants = useMemo(() => new Set(signals.filter((s) => (s.status || 'active') === 'active').map((s) => s.tenant_id)), [signals]);
  const sigLive = useMemo(() => signals.filter((s) => (s.status || 'active') === 'active'), [signals]);

  const bm = useMemo(() => rentBenchmarks(rows), [rows]);
  const oppSets = useMemo(() => {
    const exp = new Set(signals.filter((s) => s.direction === 'Expansion' && (s.status || 'active') === 'active').map((s) => s.tenant_id));
    const contact = new Set(contacts.map((c) => c.tenant_id));
    const need = new Set([...fragmentedTargets(rows).map((z) => z.tenant_id), ...multiSiteTargets(rows, true).map((z) => z.tenant_id)]);
    return { exp, contact, need };
  }, [rows, signals, contacts]);

  const board = useMemo(() => {
    const d0 = today();
    const best = {};
    rows.forEach((x) => {
      if (!x.tenant_id || isSuppressed(x.tenant_obj)) return;
      const mte = x.months_to_expiry;
      const b = benchmark(x, bm);
      const holdover = String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < d0);
      const ctx = {
        inHoldover: holdover,
        optionDue: x.has_renewal_option && mte != null && mte >= 0 && mte <= 24,
        hasExpansionSignal: oppSets.exp.has(x.tenant_id),
        contactable: oppSets.contact.has(x.tenant_id),
        fragmentedOrMulti: oppSets.need.has(x.tenant_id),
        benchmarkPct: b ? b.pct : null,
      };
      const sc = opportunityScore(x, ctx);
      let score = sc.score;
      const verified = !!x.tenant_obj?.verified_at;
      if (verified) score = Math.min(100, score + 25);
      if (!best[x.tenant_id] || score > best[x.tenant_id].score)
        best[x.tenant_id] = { lease: x, score, breakdown: sc.breakdown, holdover, mte, verified, bench: b };
    });
    return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 7);
  }, [rows, bm, oppSets]);

  const nameMap = useMemo(() => {
    const m = {};
    rows.forEach((x) => { if (x.tenant_id && !m[x.tenant_id]) m[x.tenant_id] = { name: x.tenant_name, building: x.building_name }; });
    return m;
  }, [rows]);
  const scoreMap = useMemo(() => Object.fromEntries(board.map((b) => [b.lease.tenant_id, b.score])), [board]);

  const expiriesByYear = useMemo(() => {
    const y0 = new Date().getFullYear();
    const years = Array.from({ length: 8 }, (_, i) => y0 + i);
    const counts = Object.fromEntries(years.map((y) => [y, 0]));
    rows.forEach((x) => { const y = x.expiry_date ? +String(x.expiry_date).slice(0, 4) : null; if (y && counts[y] != null) counts[y]++; });
    const max = Math.max(1, ...years.map((y) => counts[y]));
    return years.map((y) => ({ y, n: counts[y], h: counts[y] / max }));
  }, [rows]);

  const watchlist = useMemo(() => {
    const seen = new Set(); const out = [];
    rows.forEach((x) => {
      const tt = x.tenant_obj;
      if (!tt || x.tenant_id in seen) return;
      if (tt.occupier_status === 'Active Target' || tt.relationship === 'Client') {
        seen.add(x.tenant_id);
        out.push({ id: x.tenant_id, name: x.tenant_name, note: tt.prospect_note || tt.verified_note || `${x.building_name}`,
          tag: tt.relationship === 'Client' ? 'CLIENT' : 'HOT', tagcls: tt.relationship === 'Client' ? 'tg-own' : 'tg-hot' });
      }
    });
    return out.slice(0, 6);
  }, [rows]);

  const upIds = Object.entries(decisions).filter(([, d]) => d.status === 'up').map(([id]) => id);
  const shortList = upIds.map((id) => ({ id, name: nameMap[id]?.name || 'Tenant', building: nameMap[id]?.building || '', score: scoreMap[id] }));
  const fiveCount = Math.min(5, upIds.length);
  const liveCount = board.filter((b) => decisions[b.lease.tenant_id]?.status !== 'down').length;

  // ---- triage actions ----
  async function chase(b) {
    const id = b.lease.tenant_id;
    setDecisions((p) => ({ ...p, [id]: { status: 'up' } }));
    setChoosing(null);
    await supabase.from('daily_shortlist').upsert(
      { tenant_id: id, lease_id: b.lease.id, the_date: today(), score: b.score, user_email: user?.email || null },
      { onConflict: 'tenant_id,the_date' });
    await supabase.from('tenants').update({ occupier_status: 'Active Target' }).eq('id', id);
  }
  async function pass(b, reason) {
    const id = b.lease.tenant_id;
    const repBy = reason.rep ? repDraft.trim() : '';
    const reasonText = reason.rep ? (repBy ? `Represented by ${repBy}` : 'Represented elsewhere') : reason.label;
    setDecisions((p) => ({ ...p, [id]: { status: 'down', reason: reasonText, repBy: !!repBy } }));
    setChoosing(null); setRepDraft('');
    const upd = { occupier_status: reason.status, suppressed_reason: reasonText, suppressed_at: new Date().toISOString() };
    if (reason.rep && repBy) { upd.rep_broker = repBy; upd.rep_source = 'Rowan'; upd.rep_asof = today(); }
    await supabase.from('tenants').update(upd).eq('id', id);
  }
  async function undo(b) {
    const id = b.lease.tenant_id; const was = decisions[id];
    setDecisions((p) => { const n = { ...p }; delete n[id]; return n; });
    if (was?.status === 'up') {
      await supabase.from('daily_shortlist').delete().eq('tenant_id', id).eq('the_date', today());
      await supabase.from('tenants').update({ occupier_status: null }).eq('id', id);
    } else {
      await supabase.from('tenants').update({ occupier_status: null, suppressed_reason: null, suppressed_at: null }).eq('id', id);
    }
  }
  function copyOpener(b) {
    const br = briefBy[b.lease.tenant_id]; if (!br?.opener || !navigator.clipboard) return;
    navigator.clipboard.writeText(br.opener); setCopied(b.lease.tenant_id); setTimeout(() => setCopied(null), 1500);
  }

  const subline = useMemo(() => {
    const exp6 = rows.filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= 6).length;
    const top = board[0];
    const mover = top ? `Top of the board: ${top.lease.tenant_name} — score ${top.score}${top.verified ? ', verified live' : ''}.` : '';
    const wd = new Date().toLocaleDateString('en-AU', { weekday: 'long' });
    return `${fmt(exp6)} expiries inside 6 months and ${fmt(sigLive.length)} live signals on your patch. ${mover} ${wd}'s board is ranked and ready.`;
  }, [rows, board, sigLive]);

  const triage = (b, compact) => {
    const id = b.lease.tenant_id; const d = decisions[id];
    if (d?.status === 'up') return (
      <div className="dtri-strip up"><span>✅ On the short list — counts toward your 5 before 10</span><button onClick={() => undo(b)}>undo</button></div>);
    if (d?.status === 'down') return (
      <div className="dtri-strip down"><span>{d.repBy ? '🚩' : '🚫'} Passed — {d.reason}{d.repBy ? ' · flagged in data' : ''}</span><button onClick={() => undo(b)}>undo</button></div>);
    if (choosing === id) return (
      <div className="dpass">
        <div className="dpass-h">Why pass? Rowan's call — LEX remembers it.</div>
        <input className="dpass-in" placeholder="agent / firm representing them…" value={repDraft} onChange={(e) => setRepDraft(e.target.value)} />
        <div className="dpass-chips">
          {PASS_REASONS.map((r) => <button key={r.label} className={'dchip' + (r.red ? ' red' : '')} onClick={() => pass(b, r)}>{r.label}</button>)}
        </div>
        <button className="dpass-cancel" onClick={() => { setChoosing(null); setRepDraft(''); }}>cancel</button>
      </div>);
    return (
      <div className={'dtri' + (compact ? ' compact' : '')}>
        <button className="dtri-up" onClick={() => chase(b)}>👍 {compact ? 'Chase' : 'Chase it — add to short list'}</button>
        <button className="dtri-down" onClick={() => { setChoosing(id); setRepDraft(''); }}>👎 Pass</button>
        {compact ? <button className="dtri-copy" onClick={() => copyOpener(b)}>{copied === id ? '✓' : 'Copy'}</button> : null}
      </div>);
  };

  if (loading) return <div className="lexdash" data-theme={theme}><div className="dload">Booting the cockpit…</div></div>;

  const featured = board[0];
  const grid = board.slice(1, 7);
  const kpis = [
    ['Tenancies', fmt(Math.round(kpi.leases * t)), 'tracked live', null],
    ['Leased area', fmt(Math.round(kpi.area * t)) + ' m²', 'under watch', null],
    ['Rent roll p.a.', cmoney(kpi.rent * t), 'portfolio', null],
    ['Expiring ≤12 mo', fmt(Math.round(kpi.exp12 * t)), 'act now', 'bad'],
    ['Expiring ≤24 mo', fmt(Math.round(kpi.exp24 * t)), 'pipeline', 'warn'],
    ['Live signals', fmt(Math.round(sigLive.length * t)), 'active now', 'good'],
  ];

  return (
    <div className="lexdash" data-theme={theme}>
      <div className="dwrap">
        {/* command bar */}
        <div className="dcmd">
          <div className="dbrand">
            <div className="dlogo">L</div>
            <div><div className="dword">LEX</div><div className="dsub">ROWAN'S TENANT-REP COCKPIT</div></div>
          </div>
          <div className="dsearch"><span>⌕</span><input placeholder="Search tenants, owners, buildings, signals…"
            onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) router.push('/crm?q=' + encodeURIComponent(e.target.value.trim())); }} /><kbd>/</kbd></div>
          <div className="dright">
            <div className="dtheme">
              {['aurora', 'cockpit', 'daylight'].map((th) => <button key={th} className={theme === th ? 'on' : ''} onClick={() => setTheme(th)}>{th[0].toUpperCase() + th.slice(1)}</button>)}
            </div>
            <span className="ddot" /><span className="dclock">{clock}</span>
          </div>
        </div>

        {/* greeting + ritual */}
        <div className="dgreet">
          <div>
            <h1>{greeting}</h1>
            <p>{subline}</p>
          </div>
          <div className="dritual">
            <div className="dr-seg"><span className="dr-ic">☕</span><span className="dr-lbl done">SOY LATTE ✓</span></div>
            <div className="dr-seg btn" onClick={toggleGym}><span className="dr-ic" style={{ filter: gym ? 'none' : 'grayscale(1)', opacity: gym ? 1 : .55 }}>🚵</span><span className={'dr-lbl' + (gym ? ' done' : '')}>{gym ? 'RODE ✓' : 'RIDE?'}</span></div>
            <div className="dr-seg five">
              <div className="dr-dots">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={'dr-dot' + (i < fiveCount ? ' on' : '')} />)}</div>
              <div className={'dr-five' + (fiveCount >= 5 ? ' done' : fiveCount ? ' go' : '')}>
                {fiveCount >= 5 ? "5 locked 🎯 trail's calling" : fiveCount ? `${fiveCount}/5 — keep rolling` : '5 calls before 10am'}
              </div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="dkpis">
          {kpis.map((k) => (
            <div key={k[0]} className={'dkpi' + (k[3] ? ' ' + k[3] : '')}>
              <div className="dkpi-l">{k[0]}</div><div className="dkpi-v">{k[1]}</div><div className="dkpi-h">{k[2]}</div>
            </div>
          ))}
        </div>

        {/* main grid */}
        <div className="dmain">
          <div className="dcol">
            <div className="dsec-h"><h2>Today's calls</h2><span className="dlive">{liveCount} live</span><span className="dhint">👍 chase · 👎 pass (tell it why)</span></div>

            {featured ? (() => {
              const id = featured.lease.tenant_id; const br = briefBy[id]; const dn = decisions[id];
              const [el, ec] = expiryMeta(featured.mte, featured.holdover);
              return (
                <div className={'dfeat' + (dn?.status === 'down' ? ' dim' : '')}>
                  <div className="dfeat-top">
                    <Ring score={featured.score} t={t} size={104} r={44} stroke={7} color="var(--d-accent)" />
                    <div className="dfeat-body">
                      <div className="dfeat-tags"><span className="dpill-top">TOP CALL</span>{featured.verified ? <span className="dpill-good">✓ verified live</span> : sigTenants.has(id) ? <span className="dpill-good">▲ signal</span> : null}</div>
                      <div className="dfeat-name" onClick={() => router.push('/crm?tenant=' + id)}>{featured.lease.tenant_name}</div>
                      <div className="dfeat-meta">{featured.lease.building_name}{featured.lease.levels ? ' · ' + featured.lease.levels : ''}{featured.lease.size_sqm ? ' · ' + Math.round(featured.lease.size_sqm).toLocaleString() + ' m²' : ''} · <span style={{ color: ec }}>expiry {el}</span></div>
                      <div className="dchips">
                        {featured.holdover ? <span className="dfchip">In holdover</span> : null}
                        {featured.lease.has_break_right ? <span className="dfchip">Break clause</span> : null}
                        {featured.bench && featured.bench.pct >= 7 ? <span className="dfchip">+{featured.bench.pct}% over market</span> : null}
                        {sigTenants.has(id) ? <span className="dfchip">Expansion signal</span> : null}
                        {featured.lease.size_sqm ? <span className="dfchip">{Math.round(featured.lease.size_sqm).toLocaleString()} m²</span> : null}
                      </div>
                    </div>
                  </div>
                  {br ? (
                    <div className="dopener">
                      <div className="dopener-l">ROWAN'S OPENER{br.contact_name ? ' · ' + br.contact_name : ''}</div>
                      {br.headline ? <div className="dopener-hl">{br.headline}</div> : null}
                      <div className="dopener-q">&ldquo;{br.opener}&rdquo;</div>
                      <button className="dcopy" onClick={() => copyOpener(featured)}>{copied === id ? 'Copied ✓' : 'Copy opener'}</button>
                    </div>
                  ) : <div className="dopener muted">AI brief generates on the next overnight run.</div>}
                  {triage(featured)}
                </div>
              );
            })() : <div className="dempty">Load data to see ranked leads.</div>}

            <div className="dgrid">
              {grid.map((b) => {
                const id = b.lease.tenant_id; const dn = decisions[id];
                const [el, ec] = expiryMeta(b.mte, b.holdover);
                return (
                  <div key={id} className={'dcard' + (dn?.status === 'down' ? ' dim' : '')}>
                    <div className="dcard-top">
                      <Ring score={b.score} t={t} size={60} r={25} stroke={5} color={ringColor(b.score)} />
                      <div>
                        <div className="dcard-name" onClick={() => router.push('/crm?tenant=' + id)}>{b.lease.tenant_name}{b.verified ? ' ✓' : ''}</div>
                        <div className="dcard-meta">{b.lease.building_name}</div>
                        <div className="dcard-meta" style={{ color: ec }}>{b.lease.size_sqm ? Math.round(b.lease.size_sqm).toLocaleString() + ' m² · ' : ''}{el}</div>
                      </div>
                    </div>
                    {triage(b, true)}
                  </div>
                );
              })}
            </div>

            <div className="dchart">
              <div className="dchart-h">Expiries by year</div>
              <div className="dbars">
                {expiriesByYear.map((d, i) => (
                  <div key={d.y} className="dbar-col">
                    <div className="dbar-n">{Math.round(d.n * t)}</div>
                    <div className="dbar-track"><div className={'dbar' + (i === 0 ? ' near' : '')} style={{ height: `${Math.round(d.h * t * 100)}%` }} /></div>
                    <div className="dbar-y">{d.y}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dcol side">
            <div className="dpanel accentbox">
              <div className="dpanel-h"><h3>Short list</h3><span>5 before 10am</span><b className={fiveCount >= 5 ? 'good' : fiveCount ? 'acc' : ''}>{fiveCount}/5</b></div>
              <div className="dprog"><div style={{ width: `${(fiveCount / 5) * 100}%` }} /></div>
              {shortList.length ? shortList.map((s, i) => (
                <div key={s.id} className="dslrow" onClick={() => router.push('/crm?tenant=' + s.id)}>
                  <span className="dsl-n">{i + 1}</span>
                  <span className="dsl-b"><b>{s.name}</b><span>{s.building}</span></span>
                  {s.score != null ? <span className="dsl-s">{s.score}</span> : null}
                </div>
              )) : <div className="dpanel-empty">👍 a call to start the list. Knock out 5 and the trail's yours.</div>}
            </div>

            <div className="dpanel">
              <div className="dpanel-h"><h3>Rowan's watchlist</h3><span>named targets</span></div>
              {watchlist.length ? watchlist.map((w) => (
                <div key={w.id} className="dwrow" onClick={() => router.push('/crm?tenant=' + w.id)}>
                  <span className={'dtag ' + w.tagcls}>{w.tag}</span>
                  <span className="dw-b"><b>{w.name}</b><span>{w.note}</span></span>
                </div>
              )) : <div className="dpanel-empty">Thumb a lead up, or tag a tenant Active Target, to build your watchlist.</div>}
            </div>

            <div className="dpanel">
              <div className="dpanel-h"><h3>Live signals</h3><span className="dlivetag">● LIVE</span></div>
              {sigLive.length ? sigLive.slice(0, 6).map((s) => (
                <div key={s.id} className="dsigrow">
                  <span className={'dsig-dot ' + (s.impact === 'high' ? 'hi' : 'med')} />
                  <span className="dsig-b"><b>{s.headline || s.direction || 'Signal'}</b><span>{[s.direction, s.source].filter(Boolean).join(' · ')}</span></span>
                  {s.direction ? <span className="dsig-imp">{s.direction}</span> : null}
                </div>
              )) : <div className="dpanel-empty">No live signals right now.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
