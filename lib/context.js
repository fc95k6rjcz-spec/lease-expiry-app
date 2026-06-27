// lib/context.js — build a compact, grounded snapshot of LEX's computed
// intelligence for the chat assistant. We feed the model LEX's *analysis*
// (ranked occupiers, live signals, KPIs) — never raw rows — so it reasons over
// Rowan's edge and can't invent lease facts.
import { occupiers } from './occupier';
import { rentOf, dfmt } from './format';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const cmoney = (n) =>
  n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + Math.round(n).toLocaleString();

// @param data { leases, signals, contacts, interactions, tenants }
// @returns { text, occupiers } — text is the grounding block; occupiers is the
//          ranked list (so the UI can resolve action targets to ids).
export function buildLeadContext({ leases = [], signals = [], contacts = [], interactions = [], tenants = [] } = {}, { maxOccupiers = 60 } = {}) {
  const tName = Object.fromEntries(tenants.map((t) => [t.id, t.legal_name]));
  const hasContact = new Set(contacts.map((c) => c.tenant_id));
  const activeSignals = signals.filter((s) => (s.status || 'active') === 'active');
  const sigByTenant = new Set(activeSignals.map((s) => s.tenant_id));

  // KPIs
  const area = leases.reduce((a, x) => a + (Number(x.size_sqm) || 0), 0);
  const rent = leases.reduce((a, x) => a + (Number(rentOf(x)) || 0), 0);
  const within = (n) => leases.filter((x) => x.months_to_expiry != null && x.months_to_expiry >= 0 && x.months_to_expiry <= n).length;

  // Ranked occupiers (LEX's scoring), live ones only, top N.
  const ranked = occupiers(leases)
    .filter((o) => !o.dismissed)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxOccupiers);

  const occLines = ranked.map((o) => {
    const tags = [];
    if (sigByTenant.has(o.id)) tags.push('SIGNAL');
    if (hasContact.has(o.id)) tags.push('has-contact');
    if (o.status) tags.push(o.status);
    return `- [${o.id}] ${o.name} | score ${o.score} | ${o.archetype} | ${o.phase}` +
      ` | ${fmt(o.area)} m² over ${o.sites} lease(s)/${o.nLoc} bldg | markets: ${o.markets.join(', ') || '—'}` +
      (o.next ? ` | next expiry ${dfmt(o.next.expiry_date)} @ ${o.next.building_name}` : ' | no upcoming expiry') +
      (tags.length ? ` | ${tags.join(', ')}` : '') +
      ` | ${o.thesis}`;
  });

  const sigLines = activeSignals.slice(0, 40).map((s) =>
    `- [${s.tenant_id}] ${tName[s.tenant_id] || 'Tenant'}: ${s.signal_type} (${s.direction})` +
    (s.headline ? ` — ${s.headline}` : '') + (s.magnitude ? ` [${s.magnitude}]` : '') +
    (s.source ? ` · src ${s.source}` : ''));

  const upcoming = interactions
    .filter((a) => a.next_action_date && a.next_action_date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.next_action_date < b.next_action_date ? -1 : 1))
    .slice(0, 15)
    .map((a) => `- [${a.tenant_id}] ${tName[a.tenant_id] || 'Tenant'}: ${a.next_action || a.summary || 'follow-up'} (due ${dfmt(a.next_action_date)})`);

  const text = [
    `PORTFOLIO KPIs: ${fmt(leases.length)} tenancies · ${fmt(Math.round(area))} m² · rent roll ${cmoney(rent)} p.a. · ${within(12)} expiring ≤12mo · ${within(24)} ≤24mo · ${sigByTenant.size} tenants with live signals.`,
    '',
    `RANKED OCCUPIERS (LEX opportunity score, top ${ranked.length}; format: [tenant_id] name | score | archetype | phase | footprint | markets | next expiry | tags | thesis):`,
    occLines.join('\n') || '(none)',
    '',
    `LIVE SIGNALS (${sigLines.length}):`,
    sigLines.join('\n') || '(none)',
    '',
    `UPCOMING FOLLOW-UPS (${upcoming.length}):`,
    upcoming.join('\n') || '(none)',
  ].join('\n');

  return { text, occupiers: ranked };
}
