'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../components/Shell';
import { Loading, Pill } from '../../components/ui';
import { useLeases, useTable } from '../../lib/data';
import { fmt, money, rentOf, dfmt } from '../../lib/format';
import { criticalDates } from '../../lib/crm';
import { rentBenchmarks, benchmark, opportunityScore } from '../../lib/score';
import { fragmentedTargets, multiSiteTargets } from '../../lib/targets';
import { useAuth } from '../../lib/auth';
import { displayName, timeGreeting, dailyLine } from '../../lib/personal';

const whyOf = (bd) => {
  const interesting = bd.filter((f) => !['Size / commission', 'Contactable', 'Lease timing'].includes(f.label));
  return (interesting.length ? interesting : bd).slice(0, 2).map((f) => f.label).join(' · ');
};
const cmoney = (n) =>
  n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : money(n);

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      className="btn"
      style={{ padding: '4px 10px', fontSize: 12 }}
      onClick={(e) => {
        e.stopPropagation();
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export default function Dashboard() {
  const { rows, loading } = useLeases();
  const { rows: signals } = useTable('signals', { select: '*' });
  const { rows: acts } = useTable('interactions', { select: '*' });
  const { rows: contacts } = useTable('contacts', { select: 'tenant_id' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });
  const { rows: briefs } = useTable('lead_briefs', { select: '*' });
  const { user } = useAuth();
  const greeting = `${timeGreeting()}, ${displayName(user?.email)}`;
  const router = useRouter();

  const briefBy = useMemo(() => Object.fromEntries(briefs.map((b) => [b.tenant_id, b])), [briefs]);
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.legal_name])), [tenants]);

  const kpi = useMemo(() => {
    const area = rows.reduce((a, x) => a + (Number(x.size_sqm) || 0), 0);
    const rent = rows.reduce((a, x) => a + (Number(rentOf(x)) || 0), 0);
    const within = (n) => rows.filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= n).length;
    return { leases: rows.length, area, rent, exp12: within(12), exp24: within(24) };
  }, [rows]);

  const sigTenants = useMemo(() => new Set(signals.filter((s) => (s.status || 'active') === 'active').map((s) => s.tenant_id)), [signals]);

  const bm = useMemo(() => rentBenchmarks(rows), [rows]);
  const oppSets = useMemo(() => {
    const exp = new Set(signals.filter((s) => s.direction === 'Expansion' && (s.status || 'active') === 'active').map((s) => s.tenant_id));
    const contact = new Set(contacts.map((c) => c.tenant_id));
    const need = new Set([...fragmentedTargets(rows).map((z) => z.tenant_id), ...multiSiteTargets(rows, true).map((z) => z.tenant_id)]);
    return { exp, contact, need };
  }, [rows, signals, contacts]);

  const topLeads = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const best = {};
    rows.forEach((x) => {
      if (!x.tenant_id) return;
      const mte = x.months_to_expiry;
      const b = benchmark(x, bm);
      const ctx = {
        inHoldover: String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < today),
        optionDue: x.has_renewal_option && mte != null && mte >= 0 && mte <= 24,
        hasExpansionSignal: oppSets.exp.has(x.tenant_id),
        contactable: oppSets.contact.has(x.tenant_id),
        fragmentedOrMulti: oppSets.need.has(x.tenant_id),
        benchmarkPct: b ? b.pct : null,
      };
      const sc = opportunityScore(x, ctx);
      if (!best[x.tenant_id] || sc.score > best[x.tenant_id].score) best[x.tenant_id] = { lease: x, ...sc };
    });
    return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 6);
  }, [rows, bm, oppSets]);

  const clientItems = useMemo(() => {
    const items = [];
    rows.forEach((x) => {
      if (x.tenant_obj?.relationship === 'Client') {
        const cd = criticalDates(x)[0];
        if (cd) items.push({ id: x.id, tenant: x.tenant_name, building: x.building_name, type: cd.type, date: cd.date, tenant_id: x.tenant_id });
      }
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 6);
  }, [rows]);

  const followups = useMemo(
    () =>
      acts
        .filter((a) => a.next_action_date && a.next_action_date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => (a.next_action_date < b.next_action_date ? -1 : 1))
        .slice(0, 6),
    [acts]
  );

  if (loading) return (<><Topbar title={greeting} sub={dailyLine()} /><div className="wrap"><Loading /></div></>);

  const strip = [
    ['Tenancies', fmt(kpi.leases), ''],
    ['Leased area', fmt(Math.round(kpi.area)) + ' m²', ''],
    ['Rent roll p.a.', cmoney(kpi.rent), ''],
    ['Expiring ≤ 12 mo', fmt(kpi.exp12), 'var(--red)'],
    ['Expiring ≤ 24 mo', fmt(kpi.exp24), 'var(--amber)'],
    ['Signals live', fmt(sigTenants.size), 'var(--brand)'],
  ];

  return (
    <>
      <Topbar title={greeting} sub="Your calls for today are up top — opener ready to copy." />
      <div className="wrap">
        {/* slim stat strip */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="bd" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 34px', alignItems: 'center', padding: '12px 18px' }}>
            {strip.map((s) => (
              <div key={s[0]} style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: s[2] || 'var(--ink)', lineHeight: 1.1 }}>{s[1]}</span>
                <span className="t-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>{s[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* HERO — today's calls */}
        <div className="card" style={{ borderColor: 'rgba(227,210,164,.4)' }}>
          <div className="hd">
            <h2>Today’s calls</h2>
            <span className="tag" style={{ color: '#e3d2a4' }}>ranked by opportunity · AI opener written overnight on your hardware</span>
          </div>
          <div className="bd pad">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 14 }}>
              {topLeads.map((r, i) => {
                const br = briefBy[r.lease.tenant_id];
                const emailText = br ? `Subject: ${br.email_subject || ''}\n\n${br.email_body || ''}` : '';
                return (
                  <div key={r.lease.tenant_id} onClick={() => router.push('/crm?tenant=' + r.lease.tenant_id)}
                    style={{ cursor: 'pointer', background: 'linear-gradient(180deg,var(--panel2),var(--panel))', border: '1px solid rgba(227,210,164,.22)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: '#e3d2a4', letterSpacing: '-.5px' }}>{r.score}</div>
                      <div className="t-sub">#{i + 1}</div>
                      {sigTenants.has(r.lease.tenant_id) ? <span style={{ marginLeft: 'auto' }}><Pill cls="p-green">▲ signal</Pill></span> : null}
                    </div>
                    <div className="t-main" style={{ marginTop: 4, fontSize: 15 }}>{r.lease.tenant_name}</div>
                    <div className="t-sub">{whyOf(r.breakdown)}</div>
                    <div className="t-sub" style={{ marginTop: 4 }}>
                      {r.lease.building_name}{r.lease.size_sqm ? ' · ' + Math.round(r.lease.size_sqm).toLocaleString() + ' m²' : ''} · exp {dfmt(r.lease.expiry_date)}
                    </div>

                    {br ? (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                        {br.headline ? <div style={{ fontSize: 12, fontWeight: 700, color: '#e3d2a4', marginBottom: 6 }}>{br.headline}</div> : null}
                        <div style={{ fontSize: 12.5, color: '#cdd8e8', fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{br.opener}&rdquo;</div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <CopyBtn text={br.opener} label="Copy opener" />
                          {br.email_body ? <CopyBtn text={emailText} label="Copy email" /> : null}
                        </div>
                      </div>
                    ) : (
                      <div className="t-sub" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', fontStyle: 'italic' }}>
                        AI brief generates on the next overnight run.
                      </div>
                    )}
                  </div>
                );
              })}
              {topLeads.length === 0 ? <div className="t-sub">Load data to see ranked leads.</div> : null}
            </div>
          </div>
        </div>

        {/* compact actionable row */}
        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="hd"><h2>My clients — critical dates</h2><span className="tag">stay proactive</span></div>
            <div className="bd pad">
              {clientItems.length === 0 ? (
                <div className="t-sub">No client critical dates. Tag a tenant as a Client in the CRM to track them here.</div>
              ) : clientItems.map((c) => (
                <div key={c.id} className="minirow" onClick={() => router.push('/crm?tenant=' + c.tenant_id)}>
                  <span><b>{c.tenant}</b><br /><span className="t-sub">{c.building} · {c.type}</span></span>
                  <Pill cls="p-slate">{dfmt(c.date)}</Pill>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="hd"><h2>Follow-ups</h2><span className="tag">upcoming</span></div>
            <div className="bd pad">
              {followups.length === 0 ? (
                <div className="t-sub">No upcoming follow-ups. Log an action from a call or signal.</div>
              ) : followups.map((a) => (
                <div key={a.id} className="minirow" onClick={() => router.push('/crm?tenant=' + a.tenant_id)}>
                  <span><b>{tName[a.tenant_id] || 'Tenant'}</b><br /><span className="t-sub">{a.next_action || a.type}</span></span>
                  <Pill cls="p-amber">{dfmt(a.next_action_date)}</Pill>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
