// lib/repfeed.js — parse the Property Daily daily email into structured
// representation signals. Pure functions, no React — testable in node.
//
// Each summary line looks like:
//   Company   -   (UPDATE) <deal type> for <size>sqm in <market> / <Agent> handling <role>
// The money field is "<Agent> handling advocacy" = that occupier already has a
// tenant rep. Anything with a competitor's name on it is effectively gone.
//
// Rowan's own firm — so "Colliers handling advocacy" is "ours", not a cold lead.
import { normName } from './sources';

export const MY_FIRM = /colliers/i;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// "Property Daily - Tuesday 23 June 2026" -> "2026-06-23"
export function parseReportDate(text) {
  const m = (text || '').match(/Property Daily\s*[-–]\s*\w+\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}

const DEAL_PATTERNS = [
  [/active requirement for/i, 'Active requirement'],
  [/upcoming requirement for/i, 'Upcoming requirement'],
  [/upcoming lease expiry/i, 'Lease expiry'],
  [/space re-commitment/i, 'Re-commitment'],
  [/space commitment/i, 'Commitment'],
];

// action -> presentation + the reversible occupier_status we set on apply.
export const ACTIONS = {
  represented: { label: 'Already repped', cls: 'p-red', status: 'Already Represented', bucket: 'suppress' },
  renewed: { label: 'Just renewed', cls: 'p-slate', status: 'Already Renewed', bucket: 'suppress' },
  committed: { label: 'Just committed', cls: 'p-slate', status: 'Already Relocated', bucket: 'suppress' },
  ours: { label: 'Your firm', cls: 'p-green', status: null, bucket: 'ours' },
  lead: { label: 'White space', cls: 'p-amber', status: null, bucket: 'lead' },
  watch: { label: 'Watch', cls: 'p-slate', status: null, bucket: 'watch' },
};

function num(s) {
  return s ? parseInt(s.replace(/,/g, ''), 10) : null;
}

function parseLine(raw) {
  const line = raw.replace(/\s+/g, ' ').trim();
  // Company is everything up to the first " - " separator.
  const m = line.match(/^(.+?)\s+[-–]\s+(?:\(UPDATE\)\s*)?(.+)$/);
  if (!m) return null;
  const company = m[1].trim();
  let body = m[2].trim();
  if (!/sqm|requirement|commitment|lease expiry/i.test(body)) return null;
  if (/^(daily briefings|my account|database)/i.test(company)) return null;

  // Split off the advocacy clause (after " / ").
  let advPart = '';
  const slash = body.split(' / ');
  let dealPart = slash[0].trim();
  if (slash.length > 1) advPart = slash.slice(1).join(' / ').trim();

  // Deal type
  let deal_type = 'Other';
  for (const [re, lab] of DEAL_PATTERNS) if (re.test(dealPart)) { deal_type = lab; break; }

  // Size
  const sz = dealPart.match(/([\d,]+)(?:\s*[-–]\s*([\d,]+))?\s*sqm/i);
  const size_min = sz ? num(sz[1]) : null;
  const size_max = sz ? (sz[2] ? num(sz[2]) : num(sz[1])) : null;

  // Expiry date "in January 2028" (only on lease-expiry lines), strip before market.
  let expiry_on = null;
  let work = dealPart;
  const exp = work.match(/\bin\s+([A-Z][a-z]+)\s+(\d{4})\s*$/);
  if (exp) { expiry_on = `${exp[1]} ${exp[2]}`; work = work.slice(0, exp.index).trim(); }

  // Market = last "in <Place>"
  const mk = work.match(/\bin\s+([A-Za-z][A-Za-z ]+?)\s*$/);
  const market = mk ? mk[1].trim() : null;

  // Agent + role
  let agent = null, agent_role = null;
  if (advPart) {
    if (/not yet appointed/i.test(advPart)) { agent_role = 'none'; }
    else {
      const a = advPart.match(/^(.+?)\s+handling\s+(.+)$/i);
      if (a) { agent = a[1].trim(); agent_role = a[2].trim().toLowerCase(); }
      else agent_role = advPart.toLowerCase();
    }
  }

  const isAdvocacy = /advocacy/i.test(agent_role || '');
  let action = 'watch';
  if (isAdvocacy && agent && MY_FIRM.test(agent)) action = 'ours';
  else if (isAdvocacy && agent) action = 'represented';
  else if (deal_type === 'Re-commitment') action = 'renewed';
  else if (deal_type === 'Commitment') action = 'committed';
  else if ((deal_type.includes('requirement') || deal_type === 'Lease expiry') && !agent) action = 'lead';

  return {
    raw_line: line, company_name: company, company_norm: normName(company),
    deal_type, size_min, size_max, market, agent, agent_role, expiry_on, action,
  };
}

// Parse a whole pasted email into { reportDate, rows }.
export function parseFeed(text) {
  const reportDate = parseReportDate(text);
  const rows = [];
  const seen = new Set();
  for (const ln of (text || '').split(/\r?\n/)) {
    const r = parseLine(ln);
    if (!r) continue;
    const key = r.company_norm + '|' + r.deal_type + '|' + (r.market || '');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return { reportDate, rows };
}
