// Shared formatting + lease-urgency helpers (no React, safe to import anywhere).

export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-AU'));
export const money = (n) =>
  n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-AU');
export const money0 = (n) =>
  n == null || Number(n) === 0 ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-AU');
export const sqm = (n) =>
  n == null ? '—' : Math.round(Number(n)).toLocaleString('en-AU') + ' m²';

export const dfmt = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function monthsToExpiry(expiry) {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (isNaN(d)) return null;
  return Math.round(((d - new Date()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
}

// returns [pillClassName, label]
export function expClass(m) {
  if (m == null) return ['p-slate', 'No date'];
  if (m < 0) return ['p-red', 'Expired'];
  if (m <= 6) return ['p-red', m.toFixed(0) + ' mo'];
  if (m <= 12) return ['p-amber', m.toFixed(0) + ' mo'];
  if (m <= 24) return ['p-slate', m.toFixed(0) + ' mo'];
  return ['p-green', Math.round((m / 12) * 10) / 10 + ' yr'];
}

export function unitClass(m) {
  if (m == null) return 'u-slate';
  if (m < 0) return 'u-red';
  if (m <= 12) return 'u-amber';
  if (m <= 24) return 'u-slate';
  return 'u-green';
}

// Parse a level string into a sortable numeric key (ground=0, basement<0).
export function levelKey(s) {
  s = (s || '').toLowerCase();
  if (s.includes('basement') || /^b\d/.test(s)) {
    const m = s.match(/\d+/);
    return -(m ? parseInt(m[0], 10) : 1);
  }
  const nums = (s.match(/\d+/g) || []).map((n) => parseInt(n, 10));
  if (s.includes('ground') && nums.length === 0) return 0;
  return nums.length ? Math.max(...nums) : s.includes('ground') ? 0 : 999;
}

export const rentOf = (x) => x.cur_year ?? x.rent_per_annum ?? x.base_year ?? null;

// CSV helpers ---------------------------------------------------------------
export function toCSV(rows, columns) {
  const head = columns.map((c) => c.label).join(',');
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(',')).join('\n');
  return head + '\n' + body;
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Minimal CSV parser (handles quotes, commas, newlines). Returns array of objects.
export function parseCSV(text) {
  const rows = [];
  let i = 0,
    field = '',
    row = [],
    inQ = false;
  const pushF = () => {
    row.push(field);
    field = '';
  };
  const pushR = () => {
    pushF();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') pushF();
    else if (c === '\n') pushR();
    else if (c === '\r') {
      /* skip */
    } else field += c;
    i++;
  }
  if (field.length || row.length) pushR();
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
    const o = {};
    header.forEach((h, idx) => (o[h] = r[idx] != null ? r[idx].trim() : ''));
    return o;
  });
}
