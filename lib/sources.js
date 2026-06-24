// lib/sources.js — data-source trust hierarchy for occupancy data.
// Rowan's ranking: CityScope > directory board > company website > registered (ASIC).
// Used to score confidence of every occupier record, from any source.

export const SOURCE_RANK = {
  'CityScope':        { conf: 0.95, label: 'CityScope',        note: 'Licensed CRE database — strongest baseline' },
  'Import':           { conf: 0.92, label: 'Imported (CityScope)', note: 'Loaded from a CityScope export' },
  'Directory board':  { conf: 0.85, label: 'Directory board',  note: 'Photographed on-site — live ground truth' },
  'Company website':  { conf: 0.60, label: 'Website',          note: 'Self-published — may be HQ, not this office' },
  'News':             { conf: 0.60, label: 'News',             note: 'Reported lease/relocation' },
  'LinkedIn':         { conf: 0.55, label: 'LinkedIn',         note: 'Company-listed location' },
  'Registered (ASIC)':{ conf: 0.30, label: 'Registered office', note: 'Often the accountant — not where they sit' },
};

export function sourceConf(source) {
  return SOURCE_RANK[source] || { conf: 0.4, label: source || 'Unknown', note: '' };
}

// Verified ≥0.8 · Likely ≥0.55 · Unverified below.
export function confidenceBand(c) {
  if (c >= 0.8) return ['Verified', 'p-green'];
  if (c >= 0.55) return ['Likely', 'p-amber'];
  return ['Unverified', 'p-slate'];
}

// Normalise a company name for matching (strip suffixes/punctuation).
export function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[.,/&'"()\-]/g, ' ')
    .replace(/\b(pty|ltd|limited|inc|incorporated|corporation|corp|co|group|holdings|australia|aust|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
