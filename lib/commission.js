// lib/commission.js — dollar-weight the pipeline.
// Turns LEX's opportunity scoring into expected commission, so leads can be
// ranked by money at stake, not just by score. Pure functions, no network.
//
// The fee model is a transparent, adjustable proxy: estimated leasing fee =
// annual gross rent × feePct. CRE leasing fees vary, so feePct is a parameter
// Rowan can calibrate later (default 12.5%). Win-probability comes from the
// occupier's decision phase, nudged by its opportunity score.
import { rentOf } from './format';

export const DEFAULT_FEE_PCT = 0.125;

// Estimated leasing fee earned if this single lease is won.
export function leaseFee(lease, feePct = DEFAULT_FEE_PCT) {
  const rent = Number(rentOf(lease)) || 0;
  return rent * feePct;
}

// Probability of winning the mandate, from decision phase + opportunity score.
// Caps at 0.6 — nothing is a sure thing until it's signed.
export function winProb({ phase, score } = {}) {
  const base = phase === 'deciding' ? 0.35 : phase === 'live' ? 0.20 : phase === 'watching' ? 0.07 : 0.03;
  const s = Math.max(0, Math.min(1, (Number(score) || 0) / 160));
  return Math.round(Math.min(0.6, base + s * 0.15) * 100) / 100;
}

// Expected commission for one occupier = (sum of its lease fees) × win-prob.
export function occupierValue(o, feePct = DEFAULT_FEE_PCT) {
  const fee = (o?.leases || []).reduce((a, l) => a + leaseFee(l, feePct), 0);
  const prob = winProb(o);
  return { fee: Math.round(fee), prob, expected: Math.round(fee * prob) };
}

// Rank occupiers by expected commission and show where the money concentrates.
// Returns { ranked, total, topShare } where topShare is the % of total value
// carried by the top `concentrateTop` occupiers (default 5).
export function pipelineValue(occupiers = [], { feePct = DEFAULT_FEE_PCT, concentrateTop = 5 } = {}) {
  const ranked = occupiers
    .map((o) => ({ id: o.id, name: o.name, phase: o.phase, score: o.score, ...occupierValue(o, feePct) }))
    .filter((r) => r.expected > 0)
    .sort((a, b) => b.expected - a.expected);
  const total = ranked.reduce((a, r) => a + r.expected, 0);
  const topSum = ranked.slice(0, concentrateTop).reduce((a, r) => a + r.expected, 0);
  const topShare = total > 0 ? Math.round((topSum / total) * 100) : 0;
  return { ranked, total, topShare };
}
