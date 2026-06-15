import fs from 'node:fs';
function patch(file, edits) {
  if (!fs.existsSync(file)) { console.log(`SKIP ${file} (not found)`); return; }
  let s = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const [find, replace, tag] of edits) {
    if (s.includes('has_mid_term_review')) { console.log(`  • ${tag}: looks already applied`); }
    if (!s.includes(find)) { console.log(`  ! ${tag}: anchor NOT found — skipped`); continue; }
    if (s.includes(replace)) { console.log(`  • ${tag}: already applied`); continue; }
    s = s.replace(find, replace); changed++; console.log(`  ✓ ${tag}`);
  }
  if (changed) { fs.writeFileSync(file, s); console.log(`Saved ${file} (${changed} edit(s))`); }
}
patch('components/forms.js', [
  ["    next_review_date: '', has_break_right: false, break_date: '', has_renewal_option: false,",
   "    next_review_date: '', has_mid_term_review: false, mid_term_review_date: '',\n    has_break_right: false, break_date: '', has_renewal_option: false,", 'form defaults'],
  ["        next_review_date: strOrNull(v.next_review_date), has_break_right: !!v.has_break_right,",
   "        next_review_date: strOrNull(v.next_review_date),\n        has_mid_term_review: !!v.has_mid_term_review, mid_term_review_date: strOrNull(v.mid_term_review_date),\n        has_break_right: !!v.has_break_right,", 'save payload'],
  ["        <Field label=\"Next review\"><input type=\"date\" value={v.next_review_date || ''} onChange={set('next_review_date')} /></Field>",
   "        <Field label=\"Next review\"><input type=\"date\" value={v.next_review_date || ''} onChange={set('next_review_date')} /></Field>\n        <Field label=\"Mid-term market review?\">\n          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>\n            <input type=\"checkbox\" style={{ width: 'auto' }} checked={!!v.has_mid_term_review} onChange={set('has_mid_term_review')} /> yes\n          </label>\n        </Field>\n        <Field label=\"Mid-term review date\"><input type=\"date\" value={v.mid_term_review_date || ''} onChange={set('mid_term_review_date')} /></Field>", 'form fields'],
]);
patch('components/LeaseDrawer.js', [
  ["          <dt>Next review</dt>\n          <dd>{dfmt(x.next_review_date)}{x.review_type ? ' · ' + x.review_type : ''}</dd>",
   "          <dt>Next review</dt>\n          <dd>{dfmt(x.next_review_date)}{x.review_type ? ' · ' + x.review_type : ''}</dd>\n          <dt>Mid-term review</dt>\n          <dd>{x.has_mid_term_review ? dfmt(x.mid_term_review_date) : 'No'}</dd>", 'drawer display'],
]);
console.log('\nDone.');
