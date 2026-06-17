// CRM pipeline constants + pure helpers (no React).

export const RELATIONSHIPS = ['Prospect', 'Client', 'Competitor', 'Lost'];
export const PIPELINE_STEPS = ['Email', 'Call', 'Follow-up', 'Meeting', 'Proposal', 'Contract'];

export function stageIndex(pipeline) {
  const p = pipeline || {};
  let i = -1;
  PIPELINE_STEPS.forEach((s, idx) => { if (p[s]) i = idx; });
  return i;
}
export function currentStage(pipeline) {
  const i = stageIndex(pipeline);
  return i < 0 ? null : PIPELINE_STEPS[i];
}
// rough close-probability by furthest pipeline stage reached
export const STAGE_PROB = { Identified: 0.05, Email: 0.1, Call: 0.2, 'Follow-up': 0.35, Meeting: 0.55, Proposal: 0.7, Contract: 0.9 };
export function stageProbability(pipeline) {
  const s = currentStage(pipeline) || 'Identified';
  return STAGE_PROB[s] != null ? STAGE_PROB[s] : 0.05;
}

export function relPill(rel) {
  return rel === 'Client' ? 'p-green'
    : rel === 'Prospect' ? 'p-amber'
    : rel === 'Competitor' ? 'p-red'
    : 'p-slate';
}

// Nearest upcoming critical date for a lease (expiry / break / reviews).
export function criticalDates(lease) {
  const out = [];
  const add = (type, d) => { if (d) out.push({ type, date: String(d).slice(0, 10) }); };
  add('Expiry', lease.expiry_date);
  if (lease.has_break_right) add('Break', lease.break_date);
  if (lease.has_mid_term_review) add('Mid-term review', lease.mid_term_review_date);
  add('Rent review', lease.next_review_date);
  const today = new Date().toISOString().slice(0, 10);
  return out.filter((x) => x.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}
