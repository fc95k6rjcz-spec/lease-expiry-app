'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases } from '../../../lib/data';
import { occupiers } from '../../../lib/occupier';
import { pipelineValue, DEFAULT_FEE_PCT } from '../../../lib/commission';

const cmoney = (n) =>
  n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n).toLocaleString();

export default function MoneyPage() {
  const { rows, loading } = useLeases();
  const [feePct, setFeePct] = useState(DEFAULT_FEE_PCT);
  const router = useRouter();

  const pv = useMemo(() => {
    const occ = occupiers(rows).filter((o) => !o.dismissed);
    return pipelineValue(occ, { feePct });
  }, [rows, feePct]);

  if (loading) return (<><Topbar title="Pipeline value" /><div className="wrap"><Loading /></div></>);

  return (
    <>
      <Topbar title="Pipeline value" sub="Your live leads, weighted by likely commission" />
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="bd pad" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 40px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#e3d2a4', lineHeight: 1.1 }}>{cmoney(pv.total)}</div>
              <div className="t-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Expected commission (weighted)</div>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{pv.topShare}%</div>
              <div className="t-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Carried by your top 5</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <label className="t-sub" style={{ display: 'block' }}>Assumed fee: {(feePct * 100).toFixed(1)}% of annual rent</label>
              <input type="range" min="5" max="20" step="0.5" value={feePct * 100}
                onChange={(e) => setFeePct(Number(e.target.value) / 100)} style={{ width: 180 }} />
            </div>
          </div>
        </div>

        <div className="banner info" style={{ marginBottom: 16 }}>
          Each lead’s value = estimated leasing fee (annual rent × fee %) × win-probability (from its decision phase and
          opportunity score). Sorted by the money at stake, so you work the dollars — not just the score.
        </div>

        <div className="card"><div className="bd">
          <table className="cardify">
            <thead><tr>
              <th>Occupier</th><th className="num">Fee if won</th><th className="num">Win %</th><th className="num">Expected</th><th>Phase</th>
            </tr></thead>
            <tbody>
              {pv.ranked.slice(0, 60).map((r) => (
                <tr key={r.id} onClick={() => router.push('/crm?tenant=' + r.id)} style={{ cursor: 'pointer' }}>
                  <td data-label="Occupier"><div className="t-main">{r.name}</div></td>
                  <td className="num" data-label="Fee if won">{cmoney(r.fee)}</td>
                  <td className="num" data-label="Win %">{Math.round(r.prob * 100)}%</td>
                  <td className="num" data-label="Expected"><b style={{ color: '#e3d2a4' }}>{cmoney(r.expected)}</b></td>
                  <td data-label="Phase"><Pill cls="p-slate">{r.phase}</Pill></td>
                </tr>
              ))}
              {pv.ranked.length === 0 ? <tr><td colSpan={5} className="empty">No rent data to value yet.</td></tr> : null}
            </tbody>
          </table>
        </div></div>
      </div>
    </>
  );
}
