'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useTable } from '../../../lib/data';
import { dfmt } from '../../../lib/format';

const daysAgo = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
const ago = (ts) => { const d = daysAgo(ts); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

export default function PatrolPage() {
  const { rows: scans, loading } = useTable('board_scans', { select: '*', order: { col: 'scanned_at', asc: false } });
  const router = useRouter();

  const buildings = useMemo(() => {
    const m = {};
    for (const s of scans) {
      const k = s.building_id || s.building_name;
      (m[k] = m[k] || []).push(s);
    }
    return Object.values(m).map((list) => {
      const sorted = list.slice().sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : -1));
      const latest = sorted[0];
      const prev = sorted[1];
      const trend = prev ? (latest.occupier_count || 0) - (prev.occupier_count || 0) : 0;
      return {
        id: latest.building_id, name: latest.building_name || '(unknown building)',
        scans: sorted.length, latest, prev, trend,
        stale: daysAgo(latest.scanned_at) > 90,
      };
    }).sort((a, b) => (b.latest.gone_count || 0) - (a.latest.gone_count || 0) || (a.latest.scanned_at < b.latest.scanned_at ? 1 : -1));
  }, [scans]);

  if (loading) return (<><Topbar title="Building patrol" /><div className="wrap"><Loading /></div></>);

  return (
    <>
      <Topbar title="Building patrol" sub="Occupancy over time — re-scan boards to track churn and spot vacancies" />
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="banner info" style={{ marginBottom: 16 }}>
          Every lobby-board scan is saved as a dated snapshot. Re-scan a building now and then and LEX shows you what
          changed — tenants gone (space freeing up) and new arrivals (off-market) — building a record no data vendor sells.
        </div>

        {buildings.length === 0 ? (
          <div className="empty">No board scans yet. Scan a lobby board in <b>Lobby board</b> mode (with the building picked) and it’ll start tracking here.</div>
        ) : (
          <div className="card"><div className="bd">
            <table className="cardify">
              <thead><tr>
                <th>Building</th><th className="num">Occupiers</th><th className="num">Δ since last</th>
                <th>Gone</th><th>New</th><th>Last scan</th>
              </tr></thead>
              <tbody>
                {buildings.map((b, i) => (
                  <tr key={i} onClick={() => b.id && router.push('/stack?b=' + encodeURIComponent(b.name))} style={{ cursor: b.id ? 'pointer' : 'default' }}>
                    <td data-label="Building"><div className="t-main">{b.name}</div><div className="t-sub">{b.scans} scan{b.scans === 1 ? '' : 's'}{b.stale ? ' · stale' : ''}</div></td>
                    <td className="num" data-label="Occupiers">{b.latest.occupier_count ?? '—'}</td>
                    <td className="num" data-label="Δ since last">{b.prev ? (b.trend > 0 ? '▲ +' + b.trend : b.trend < 0 ? '▼ ' + b.trend : '—') : '—'}</td>
                    <td data-label="Gone">{b.latest.gone_count ? <Pill cls="p-amber">{b.latest.gone_count}</Pill> : '—'}</td>
                    <td data-label="New">{b.latest.new_count ? <Pill cls="p-green">{b.latest.new_count}</Pill> : '—'}</td>
                    <td data-label="Last scan">{ago(b.latest.scanned_at)}<div className="t-sub">{dfmt(b.latest.scanned_at)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </div>
    </>
  );
}
