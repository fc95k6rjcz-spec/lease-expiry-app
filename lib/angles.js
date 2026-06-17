// Deterministic "reason to call + opener" generator.
// Turns a signal/trigger + lease timing into a sharp angle and a copy-ready opener.
// No network, no AI key — instant talking points the broker can edit and send.

import { dfmt } from './format';

const lc = (s) => {
  s = String(s || '').trim().replace(/\.$/, '');
  // lowercase the first letter unless it's an acronym / proper run of caps
  if (/^[A-Z]{2,}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
};
const fmtM = (m) => (m == null ? null : m < 0 ? 'now' : m < 12 ? `~${Math.round(m)} months` : `~${(m / 12).toFixed(m < 24 ? 1 : 0)} years`);

// ctx = { months, expiryDate, inHoldover, optionDue }
export function signalAngle(sig, ctx = {}) {
  const type = sig?.signal_type || '';
  const contraction = sig?.direction === 'Contraction' || /divest|disposal/i.test(type);
  const m = ctx.months;
  const date = ctx.expiryDate ? dfmt(ctx.expiryDate) : null;

  let why;
  if (ctx.inHoldover) why = 'In holdover — most exposed they’ll ever be, and likely overpaying.';
  else if (contraction) why = 'Contracting — open to right-sizing, subleasing surplus, or renegotiating down.';
  else why = 'Growing — the current floor may be tight; expansion, relocation or a better building is in play.';

  let timing;
  if (ctx.inHoldover) timing = 'Move now — no security holding them in place.';
  else if (ctx.optionDue) timing = 'Option decision is looming — reach them before they default to a renewal.';
  else if (m == null) timing = 'No expiry on file — confirm the lease term first.';
  else if (m <= 12) timing = `Lease up in ${fmtM(m)} — act now.`;
  else if (m <= 36) timing = `Lease runs to ${date} — start early to win the mandate.`;
  else timing = `Lease runs to ${date} — plant the seed now and own the relationship before competitors.`;

  const hl = String(sig?.headline || '').replace(/\.$/, '');
  const ref = hl ? `Saw the news — ${hl}. ` : '';
  let opener;
  if (ctx.inHoldover) {
    opener = contraction
      ? `${ref}You’re holding over month-to-month right now — if you’re reviewing your footprint, let’s lock in the right outcome before the landlord does. Worth a quick call?`
      : `${ref}I also noticed you’re holding over month-to-month — exposed, and probably above market. Worth a short call to get you onto the right floor?`;
  } else {
    const whenP = date ? `your lease up around ${date}` : 'your lease coming up';
    opener = contraction
      ? `${ref}If you’re reviewing your footprint, I can help you right-size or sublease surplus space ahead of ${date || 'expiry'} — want me to run the numbers?`
      : `${ref}With ${whenP}, it’s worth a short conversation on whether your current floor still fits your growth — I can map a few options across the precinct. Free for 15 minutes?`;
  }

  return { why, timing, opener };
}

// For lease-event triggers (Targets → Reasons to call)
export function reasonAngle(key, ctx = {}) {
  const date = ctx.expiryDate ? dfmt(ctx.expiryDate) : null;
  switch (key) {
    case 'holdover':
      return { why: 'Holding over month-to-month — no security and usually above market.', opener: 'You’re exposed on a month-to-month basis right now — let’s lock in your position or test the market before the landlord does. Worth 15 minutes?' };
    case 'option':
      return { why: 'Option-to-renew decision approaching — easy to sleep-walk into a renewal.', opener: `Your option to renew is coming up${date ? ` (lease to ${date})` : ''}. Before you default to it, let’s check you’re not leaving money on the table — happy to benchmark it for you.` };
    case 'midreview':
      return { why: 'Mid-term market rent review due — the landlord will push for an uplift.', opener: 'You’ve got a market rent review due — make sure it reflects true market, not the landlord’s number. I can pull the comps so you go in informed.' };
    case 'review':
      return { why: 'Rent review due — a chance to make sure it’s fair.', opener: 'Your rent review is coming up — want me to sanity-check it against current market so you’re not overpaying?' };
    case 'break':
      return { why: 'Break option window open — real leverage, often unused.', opener: 'You’ve got a break option coming up — that’s genuine leverage to renegotiate or relocate on better terms. Let’s talk before the notice date.' };
    default:
      return { why: 'Lease event worth a proactive call.', opener: 'There’s a date coming up on your lease worth getting ahead of — happy to walk you through your options.' };
  }
}
