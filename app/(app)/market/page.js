'use client';
import { useMemo, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useTable } from '../../../lib/data';
import { fmt } from '../../../lib/format';

// Higher vacancy = more leverage for tenants (good for a tenant rep chasing moves).
const vacCls = (v) => (v >= 20 ? 'p-red' : v >= 14 ? 'p-amber' : 'p-green');
const vacLabel = (v) => (v >= 20 ? "Tenant's market" : v >= 14 ? 'Balanced' : 'Landlord-favoured');
const pct = (v) => (v == null ? '—' : Number(v).toFixed(1) + '%');

function Absorption({ v }) {
  if (v == null) return <span>—</span>;
  const up = v >= 0;
  return (
    <span style={{ color: up ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {fmt(Math.abs(Math.round(v)))} m²
    </span>
  );
}

export default function MarketPage() {
  const { rows, loading } = useTable('market_stats', { order: { col: 'stock_sqm', asc: false } });
  const [showAll, setShowAll] = useState(false);

  const lex = useMemo(
    () => rows.filter((r) => r.relevant).sort((a, b) => b.vacancy_pct - a.vacancy_pct),
    [rows]
  );
  const table = useMemo(
    () => rows.filter((r) => (showAll ? true : !r.is_aggregate)),
    [rows, showAll]
  );

  const insight = useMemo(() => {
    if (lex.length < 2) return null;
    const loose = lex[0];
    const tight = lex[lex.length - 1];
    return `Of your markets, ${loose.market} is the most tenant-favoured at ${pct(loose.vacancy_pct)} vacancy — strong leverage to pitch relocations and renegotiations. ${tight.market} is tightest at ${pct(tight.vacancy_pct)}, where options are scarce and incentives thinner.`;
  }, [lex]);

  return (
    <>
      <Topbar title="Office Markets" sub="Vacancy & supply by market · Property Council, Jan 2026">
        <button className="btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Hide national totals' : 'Show national totals'}
        </button>
      </Topbar>
      <div className="wrap">
        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="banner info">
              How much office space is available across each market, and which way demand is moving.
              <b> Vacancy</b> is the share of stock sitting empty — higher means more leverage for tenants
              (and more reason for them to move). <b>Net absorption</b> is how much space was taken up (▲) or
              given back (▼) over the last 12 months. {insight ? <><br />{insight}</> : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
              {lex.map((m) => (
                <div key={m.id} className="card" style={{ padding: 0 }}>
                  <div className="bd pad">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{m.market}</div>
                      <Pill cls={vacCls(m.vacancy_pct)}>{vacLabel(m.vacancy_pct)}</Pill>
                    </div>
                    <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6, color: 'var(--ink)' }}>
                      {pct(m.vacancy_pct)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -2 }}>vacant</div>
                    <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Stock <b style={{ color: 'var(--ink)' }}>{fmt(Math.round(m.stock_sqm))} m²</b><br />
                      Vacant space <b style={{ color: 'var(--ink)' }}>{fmt(Math.round(m.vacancy_sqm))} m²</b><br />
                      12-mth absorption <Absorption v={m.net_absorption_12m_sqm} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card"><div className="bd">
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th className="num">Stock m²</th>
                    <th className="num">Vacancy</th>
                    <th className="num">Direct</th>
                    <th className="num">Sub-lease</th>
                    <th className="num">Net supply 12m</th>
                    <th className="num">Net absorption 12m</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((m) => (
                    <tr key={m.id} style={m.is_aggregate ? { fontWeight: 700, background: 'rgba(148,163,184,.06)' } : m.relevant ? { background: 'rgba(56,189,248,.05)' } : undefined}>
                      <td>
                        {m.market}
                        {m.relevant ? <span style={{ color: 'var(--brand)', fontSize: 11, marginLeft: 6 }}>● LEX</span> : null}
                      </td>
                      <td className="num">{fmt(Math.round(m.stock_sqm))}</td>
                      <td className="num"><Pill cls={vacCls(m.vacancy_pct)}>{pct(m.vacancy_pct)}</Pill></td>
                      <td className="num">{pct(m.direct_vacancy_pct)}</td>
                      <td className="num">{pct(m.sublease_vacancy_pct)}</td>
                      <td className="num">{fmt(Math.round(m.net_supply_12m_sqm))}</td>
                      <td className="num"><Absorption v={m.net_absorption_12m_sqm} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
              Source: Property Council of Australia, Office Market Report (January 2026). Figures as at 1 Jan 2026.
            </div>
          </>
        )}
      </div>
    </>
  );
}
