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
