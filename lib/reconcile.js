// lib/reconcile.js
// Pure reconciliation of a scanned directory board against the leases LEX
// already holds for that building. Turns one photo into deltas:
//   - newcomers : on the board, not in our data   -> OFF-MARKET intel (the moat)
//   - departed  : in our data, not on the board    -> space likely coming available
//   - moved     : matched tenant on a different floor -> expansion/contraction signal
//   - matched   : confirmed still in place           -> freshens our confidence
// No network, no React — safe to import anywhere and unit-testable in node.
//
// IMPORTANT: only run "departed" detection in board mode. A partial list (a
// company roster, a half-readable photo) can't prove someone has left.

import { normName } from './sources';

// Normalise a floor/level string so "Level 5", "L5", "5" compare equal, and
// "Ground"/"G"/"GF" all collapse to "g". Returns '' when unknown.
export function floorKey(s) {
  const t = String(s || '').toLowerCase().trim();
  if (!t) return '';
  if (/\bground\b/.test(t) || t === 'g' || t === 'gf' || t === 'grd') return 'g';
  const nums = t.match(/\d+/g);
  if (nums) return nums.map(Number).join(',');
  return t.replace(/[^a-z0-9]/g, '');
}

const tenantOf = (x) =>
  x && (x.tenant || x.tenant_name || (x.tenant_obj && x.tenant_obj.legal_name) || '');
const floorOf = (x) => (x && (x.floor != null ? x.floor : x.levels)) || '';

/**
 * @param scanned  listings from /api/ocr: [{tenant, floor, suite, size_sqm, ...}]
 * @param existing LEX leases for this building: [{tenant_name|tenant, levels|floor}]
 * @returns { matched, newcomers, moved, departed, summary }
 */
export function reconcileBoard(scanned = [], existing = [], { detectDepartures = true } = {}) {
  // Index what we already hold, keyed by normalised tenant name.
  const known = new Map();
  for (const l of existing) {
    const name = tenantOf(l);
    const n = normName(name);
    if (!n) continue;
    if (!known.has(n)) known.set(n, { name, floor: floorOf(l), id: l.tenant_id ?? l.id ?? null, seen: false });
  }

  const matched = [];
  const newcomers = [];
  const moved = [];

  for (const s of scanned) {
    const name = tenantOf(s);
    const n = normName(name);
    if (!n) continue;
    const hit = known.get(n);
    if (!hit) {
      newcomers.push({
        tenant: name,
        floor: s.floor || '',
        suite: s.suite || '',
        size_sqm: s.size_sqm ?? null,
      });
      continue;
    }
    hit.seen = true;
    const fNew = floorKey(s.floor);
    const fOld = floorKey(hit.floor);
    if (fNew && fOld && fNew !== fOld) {
      moved.push({ tenant: name, from: hit.floor, to: s.floor || '', id: hit.id });
    } else {
      matched.push({ tenant: name, floor: s.floor || hit.floor || '', id: hit.id });
    }
  }

  const departed = [];
  if (detectDepartures) {
    for (const v of known.values()) {
      if (!v.seen) departed.push({ tenant: v.name, floor: v.floor, id: v.id });
    }
  }

  return {
    matched,
    newcomers,
    moved,
    departed,
    summary: {
      matched: matched.length,
      newcomers: newcomers.length,
      moved: moved.length,
      departed: departed.length,
    },
  };
}
