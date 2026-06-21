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

export function useLeases() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const all = [];
    const step = 1000; // Supabase caps each response at ~1000 rows — page through all.
    for (let from = 0; ; from += step) {
      const { data, error } = await supabase
        .from('leases')
        .select(LEASE_SELECT)
        .range(from, from + step - 1);
      if (error) { setError(error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < step) break;
    }
    setRows(all.map(flattenLease));
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, loading, error, reload };
}

export function useTable(table, { select = '*', order } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // depend on primitives, not the `order` object identity (which changes each
  // render and would otherwise re-create `reload` and loop the effect).
  const orderCol = order?.col;
  const orderAsc = order?.asc;

  const reload = useCallback(async () => {
    setLoading(true);
    const all = [];
    const step = 1000; // page past the ~1000-row API cap
    for (let from = 0; ; from += step) {
      let q = supabase.from(table).select(select).range(from, from + step - 1);
      if (orderCol) q = q.order(orderCol, { ascending: orderAsc !== false });
      const { data, error } = await q;
      if (error) { setError(error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < step) break;
    }
    setRows(all);
    setLoading(false);
  }, [table, select, orderCol, orderAsc]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, loading, error, reload, setRows };
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
