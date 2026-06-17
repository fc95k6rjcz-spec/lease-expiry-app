// Deal-economics modelling — net effective occupancy cost & savings. Pure math.
export function occupancyAnnual(area, faceSqm, incentivePct) {
  const a = Number(area) || 0, f = Number(faceSqm) || 0, i = Number(incentivePct) || 0;
  return Math.round(a * f * (1 - i / 100)); // net effective $ p.a.
}

export function dealModel({ currentArea, currentFace, currentInc, proposedFace, proposedInc, term, efficiency }) {
  const ca = Number(currentArea) || 0;
  const eff = Number(efficiency) || 0;
  const currentAnnual = occupancyAnnual(ca, currentFace, currentInc);
  const proposedArea = Math.round(ca * (1 - eff / 100));
  const proposedAnnual = occupancyAnnual(proposedArea, proposedFace, proposedInc);
  const annualSaving = currentAnnual - proposedAnnual;
  const t = Number(term) || 0;
  return { currentAnnual, proposedArea, proposedAnnual, annualSaving, termSaving: annualSaving * t, areaSaved: ca - proposedArea };
}
