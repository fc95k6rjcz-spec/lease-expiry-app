'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { monthsToExpiry, levelKey } from './format';

// Flatten a lease row (with embedded building + tenant) into a UI record.
export function flattenLease(l) {
  const b = l.building || null;
  const t = l.tenant || null;
  const buildingName = b ? b.name || b.street_address || '(unnamed)' : '(unnamed)';
  return {
    ...l,
    building_name: buildingName,
    address: b ? b.street_address : '',
    suburb: b ? b.suburb : '',
    tenant_name: t ? t.legal_name : '',
    building_obj: b,
    tenant_obj: t,
    months_to_expiry: monthsToExpiry(l.expiry_date),
    lvlkey: levelKey(l.levels),
  };
}

const LEASE_SELECT =
  '*, building:buildings(*), tenant:tenants(*)';

// ---- Client-side cache (stale-while-revalidate) ----------------------------
// Data is fetched once and kept in module memory, which survives client-side
// navigation. Returning to a page renders instantly from cache; we only hit the
// network again in the background when the cache is older than CACHE_TTL. This
// is what stops "back to cockpit" from re-downloading the whole portfolio.
const CACHE_TTL = 45000; // ms
let _leasesCache = null;            // { rows, ts }
const _tableCache = new Map();      // key -> { rows, ts }

export function useLeases() {
  const [rows, setRows] = useState(() => _leasesCache?.rows || []);
  const [loading, setLoading] = useState(() => !_leasesCache);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    const all = [];
    const step = 1000; // Supabase caps each response at ~1000 rows — page through all.
    for (let from = 0; ; from += step) {
      const { data, error } = await supabase
        .from('leases')
        .select(LEASE_SELECT)
        .range(from, from + step - 1);
      if (error) { setError(error.message); setLoading(false); return; }
      all.push(...(data || []));
      if (!data || data.length < step) break;
    }
    const mapped = all.map(flattenLease);
    _leasesCache = { rows: mapped, ts: Date.now() };
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (_leasesCache) {
      setRows(_leasesCache.rows);
      setLoading(false);
      if (Date.now() - _leasesCache.ts > CACHE_TTL) fetchAll(true); // refresh quietly
    } else {
      fetchAll(false);
    }
  }, [fetchAll]);

  // reload() after a mutation refreshes silently (we already have data on screen)
  return { rows, loading, error, reload: () => fetchAll(true) };
}

export function useTable(table, { select = '*', order } = {}) {
  // depend on primitives, not the `order` object identity (which changes each
  // render and would otherwise re-create the fetch and loop the effect).
  const orderCol = order?.col;
  const orderAsc = order?.asc;
  const key = `${table}|${select}|${orderCol || ''}|${orderAsc !== false}`;

  const [rows, setRows] = useState(() => _tableCache.get(key)?.rows || []);
  const [loading, setLoading] = useState(() => !_tableCache.has(key));
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    const all = [];
    const step = 1000; // page past the ~1000-row API cap
    for (let from = 0; ; from += step) {
      let q = supabase.from(table).select(select).range(from, from + step - 1);
      if (orderCol) q = q.order(orderCol, { ascending: orderAsc !== false });
      const { data, error } = await q;
      if (error) { setError(error.message); setLoading(false); return; }
      all.push(...(data || []));
      if (!data || data.length < step) break;
    }
    _tableCache.set(key, { rows: all, ts: Date.now() });
    setRows(all);
    setLoading(false);
  }, [table, select, orderCol, orderAsc, key]);

  useEffect(() => {
    const c = _tableCache.get(key);
    if (c) {
      setRows(c.rows);
      setLoading(false);
      if (Date.now() - c.ts > CACHE_TTL) fetchAll(true);
    } else {
      fetchAll(false);
    }
  }, [key, fetchAll]);

  return { rows, loading, error, reload: () => fetchAll(true), setRows };
}

// Aggregate leases into per-building summaries (client-side).
export function buildingSummaries(leaseRows) {
  const m = {};
  for (const x of leaseRows) {
    const k = x.building_id || x.building_name;
    const s =
      m[k] ||
      (m[k] = {
        id: x.building_id,
        name: x.building_name,
        address: x.address,
        leases: 0,
        area: 0,
        levels: new Set(),
        tenants: new Set(),
        exp12: 0,
        exp24: 0,
      });
    s.leases++;
    if (x.size_sqm) s.area += Number(x.size_sqm);
    if (x.levels) s.levels.add(x.levels);
    if (x.tenant_name) s.tenants.add(x.tenant_name);
    const mte = x.months_to_expiry;
    if (mte != null && mte >= 0 && mte <= 12) s.exp12++;
    if (mte != null && mte >= 0 && mte <= 24) s.exp24++;
  }
  return Object.values(m)
    .map((s) => ({ ...s, levels: s.levels.size, tenants: s.tenants.size }))
    .sort((a, b) => b.leases - a.leases);
}

// Aggregate leases into per-tenant accounts (client-side).
export function tenantSummaries(leaseRows) {
  const m = {};
  for (const x of leaseRows) {
    if (!x.tenant_id) continue;
    const s =
      m[x.tenant_id] ||
      (m[x.tenant_id] = {
        id: x.tenant_id,
        name: x.tenant_name,
        tenant_obj: x.tenant_obj,
        leases: [],
        area: 0,
        buildings: new Set(),
      });
    s.leases.push(x);
    if (x.size_sqm) s.area += Number(x.size_sqm);
    s.buildings.add(x.building_name);
  }
  return Object.values(m).sort((a, b) => b.area - a.area);
}
