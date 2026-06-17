// Tailored to the single user — "Ro Dog" (downhill MTB / Santa Cruz).
// Owner email maps to their own name; everyone else is Ro Dog.
export const DISPLAY_NAMES = {
  'jcaruana888@gmail.com': 'Justin',
};
export function displayName(email) {
  return DISPLAY_NAMES[(email || '').toLowerCase()] || 'Ro Dog';
}
export function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

const LINES = [
  'Drop in — today’s fast lines are below.',
  'Full gas, no brakes. Let’s find some deals.',
  'Point it downhill — top leads, ranked.',
  'Santa Cruz day. Send it.',
  'Find the fast line — five live leads.',
  'Another run. Fresh signals landed overnight.',
  'Let’s shred — the market’s wide open.',
  'Pin it. The best leads are up top.',
];
export function dailyLine() {
  const day = Math.floor(Date.now() / 86400000);
  return LINES[day % LINES.length];
}
