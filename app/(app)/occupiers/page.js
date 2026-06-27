'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useLeases } from '../../../lib/data';
import { dfmt, fmt } from '../../../lib/format';
import { occupiers, phaseLabel, STATUSES, DISMISSED } from '../../../lib/occupier';

const ARCHES = ['All', 'Multi-market', 'Multi-site', 'Staggered leases', 'Single site'];
const READS = [['all', 'Any timing'], ['deciding', 'Deciding now'], ['live', 'Window open'], ['portfolio', 'Portfolio plays']];

export default function OccupiersPage() {
  const { rows, loading } = useLeases();
  const [override, setOverride] = useState({});
  const [working, setWorking] = useState(true);
  const [nicheOnly, setNicheOnly] = useState(false);
  const [arch, setArch] = useState('All');
  const [read, setRead] = useState('all');
  const [q, setQ] = useState('');
  const router = useRouter();

  const list = useMemo(() => {
    const all = occupiers(rows, (id) => override[id]);
    return all
      .filter((o) => {
        if (working && o.dismissed) return false;
        if (nicheOnly && !o.tenant_obj?.niche_category) return false;
        if (arch !== 'All' && o.archetype !== arch) return false;
        if (read === 'deciding' && o.phase !== 'deciding') return false;
        if (read === 'live' && !(o.phase === 'live' || o.phase === 'deciding')) return false;
        if (read === 'portfolio' && !(o.archetype === 'Multi-market' || o.archetype === 'Multi-site')) return false;
        if (q && !o.name.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
  }, [rows, override, working, nicheOnly, arch, read, q]);

  async function setStatus(id, val) {
    setOverride((s) => ({ ...s, [id]: val }));
    const { error } = await supabase.from('tenants').update({ occupier_status: val || null }).eq('id', id);
    if (error) alert(error.message);
  }

  return (
    <>
      <Topbar title="Occupiers" sub="Companies, not leases — ranked by who's likely deciding now">
        <button className={'btn' + (working ? ' primary' : '')} onClick={() => setWorking((v) => !v)} title="hide dismissed">
          {working ? 'Working list' : 'Show all'}
        </button>
      </Topbar>
      <div className="wrap">
        <div className="filters">
          {READS.map(([k, lab]) => (
            <button key={k} className={'chip' + (read === k ? ' on' : '')} onClick={() => setRead(k)}>{lab}</button>
          ))}
          <select value={arch} onChange={(e) => setArch(e.target.value)}>
            {ARCHES.map((a) => <option key={a} value={a}>{a === 'All' ? 'All shapes' : a}</option>)}
          </select>
          <button className={'btn' + (nicheOnly ? ' primary' : '')} onClick={() => setNicheOnly((v) => !v)}>{nicheOnly ? '✓ My verticals' : 'My verticals'}</button>
          <input placeholder="search company…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{list.length} occupiers</span>
        </div>

        <div className="banner info">
          Ranked by <b>decision window</b>, not raw expiry: big occupiers decide 2–4 yrs out (and get represented early),
          small ones decide late. <b>Portfolio plays</b> (multi-market / multi-site) need no expiry trigger — that's the
          uncontested ground. Set a status to teach the list; dismissed occupiers drop off and never resurface.
        </div>

        <div className="card"><div className="bd">
          {loading ? <Loading /> : (
            <table className="cardify">
              <thead><tr>
                <th>Occupier</th><th className="num">Footprint</th><th>Markets</th>
                <th>Next expiry</th><th>Read</th><th>The play</th><th>Status</th>
              </tr></thead>
              <tbody>
                {list.map((o) => {
                  const [pc, pl] = phaseLabel(o);
                  return (
                    <tr key={o.id} style={o.dismissed ? { opacity: 0.5 } : undefined}>
                      <td data-label="Occupier">
                        <div className="t-main" style={{ cursor: 'pointer' }} onClick={() => router.push('/crm?tenant=' + o.id)}>{o.name}</div>
                        {o.tenant_obj?.niche_category ? <div className="t-sub">{o.tenant_obj.niche_category}</div> : null}
                      </td>
                      <td className="num" data-label="Footprint">{fmt(o.area)} m²<div className="t-sub">{o.sites} {o.sites === 1 ? 'lease' : 'leases'} · {o.nLoc} bldg</div></td>
                      <td className="t-sub" data-label="Markets">{o.markets.join(', ') || '—'}</td>
                      <td data-label="Next expiry">{o.next ? <>{dfmt(o.next.expiry_date)}<div className="t-sub" onClick={() => router.push('/stack?b=' + encodeURIComponent(o.next.building_name))} style={{ cursor: 'pointer', color: 'var(--brand)' }}>{o.next.building_name}</div></> : '—'}</td>
                      <td data-label="Read"><Pill cls={pc}>{pl}</Pill></td>
                      <td className="cardcol" style={{ maxWidth: 320 }} data-label="The play">
                        <Pill cls={o.archetype === 'Multi-market' ? 'p-green' : 'p-slate'}>{o.archetype}</Pill>
                        <div className="t-sub" style={{ marginTop: 4 }}>{o.thesis}</div>
                      </td>
                      <td data-label="Status" onClick={(e) => e.stopPropagation()}>
                        <div className="triage">
                          <button className={'tu' + (o.status === 'Active Target' ? ' on' : '')} title="Pursue → Active Target"
                            onClick={() => setStatus(o.id, o.status === 'Active Target' ? '' : 'Active Target')}>👍</button>
                          <button className={'tw' + (o.status === 'Watching' ? ' on' : '')} title="Watch"
                            onClick={() => setStatus(o.id, o.status === 'Watching' ? '' : 'Watching')}>❓</button>
                          <button className={'td' + (DISMISSED.includes(o.status) ? ' on' : '')} title="Not for me → dismiss"
                            onClick={() => setStatus(o.id, 'Not a Fit')}>👎</button>
                        </div>
                        <select value={o.status || ''} onChange={(e) => setStatus(o.id, e.target.value)} style={{ fontSize: 11, marginTop: 6 }}>
                          <option value="">— or set —</option>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 ? <tr><td colSpan={7} className="empty">No occupiers match. Loosen the filters.</td></tr> : null}
              </tbody>
            </table>
          )}
        </div></div>
      </div>
    </>
  );
}
