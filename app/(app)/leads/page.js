'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases, useTable } from '../../../lib/data';
import { dfmt } from '../../../lib/format';

const MODES = [
  { id: 'sme', label: 'Unrepresented SMEs', hint: 'Small suburban/metro tenants self-managing their lease — too small for the big agencies, no incumbent adviser.' },
  { id: 'growing', label: 'Growing — urgent need', hint: 'Active expansion signal — needs space now and often has no adviser yet. Lead with the trigger.' },
  { id: 'niche', label: 'My niche', hint: 'Filter to a market (and industry) you own.' },
  { id: 'early', label: 'Early / pre-market', hint: '18–36 months out — get in before they go to market and the agencies circle.' },
];

const mte = (x) => (x.months_to_expiry == null ? 1e9 : x.months_to_expiry);
const vacOf = (m, ms) => (m && ms[m] != null ? ms[m] : null);

export default function LeadsPage() {
  const { rows, loading } = useLeases();
  const { rows: signals } = useTable('signals', { select: '*' });
  const { rows: marketStats } = useTable('market_stats', { select: 'market,vacancy_pct' });
  const [mode, setMode] = useState('sme');
  const [market, setMarket] = useState('all');
  const [industry, setIndustry] = useState('all');
  const router = useRouter();

  const vac = useMemo(() => Object.fromEntries(marketStats.map((m) => [m.market, m.vacancy_pct])), [marketStats]);
  const expSig = useMemo(() => new Set(signals.filter((s) => s.direction === 'Expansion' && (s.status || 'active') === 'active').map((s) => s.tenant_id)), [signals]);
  const sigHead = useMemo(() => {
    const m = {};
    signals.forEach((s) => { if ((s.status || 'active') === 'active' && !m[s.tenant_id]) m[s.tenant_id] = s.headline; });
    return m;
  }, [signals]);

  const markets = useMemo(() => ['all', ...Array.from(new Set(rows.map((x) => x.building_obj?.market).filter(Boolean))).sort()], [rows]);
  const industries = useMemo(() => ['all', ...Array.from(new Set(rows.map((x) => x.tenant_obj?.industry).filter(Boolean))).sort()], [rows]);

  const live = (x) => x.tenant_id && x.tenant_name && !['moved', 'done'].includes(x.tenant_obj?.prospect_status);

  const list = useMemo(() => {
    const best = {};
    const keep = (x) => { const c = best[x.tenant_id]; if (!c || mte(x) < mte(c)) best[x.tenant_id] = x; };
    rows.forEach((x) => {
      if (!live(x)) return;
      const m = x.months_to_expiry, mkt = x.building_obj?.market;
      if (mode === 'sme') {
        if (mkt && mkt !== 'Sydney CBD' && (x.size_sqm == null || x.size_sqm <= 1500) && m != null && m >= 0 && m <= 18) keep(x);
      } else if (mode === 'growing') {
        if (expSig.has(x.tenant_id) && m != null && m >= 0 && m <= 30) keep(x);
      } else if (mode === 'niche') {
        if ((market === 'all' || mkt === market) && (industry === 'all' || x.tenant_obj?.industry === industry) && m != null && m >= 0 && m <= 24) keep(x);
      } else if (mode === 'early') {
        if (mkt && mkt !== 'Sydney CBD' && m != null && m >= 18 && m <= 36) keep(x);
      }
    });
    return Object.values(best).sort((a, b) => mte(a) - mte(b)).slice(0, 50);
  }, [rows, mode, market, industry, expSig]);

  const cur = MODES.find((m) => m.id === mode);

  return (
    <>
      <Topbar title="Lead Finder" sub="Pick the angle you can actually win — the list re-targets instantly." />
      <div className="wrap">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {MODES.map((m) => (
            <button key={m.id} className={'btn' + (mode === m.id ? ' primary' : '')} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="banner info">{cur.hint}</div>

        {mode === 'niche' && (
          <div className="filters">
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              {markets.map((m) => <option key={m} value={m}>{m === 'all' ? 'All markets' : m}</option>)}
            </select>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {industries.map((i) => <option key={i} value={i}>{i === 'all' ? 'All industries' : i}</option>)}
            </select>
          </div>
        )}

        <div className="card"><div className="bd">
          {loading ? <Loading /> : (
            <table>
              <thead><tr><th>Tenant</th><th>Market</th><th>Building</th><th className="num">m²</th><th>Expiry</th><th>Angle</th></tr></thead>
              <tbody>
                {list.map((x) => {
                  const v = vacOf(x.building_obj?.market, vac);
                  return (
                    <tr key={x.tenant_id} onClick={() => router.push('/crm?tenant=' + x.tenant_id)}>
                      <td className="t-main">{x.tenant_name}</td>
                      <td>{x.building_obj?.market || '—'}{v != null ? <span className="t-sub"> · {Number(v).toFixed(0)}% vac</span> : null}</td>
                      <td className="t-sub">{x.building_name}</td>
                      <td className="num">{x.size_sqm ? Math.round(x.size_sqm).toLocaleString() : '—'}</td>
                      <td>{dfmt(x.expiry_date)}</td>
                      <td className="t-sub">
                        {mode === 'growing' && sigHead[x.tenant_id] ? <Pill cls="p-green">▲ {sigHead[x.tenant_id]}</Pill>
                          : mode === 'early' ? 'Lock the relationship early'
                          : mode === 'sme' ? 'Likely self-managing'
                          : v != null && v >= 20 ? 'Tenant-favoured market' : '—'}
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 ? <tr><td colSpan={6} className="empty">No leads match this angle right now.</td></tr> : null}
              </tbody>
            </table>
          )}
        </div></div>
        <div className="t-sub" style={{ marginTop: 8 }}>{list.length} leads · suppressed (moved/represented) tenants are hidden · click a row to open in CRM.</div>
      </div>
    </>
  );
}
