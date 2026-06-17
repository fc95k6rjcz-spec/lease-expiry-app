// Opportunity scoring, market-rent benchmarking, and matchmaking — pure logic.
import { parseLevels, isNonContiguous } from './targets';

const median = (arr) => {
  const a = arr.filter((n) => n != null && !isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// $/sqm median per building + overall, from leases that have rent_per_sqm.
export function rentBenchmarks(rows) {
  const byB = {};
  const all = [];
  rows.forEach((x) => {
    const p = Number(x.rent_per_sqm);
    if (p && p > 0) {
      all.push(p);
      (byB[x.building_name] = byB[x.building_name] || []).push(p);
    }
  });
  const buildingMedian = {};
  Object.entries(byB).forEach(([b, arr]) => { buildingMedian[b] = median(arr); });
  return { buildingMedian, precinctMedian: median(all) };
}

// Returns { psqm, ref, pct } where pct is % above(+)/below(-) the reference.
export function benchmark(lease, bm) {
  const p = Number(lease.rent_per_sqm);
  if (!p || !bm) return null;
  const ref = bm.buildingMedian?.[lease.building_name] || bm.precinctMedian;
  if (!ref) return null;
  return { psqm: p, ref, pct: Math.round(((p - ref) / ref) * 1000) / 10 };
}

const idealWindow = (size) => (size >= 5000 ? [36, 60] : size >= 1000 ? [24, 48] : [12, 24]);

function timingScore(size, m, inHoldover) {
  if (inHoldover) return 26;
  if (m == null) return 5;
  if (m < 6) return 6;
  const [lo, hi] = idealWindow(size || 0);
  if (m >= lo && m <= hi) return 30;
  if (m < lo) return 22;
  return 14;
}

// composite 0..100 with a breakdown of contributing factors.
export function opportunityScore(lease, ctx = {}) {
  const size = Number(lease.size_sqm) || 0;
  const m = lease.months_to_expiry;
  const out = [];
  const add = (label, pts) => { if (pts) out.push({ label, pts: Math.round(pts) }); };

  add('Lease timing', timingScore(size, m, ctx.inHoldover));
  if (ctx.inHoldover) add('In holdover', 18);
  if (ctx.hasExpansionSignal) add('Expansion signal', 20);
  if (ctx.optionDue) add('Option decision due', 10);
  if (ctx.fragmentedOrMulti) add('Consolidation play', 12);
  if (ctx.benchmarkPct != null) {
    if (ctx.benchmarkPct >= 7) add('Paying above market', 10);
    else if (ctx.benchmarkPct <= -7) add('Below market (renewal risk)', 4);
  }
  add('Size / commission', Math.min(15, (size / 5000) * 15));
  if (ctx.contactable) add('Contactable', 5);

  const raw = out.reduce((s, x) => s + x.pts, 0);
  return { score: Math.min(100, Math.round(raw)), breakdown: out.sort((a, b) => b.pts - a.pts) };
}

// ---- matchmaking ----
// Space likely to come available: large leases that are expiring soon, in holdover,
// from a contracting tenant, or being consolidated out.
export function availableSpace(rows, contractingTenants, fragTenantBuildings) {
  return rows
    .filter((x) => Number(x.size_sqm) >= 400)
    .map((x) => {
      const m = x.months_to_expiry;
      const reasons = [];
      if (m != null && m >= 0 && m <= 24) reasons.push('expiring');
      if (String(x.status || '').toLowerCase() === 'holdover' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10))) reasons.push('holdover');
      if (contractingTenants?.has(x.tenant_id)) reasons.push('contracting');
      if (fragTenantBuildings?.has(x.tenant_id + '|' + x.building_name)) reasons.push('consolidating');
      return { ...x, why: reasons };
    })
    .filter((x) => x.why.length)
    .sort((a, b) => (Number(b.size_sqm) || 0) - (Number(a.size_sqm) || 0));
}

// Tenants who need space: expansion-signal tenants, or fragmented/multi-site occupiers.
export function spaceNeeders(rows, expansionTenants, needSet) {
  const m = {};
  rows.forEach((x) => {
    if (!x.tenant_id) return;
    const need = expansionTenants?.has(x.tenant_id) || needSet?.has(x.tenant_id);
    if (!need) return;
    const t = (m[x.tenant_id] = m[x.tenant_id] || { tenant_id: x.tenant_id, tenant: x.tenant_name, sqm: 0, reasons: new Set() });
    t.sqm += Number(x.size_sqm) || 0;
    if (expansionTenants?.has(x.tenant_id)) t.reasons.add('growing');
    if (needSet?.has(x.tenant_id)) t.reasons.add('fragmented/multi-site');
  });
  return Object.values(m).map((t) => ({ ...t, reasons: [...t.reasons] })).sort((a, b) => b.sqm - a.sqm);
}

// crude size match: needer wants roughly the available footprint (±40%)
export function matchSize(availSqm, needSqm) {
  if (!availSqm || !needSqm) return false;
  const lo = availSqm * 0.6, hi = availSqm * 1.6;
  return needSqm >= lo && needSqm <= hi;
}
