// Deal-evidence / comparable-rent logic. Net effective rent is the benchmark metric.
export const GRADES = ['Premium', 'A', 'B', 'C'];
export const CONFIDENCE = ['Verified', 'Reported', 'Rumoured'];

const median = (arr) => {
  const a = arr.filter((n) => n != null && !isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

// Straight-line net effective rent: face less incentive, $/m² p.a.
export function ner(face, incentivePct) {
  const f = Number(face);
  if (!f) return null;
  const i = Number(incentivePct) || 0;
  return Math.round(f * (1 - i / 100));
}
export const dealNER = (d) => ner(d.face_rent_sqm, d.incentive_pct);

export function compStats(deals) {
  const ners = deals.map(dealNER).filter((n) => n != null);
  return {
    count: ners.length,
    nerMin: ners.length ? Math.min(...ners) : null,
    nerMed: median(ners),
    nerMax: ners.length ? Math.max(...ners) : null,
    faceMed: median(deals.map((d) => Number(d.face_rent_sqm)).filter(Boolean)),
    incMed: median(deals.map((d) => Number(d.incentive_pct)).filter((n) => !isNaN(n) && n !== null)),
  };
}

// Lower NER is better for the tenant.
export function verdict(proposedNer, med) {
  if (proposedNer == null || med == null) return null;
  const pct = Math.round(((proposedNer - med) / med) * 1000) / 10;
  if (pct <= -5) return { pct, label: 'Below market — good deal for the tenant', tone: 'good' };
  if (pct >= 5) return { pct, label: 'Above market — expensive for the tenant', tone: 'bad' };
  return { pct, label: 'At market', tone: 'mid' };
}

export function filterComps(deals, { grade, areaSqm, monthsBack } = {}) {
  const now = Date.now();
  return deals.filter((d) => {
    if (grade && grade !== 'all' && d.grade !== grade) return false;
    if (areaSqm) { const a = Number(d.area_sqm) || 0; if (a < areaSqm * 0.5 || a > areaSqm * 2) return false; }
    if (monthsBack && d.deal_date) { if ((now - new Date(d.deal_date)) / (1000 * 60 * 60 * 24 * 30.44) > monthsBack) return false; }
    return true;
  });
}
