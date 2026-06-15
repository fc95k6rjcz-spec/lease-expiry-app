// Bulk-load the CityScope dataset into Supabase.
// Usage:
//   1) Put NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
//   2) npm run import           (adds data)
//      npm run import -- --reset (wipes leases/contacts/signals/tenants/buildings first)
//
// Uses the SERVICE ROLE key (server-side only) to bypass RLS. Never ship this key.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // also read .env if present
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
const db = createClient(url, key, { auth: { persistSession: false } });

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
};
const toDate = (v) => (v ? String(v).slice(0, 10) : null);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function main() {
  const file = path.join(__dirname, '..', 'data', 'cityscope.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Loaded ${rows.length} records from data/cityscope.json`);

  if (reset) {
    console.log('Resetting tables…');
    for (const t of ['signals', 'contacts', 'interactions', 'leases', 'tenants', 'buildings']) {
      const { error } = await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.warn(`  (${t}) ${error.message}`);
    }
  }

  // existing maps
  const { data: exB } = await db.from('buildings').select('id,name,street_address').limit(10000);
  const { data: exT } = await db.from('tenants').select('id,legal_name').limit(10000);
  const bMap = new Map((exB || []).map((b) => [((b.name || b.street_address) || '').toLowerCase(), b.id]));
  const tMap = new Map((exT || []).map((t) => [(t.legal_name || '').toLowerCase(), t.id]));

  const newB = new Map(), newT = new Map();
  for (const r of rows) {
    const bname = r.building || r.address;
    const bkey = (bname || '').toLowerCase();
    if (bname && !bMap.has(bkey) && !newB.has(bkey)) newB.set(bkey, { name: r.building || null, street_address: r.address || bname, cityscope_ref: r.building || null });
    const tname = r.tenant || r.lessee;
    const tkey = (tname || '').toLowerCase();
    if (tname && !tMap.has(tkey) && !newT.has(tkey)) newT.set(tkey, { legal_name: tname, website: r.web || null });
  }

  for (const part of chunk([...newB.values()], 500)) {
    const { data, error } = await db.from('buildings').insert(part).select('id,name,street_address');
    if (error) throw error;
    data.forEach((b) => bMap.set(((b.name || b.street_address) || '').toLowerCase(), b.id));
  }
  console.log(`Buildings: +${newB.size} (total mapped ${bMap.size})`);

  for (const part of chunk([...newT.values()], 500)) {
    const { data, error } = await db.from('tenants').insert(part).select('id,legal_name');
    if (error) throw error;
    data.forEach((t) => tMap.set((t.legal_name || '').toLowerCase(), t.id));
  }
  console.log(`Tenants: +${newT.size} (total mapped ${tMap.size})`);

  const leases = rows.map((r) => {
    const fixed = toNum(r.fixed), cpi = toNum(r.cpi);
    let incType = 'Other', incVal = null;
    if (fixed != null) { incType = 'Fixed %'; incVal = fixed <= 1 ? Math.round(fixed * 10000) / 100 : fixed; }
    else if (cpi != null) { incType = 'CPI'; incVal = cpi <= 1 ? Math.round(cpi * 10000) / 100 : cpi; }
    return {
      building_id: bMap.get((r.building || r.address || '').toLowerCase()) || null,
      tenant_id: tMap.get((r.tenant || r.lessee || '').toLowerCase()) || null,
      levels: r.level || null,
      suite: r.suite || null,
      size_sqm: toNum(r.area),
      rent_per_annum: toNum(r.cur_year) ?? toNum(r.base_year),
      rent_per_sqm: toNum(r.cur_sqm) ?? toNum(r.base_sqm),
      annual_increase_type: incType,
      annual_increase_value: incVal,
      commencement_date: toDate(r.start),
      expiry_date: toDate(r.expiry),
      next_review_date: toDate(r.review_date),
      review_type: r.review_type || null,
      has_renewal_option: !!r.options,
      option_terms: r.options || null,
      status: 'Active',
    };
  });

  let n = 0;
  for (const part of chunk(leases, 500)) {
    const { error } = await db.from('leases').insert(part);
    if (error) throw error;
    n += part.length;
    process.stdout.write(`\rLeases: ${n}/${leases.length}`);
  }
  console.log(`\n✅ Done. Imported ${n} tenancies.`);
}

main().catch((e) => { console.error('\n❌', e.message || e); process.exit(1); });
