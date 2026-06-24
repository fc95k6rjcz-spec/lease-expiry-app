'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { Loading, Pill } from '../../../components/ui';
import { useLeases } from '../../../lib/data';
import { fmt, toCSV, downloadCSV } from '../../../lib/format';
import { normName } from '../../../lib/sources';

export default function ResearchPage() {
  const { rows, loading } = useLeases();
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const router = useRouter();

  // Build one occupier record per company from the CityScope-loaded leases.
  const idx = useMemo(() => {
    const m = {};
    rows.forEach((x) => {
      if (!x.tenant_id || !x.tenant_name) return;
      const o = m[x.tenant_id] || (m[x.tenant_id] = {
        id: x.tenant_id, name: x.tenant_name, n: normName(x.tenant_name),
        markets: new Set(), buildings: new Set(), addr: x.address, primary: x.building_name, area: 0,
        website: x.tenant_obj?.website || '',
      });
      if (x.building_obj?.market) o.markets.add(x.building_obj.market);
      o.buildings.add(x.building_name);
      const a = Number(x.size_sqm) || 0;
      if (a > o.area) { o.area = a; o.addr = x.address; o.primary = x.building_name; }
    });
    const list = Object.values(m);
    const byNorm = {};
    list.forEach((o) => { if (o.n && !byNorm[o.n]) byNorm[o.n] = o; });
    return { list, byNorm };
  }, [rows]);

  function match(name) {
    const q = normName(name);
    if (!q) return null;
    if (idx.byNorm[q]) return idx.byNorm[q];
    return idx.list.find((o) => o.n && q.length >= 4 && (o.n.includes(q) || (q.includes(o.n) && o.n.length >= 4))) || null;
  }

  function run() {
    const names = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    names.forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const o = match(name);
      out.push({
        input: name,
        found: !!o,
        id: o?.id,
        company: o?.name || '',
        building: o ? o.primary : '',
        markets: o ? [...o.markets].join(', ') : '',
        address: o?.addr || '',
        sites: o ? o.buildings.size : 0,
      });
    });
    setResults(out);
  }

  const foundN = results ? results.filter((r) => r.found).length : 0;

  function exportCsv() {
    downloadCSV('bulk-research.csv', toCSV(results || [], [
      { label: 'Input', get: (r) => r.input }, { label: 'In LEX', get: (r) => (r.found ? 'Yes' : 'No') },
      { label: 'Company', get: (r) => r.company }, { label: 'Building', get: (r) => r.building },
      { label: 'Markets', get: (r) => r.markets }, { label: 'Address', get: (r) => r.address },
    ]));
  }
  const copyUnknowns = () => {
    const u = (results || []).filter((r) => !r.found).map((r) => r.input).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(u);
  };

  return (
    <>
      <Topbar title="Bulk Research" sub="Paste a company list — see who already occupies Sydney office space" />
      <div className="wrap">
        <div className="banner info">
          Checks each company against your CityScope-loaded occupiers first (the strongest source) — instant, verified
          addresses for any that are already known. Unknowns are flagged so they can be researched against weaker sources
          (website, news) with a confidence score before they ever hit the official data.
        </div>
        <div className="card"><div className="bd pad">
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }}
            placeholder={'One company per line, or comma-separated\ne.g.\nAtlassian\nCanva\nMacquarie Group'} />
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={run} disabled={!text.trim()}>Match against LEX</button>
            {results ? <span className="count">{foundN}/{results.length} already in LEX</span> : null}
            {results ? <button className="btn" onClick={exportCsv}>Export CSV</button> : null}
            {results && foundN < results.length ? <button className="btn" onClick={copyUnknowns}>Copy unknowns</button> : null}
          </div>
        </div></div>

        {loading ? <Loading /> : results ? (
          <div className="card"><div className="bd">
            <table>
              <thead><tr><th>Company (input)</th><th>In LEX?</th><th>Building</th><th>Markets</th><th>Address</th><th>Source</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} onClick={() => r.id && router.push('/crm?tenant=' + r.id)} style={r.found ? undefined : { opacity: 0.7 }}>
                    <td className="t-main">{r.input}{r.found && r.company.toLowerCase() !== r.input.toLowerCase() ? <div className="t-sub">matched: {r.company}</div> : null}</td>
                    <td>{r.found ? <Pill cls="p-green">Yes</Pill> : <Pill cls="p-slate">Not found</Pill>}</td>
                    <td>{r.building || '—'}{r.sites > 1 ? <span className="t-sub"> +{r.sites - 1} more</span> : ''}</td>
                    <td className="t-sub">{r.markets || '—'}</td>
                    <td className="t-sub">{r.address || '—'}</td>
                    <td>{r.found ? <Pill cls="p-green">CityScope</Pill> : <span className="t-sub">needs research</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        ) : null}
      </div>
    </>
  );
}
