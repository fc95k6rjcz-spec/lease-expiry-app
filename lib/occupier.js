// lib/occupier.js — "occupier" (portfolio) intelligence.
// Treat the COMPANY as the unit, not the lease. Ranks by likely decision window
// (not just expiry), detects portfolio archetypes, and flags likely-represented.
// Pure functions — no React, safe to import anywhere.

export const DISMISSED = [
  'Already Represented', 'Already Renewed', 'Already Relocated',
  'Not a Fit', 'Do Not Contact', 'Lost Opportunity',
];
export const STATUSES = ['Active Target', 'Watching', ...DISMISSED];

// Expected decision lead time (months before expiry), by total footprint.
// Big occupiers decide early (and get represented early); small ones decide late.
function leadTime(area) {
  if (area >= 5000) return { early: 48, late: 24 };
  if (area >= 1000) return { early: 24, late: 12 };
  return { early: 9, late: 3 };
}

const fmt = (n) => Number(n || 0).toLocaleString('en-AU');

// Flex-space operators are the supply side, not occupiers to pitch — exclude them.
const OPERATORS = /\b(wework|servcorp|regus|iwg|hub australia|executive centre|justco|christie spaces|compass offices|workspace365|the great room|spaces)\b/i;

export function occupiers(leaseRows, statusOf) {
  const m = {};
  for (const x of leaseRows) {
    if (!x.tenant_id) continue;
    const o = m[x.tenant_id] || (m[x.tenant_id] = {
      id: x.tenant_id, name: x.tenant_name, tenant_obj: x.tenant_obj,
      leases: [], area: 0, markets: new Set(), buildings: new Set(),
    });
    o.leases.push(x);
    o.area += Number(x.size_sqm) || 0;
    if (x.building_obj?.market) o.markets.add(x.building_obj.market);
    o.buildings.add(x.building_name);
  }
  return Object.values(m).map((o) => enrich(o, statusOf));
}

function enrich(o, statusOf) {
  const markets = [...o.markets];
  const sites = o.leases.length;
  const nLoc = o.buildings.size;
  const future = o.leases
    .filter((l) => l.months_to_expiry != null && l.months_to_expiry >= 0)
    .sort((a, b) => a.months_to_expiry - b.months_to_expiry);
  const next = future[0] || null;
  const nextMte = next ? next.months_to_expiry : null;
  const lt = leadTime(o.area);

  let phase = 'none';
  if (nextMte != null) phase = nextMte <= lt.late ? 'deciding' : nextMte <= lt.early ? 'live' : 'watching';
  const big = o.area >= 3000;
  const repRisk = big && (phase === 'deciding' || phase === 'live');   // big + in-window = likely already gone
  const winnable = !repRisk && (phase === 'deciding' || phase === 'live');

  const operator = OPERATORS.test(o.name || '');
  let archetype = operator ? 'Flex operator' : 'Single site';
  if (!operator) {
    if (markets.length >= 2) archetype = 'Multi-market';
    else if (nLoc >= 2) archetype = 'Multi-site';
    else if (sites >= 2) archetype = 'Staggered leases';
  }

  const status = (statusOf && statusOf(o.id)) || o.tenant_obj?.occupier_status || null;
  const dismissed = operator || DISMISSED.includes(status) || ['moved', 'done'].includes(o.tenant_obj?.prospect_status || '');

  let score = phase === 'deciding' ? 100 : phase === 'live' ? 70 : phase === 'watching' ? 25 : 10;
  if (archetype === 'Multi-market') score += 30;       // white space — no expiry trigger, uncontested
  else if (archetype === 'Multi-site') score += 15;
  else if (archetype === 'Staggered leases') score += 8;
  if (o.tenant_obj?.niche_category) score += 12;       // in Rowan's verticals
  if (repRisk) score -= 55;                            // likely represented
  score += Math.min(o.area / 400, 20);
  if (status === 'Active Target') score += 25;

  return {
    id: o.id, name: o.name, tenant_obj: o.tenant_obj, leases: o.leases,
    area: Math.round(o.area), sites, nLoc, markets,
    next, nextMte, phase, repRisk, winnable, archetype,
    status, dismissed, score: Math.round(score),
    thesis: thesisOf({ archetype, markets, area: Math.round(o.area), nLoc, phase, repRisk }),
  };
}

function thesisOf({ archetype, markets, area, nLoc, phase, repRisk }) {
  const where = markets.join(' + ');
  if (archetype === 'Multi-market')
    return `${fmt(area)} m² across ${markets.length} markets (${where}) — consolidation / footprint-redesign play. No expiry trigger needed, so likely uncontested.`;
  if (archetype === 'Multi-site')
    return `${nLoc} sites in ${markets[0] || 'one market'} — co-location / consolidation opportunity.`;
  if (repRisk)
    return `Large occupier in its decision window — high chance already represented; verify before calling.`;
  if (phase === 'deciding') return `${fmt(area)} m² in ${markets[0] || '—'} — decision window open now, small enough to be self-managing.`;
  if (phase === 'live') return `${fmt(area)} m² in ${markets[0] || '—'} — entering its decision window.`;
  if (phase === 'watching') return `${fmt(area)} m² in ${markets[0] || '—'} — too early; watch for the window.`;
  return `${fmt(area)} m² in ${markets[0] || '—'}.`;
}

// UI helpers
export function phaseLabel(o) {
  if (o.repRisk) return ['p-slate', 'Likely represented'];
  if (o.phase === 'deciding') return ['p-red', 'Deciding now'];
  if (o.phase === 'live') return ['p-amber', 'Window open'];
  if (o.phase === 'watching') return ['p-slate', 'Too early'];
  return ['p-slate', 'No expiry'];
}
