// Pure targeting logic over the lease diary — no React, no network.

const today = () => new Date().toISOString().slice(0, 10);
const monthsFrom = (d) => Math.round(((new Date(d) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;

// "Levels 8 to 17" -> [8..17]; "Levels 9, 12, 13 and 17" -> [9,12,13,17]; "Level 44" -> [44]
export function parseLevels(text) {
  const set = new Set();
  let s = String(text || '').toLowerCase();
  s = s.replace(/(\d+)\s*(?:to|-|–)\s*(\d+)/g, (_, a, b) => {
    a = +a; b = +b;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
    return ' ';
  });
  (s.match(/\d+/g) || []).forEach((n) => set.add(+n));
  return [...set].sort((x, y) => x - y);
}

export function isNonContiguous(floors) {
  if (floors.length < 2) return false;
  return floors[floors.length - 1] - floors[0] + 1 !== floors.length;
}

// Reasons-to-call derived from a single lease's terms.
export function reasonsToCall(x) {
  const out = [];
  const m = x.months_to_expiry;
  const t = today();
  const status = String(x.status || '').toLowerCase();
  const expired = x.expiry_date && String(x.expiry_date).slice(0, 10) < t;
  if (status === 'holdover' || expired)
    out.push({ key: 'holdover', label: 'In holdover — month-to-month, no security', urg: -1 });
  if (x.has_renewal_option && m != null && m >= 0 && m <= 24)
    out.push({ key: 'option', label: 'Option-to-renew decision due', urg: m });
  if (x.has_mid_term_review && x.mid_term_review_date && String(x.mid_term_review_date).slice(0, 10) >= t)
    out.push({ key: 'midreview', label: 'Mid-term market rent review due', urg: monthsFrom(x.mid_term_review_date) });
  if (x.next_review_date && String(x.next_review_date).slice(0, 10) >= t && monthsFrom(x.next_review_date) <= 12)
    out.push({ key: 'review', label: 'Rent review due', urg: monthsFrom(x.next_review_date) });
  if (x.has_break_right && x.break_date && String(x.break_date).slice(0, 10) >= t && monthsFrom(x.break_date) <= 18)
    out.push({ key: 'break', label: 'Break option window open', urg: monthsFrom(x.break_date) });
  return out;
}

// Flatten every reason across all leases into a ranked call list.
export function reasonsList(rows) {
  const items = [];
  rows.forEach((x) => {
    reasonsToCall(x).forEach((r) =>
      items.push({
        id: x.id + ':' + r.key,
        tenant_id: x.tenant_id,
        tenant: x.tenant_name,
        building: x.building_name,
        levels: x.levels,
        sqm: x.size_sqm,
        expiry: x.expiry_date,
        reason: r.label,
        key: r.key,
        urg: r.urg,
      })
    );
  });
  return items.sort((a, b) => a.urg - b.urg);
}

// Fragmented occupiers: same tenant, >=2 leases in ONE building, non-contiguous floors.
export function fragmentedTargets(rows) {
  const g = {};
  rows.forEach((x) => {
    if (!x.tenant_id) return;
    const k = x.tenant_id + '|' + x.building_name;
    (g[k] = g[k] || { tenant_id: x.tenant_id, tenant: x.tenant_name, building: x.building_name, leases: [], sqm: 0, levelText: [] }).leases.push(x);
    g[k].sqm += Number(x.size_sqm) || 0;
    if (x.levels) g[k].levelText.push(x.levels);
  });
  return Object.values(g)
    .filter((z) => z.leases.length >= 2)
    .map((z) => {
      const floors = parseLevels(z.levelText.join(' , '));
      const nextExpiry = z.leases.map((l) => l.expiry_date).filter(Boolean).sort()[0] || null;
      return { ...z, floors, nonContig: floors.length === 0 ? true : isNonContiguous(floors), nextExpiry, count: z.leases.length };
    })
    .filter((z) => z.nonContig)
    .sort((a, b) => b.sqm - a.sqm);
}

const OPERATOR_RE = /executive centre|regus|wework|servcorp|hub australia|christie spaces|workspace|lendlease|mirvac|dexus|gpt|charter hall|stockland|investa/i;

// Multi-site occupiers: same tenant across >=2 buildings.
export function multiSiteTargets(rows, includeOperators = false) {
  const g = {};
  rows.forEach((x) => {
    if (!x.tenant_id) return;
    const t = (g[x.tenant_id] = g[x.tenant_id] || { tenant_id: x.tenant_id, tenant: x.tenant_name, buildings: new Set(), sqm: 0, leases: 0, expiries: [] });
    t.buildings.add(x.building_name);
    t.sqm += Number(x.size_sqm) || 0;
    t.leases += 1;
    if (x.expiry_date) t.expiries.push(x.expiry_date);
  });
  return Object.values(g)
    .filter((z) => z.buildings.size >= 2)
    .filter((z) => includeOperators || !OPERATOR_RE.test(z.tenant || ''))
    .map((z) => ({ ...z, buildingList: [...z.buildings], siteCount: z.buildings.size, nextExpiry: z.expiries.sort()[0] || null }))
    .sort((a, b) => b.sqm - a.sqm);
}

export function reasonPill(key) {
  return key === 'holdover' ? 'p-red' : key === 'option' ? 'p-amber' : 'p-slate';
}
