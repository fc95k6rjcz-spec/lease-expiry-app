'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Field } from './ui';

export const STATUS = ['Active', 'Holdover', 'Expired', 'Pre-commencement', 'Terminated'];
export const INCREASE = ['Fixed %', 'Fixed $', 'CPI', 'CPI + %', 'Market', 'None', 'Other'];
export const ROLES = [
  'CEO', 'CFO', 'Managing Director', 'Country Head', 'President', 'Vice President', 'COO',
  'Head of Property', 'Office Manager', 'Other',
];
export const SOURCES = ['LinkedIn', 'Lusha', 'ZoomInfo', 'Apollo', 'Company Website', 'Referral', 'Manual', 'Other'];
export const SIGNAL_TYPES = [
  'Headcount growth', 'Hiring activity', 'M&A / takeover', 'Funding secured', 'New patent',
  'New contract', 'Divestment / disposal', 'Relocation rumour', 'Other',
];
export const DIRECTIONS = ['Expansion', 'Contraction', 'Neutral'];
export const IMPACTS = ['High', 'Medium', 'Low'];
export const GRADES = ['Premium', 'A', 'B', 'C', 'D', 'Other'];
export const OWNER_TYPES = ['Institutional', 'REIT', 'Private', 'Government', 'Owner-Occupier', 'Syndicate', 'Unknown'];

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const strOrNull = (v) => (v === '' || v == null ? null : v);

function useForm(initial) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => {
    const t = e.target;
    const val = t.type === 'checkbox' ? t.checked : t.value;
    setV((s) => ({ ...s, [k]: val }));
  };
  return [v, set, setV];
}

function err(e) {
  alert('Could not save: ' + (e?.message || e));
}

/* ---------------- LEASE ---------------- */
export function LeaseForm({ initial, buildings, tenants, onClose, onSaved }) {
  const [v, set] = useForm({
    building_id: '', tenant_id: '', new_building: '', new_building_addr: '', new_tenant: '',
    levels: '', suite: '', size_sqm: '', rent_per_annum: '', rent_per_sqm: '',
    annual_increase_type: 'Fixed %', annual_increase_value: '', commencement_date: '', expiry_date: '',
    next_review_date: '', has_mid_term_review: false, mid_term_review_date: '',
    has_break_right: false, break_date: '', has_renewal_option: false,
    option_terms: '', status: 'Active', notes: '', ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      let building_id = v.building_id || null;
      let tenant_id = v.tenant_id || null;
      if (!building_id && v.new_building) {
        const { data, error } = await supabase
          .from('buildings')
          .insert({ name: v.new_building, street_address: v.new_building_addr || v.new_building })
          .select('id').single();
        if (error) throw error;
        building_id = data.id;
      }
      if (!tenant_id && v.new_tenant) {
        const { data, error } = await supabase
          .from('tenants').insert({ legal_name: v.new_tenant }).select('id').single();
        if (error) throw error;
        tenant_id = data.id;
      }
      const payload = {
        building_id, tenant_id,
        levels: strOrNull(v.levels), suite: strOrNull(v.suite), size_sqm: numOrNull(v.size_sqm),
        rent_per_annum: numOrNull(v.rent_per_annum), rent_per_sqm: numOrNull(v.rent_per_sqm),
        annual_increase_type: v.annual_increase_type, annual_increase_value: numOrNull(v.annual_increase_value),
        commencement_date: strOrNull(v.commencement_date), expiry_date: strOrNull(v.expiry_date),
        next_review_date: strOrNull(v.next_review_date),
        has_mid_term_review: !!v.has_mid_term_review, mid_term_review_date: strOrNull(v.mid_term_review_date),
        has_break_right: !!v.has_break_right,
        break_date: strOrNull(v.break_date), has_renewal_option: !!v.has_renewal_option,
        option_terms: strOrNull(v.option_terms), status: v.status, notes: strOrNull(v.notes),
      };
      const q = initial?.id
        ? supabase.from('leases').update(payload).eq('id', initial.id)
        : supabase.from('leases').insert(payload);
      const { error } = await q;
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={initial?.id ? 'Edit lease' : 'Add lease'} onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        <Field label="Building">
          <select value={v.building_id} onChange={set('building_id')}>
            <option value="">— select —</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.street_address}</option>
            ))}
          </select>
        </Field>
        <Field label="Tenant">
          <select value={v.tenant_id} onChange={set('tenant_id')}>
            <option value="">— select —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.legal_name}</option>
            ))}
          </select>
        </Field>
        {!v.building_id && (
          <>
            <Field label="…or new building"><input value={v.new_building} onChange={set('new_building')} /></Field>
            <Field label="New building address"><input value={v.new_building_addr} onChange={set('new_building_addr')} /></Field>
          </>
        )}
        {!v.tenant_id && (
          <Field label="…or new tenant" full><input value={v.new_tenant} onChange={set('new_tenant')} /></Field>
        )}
        <Field label="Level(s)"><input value={v.levels} onChange={set('levels')} placeholder="Level 12" /></Field>
        <Field label="Suite"><input value={v.suite} onChange={set('suite')} /></Field>
        <Field label="Area (m²)"><input type="number" step="0.01" value={v.size_sqm} onChange={set('size_sqm')} /></Field>
        <Field label="Rent $/year"><input type="number" step="0.01" value={v.rent_per_annum} onChange={set('rent_per_annum')} /></Field>
        <Field label="Rent $/m²"><input type="number" step="0.01" value={v.rent_per_sqm} onChange={set('rent_per_sqm')} /></Field>
        <Field label="Status">
          <select value={v.status} onChange={set('status')}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Increase type">
          <select value={v.annual_increase_type} onChange={set('annual_increase_type')}>{INCREASE.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Increase value"><input type="number" step="0.01" value={v.annual_increase_value} onChange={set('annual_increase_value')} placeholder="3.75" /></Field>
        <Field label="Commencement"><input type="date" value={v.commencement_date || ''} onChange={set('commencement_date')} /></Field>
        <Field label="Expiry"><input type="date" value={v.expiry_date || ''} onChange={set('expiry_date')} /></Field>
        <Field label="Next review"><input type="date" value={v.next_review_date || ''} onChange={set('next_review_date')} /></Field>
        <Field label="Mid-term market review?">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!v.has_mid_term_review} onChange={set('has_mid_term_review')} /> yes
          </label>
        </Field>
        <Field label="Mid-term review date"><input type="date" value={v.mid_term_review_date || ''} onChange={set('mid_term_review_date')} /></Field>
        <Field label="Right to break?">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!v.has_break_right} onChange={set('has_break_right')} /> yes
          </label>
        </Field>
        <Field label="Break date"><input type="date" value={v.break_date || ''} onChange={set('break_date')} /></Field>
        <Field label="Option to renew?">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!v.has_renewal_option} onChange={set('has_renewal_option')} /> yes
          </label>
        </Field>
        <Field label="Option terms"><input value={v.option_terms} onChange={set('option_terms')} placeholder="1 x 5 years" /></Field>
        <Field label="Notes" full><textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- BUILDING ---------------- */
export function BuildingForm({ initial, onClose, onSaved }) {
  const [v, set] = useForm({
    name: '', street_address: '', suburb: '', state: 'NSW', postcode: '',
    total_lettable_area_sqm: '', num_levels: '', building_grade: 'A', year_built: '',
    owner_name: '', owner_type: 'Unknown', property_manager: '', notes: '', ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const payload = {
        name: strOrNull(v.name), street_address: v.street_address, suburb: strOrNull(v.suburb),
        state: strOrNull(v.state), postcode: strOrNull(v.postcode),
        total_lettable_area_sqm: numOrNull(v.total_lettable_area_sqm), num_levels: numOrNull(v.num_levels),
        building_grade: v.building_grade, year_built: numOrNull(v.year_built),
        owner_name: strOrNull(v.owner_name), owner_type: v.owner_type,
        property_manager: strOrNull(v.property_manager), notes: strOrNull(v.notes),
      };
      const q = initial?.id
        ? supabase.from('buildings').update(payload).eq('id', initial.id)
        : supabase.from('buildings').insert(payload);
      const { error } = await q;
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? 'Edit building' : 'Add building'} onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        <Field label="Name"><input value={v.name} onChange={set('name')} /></Field>
        <Field label="Street address"><input value={v.street_address} onChange={set('street_address')} required /></Field>
        <Field label="Suburb"><input value={v.suburb} onChange={set('suburb')} /></Field>
        <Field label="State"><input value={v.state} onChange={set('state')} /></Field>
        <Field label="Postcode"><input value={v.postcode} onChange={set('postcode')} /></Field>
        <Field label="Total NLA (m²)"><input type="number" step="0.01" value={v.total_lettable_area_sqm} onChange={set('total_lettable_area_sqm')} /></Field>
        <Field label="Levels"><input type="number" value={v.num_levels} onChange={set('num_levels')} /></Field>
        <Field label="Grade"><select value={v.building_grade} onChange={set('building_grade')}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Year built"><input type="number" value={v.year_built} onChange={set('year_built')} /></Field>
        <Field label="Owner"><input value={v.owner_name} onChange={set('owner_name')} /></Field>
        <Field label="Owner type"><select value={v.owner_type} onChange={set('owner_type')}>{OWNER_TYPES.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Property manager"><input value={v.property_manager} onChange={set('property_manager')} /></Field>
        <Field label="Notes" full><textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- TENANT ---------------- */
export function TenantForm({ initial, onClose, onSaved }) {
  const [v, set] = useForm({
    legal_name: '', trading_name: '', industry: '', website: '', linkedin_url: '',
    headcount: '', is_foreign: false, hq_country: '', parent_company: '', notes: '', ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const payload = {
        legal_name: v.legal_name, trading_name: strOrNull(v.trading_name), industry: strOrNull(v.industry),
        website: strOrNull(v.website), linkedin_url: strOrNull(v.linkedin_url), headcount: numOrNull(v.headcount),
        is_foreign: !!v.is_foreign, hq_country: strOrNull(v.hq_country), parent_company: strOrNull(v.parent_company),
        notes: strOrNull(v.notes),
      };
      const q = initial?.id
        ? supabase.from('tenants').update(payload).eq('id', initial.id)
        : supabase.from('tenants').insert(payload);
      const { error } = await q;
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? 'Edit tenant' : 'Add tenant'} onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        <Field label="Legal name"><input value={v.legal_name} onChange={set('legal_name')} required /></Field>
        <Field label="Trading name"><input value={v.trading_name} onChange={set('trading_name')} /></Field>
        <Field label="Industry"><input value={v.industry} onChange={set('industry')} /></Field>
        <Field label="Headcount"><input type="number" value={v.headcount} onChange={set('headcount')} /></Field>
        <Field label="Website"><input value={v.website} onChange={set('website')} /></Field>
        <Field label="LinkedIn URL"><input value={v.linkedin_url} onChange={set('linkedin_url')} /></Field>
        <Field label="Foreign HQ?">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!v.is_foreign} onChange={set('is_foreign')} /> yes
          </label>
        </Field>
        <Field label="HQ country"><input value={v.hq_country} onChange={set('hq_country')} /></Field>
        <Field label="Parent company" full><input value={v.parent_company} onChange={set('parent_company')} /></Field>
        <Field label="Notes" full><textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- CONTACT ---------------- */
export function ContactForm({ initial, tenant_id, onClose, onSaved }) {
  const [v, set] = useForm({
    full_name: '', title: '', role_category: 'CEO', email: '', mobile: '', linkedin_url: '',
    is_primary: true, source: 'LinkedIn', notes: '', ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const payload = {
        tenant_id: initial?.tenant_id || tenant_id,
        full_name: v.full_name, title: strOrNull(v.title), role_category: v.role_category,
        email: strOrNull(v.email), mobile: strOrNull(v.mobile), linkedin_url: strOrNull(v.linkedin_url),
        is_primary: !!v.is_primary, source: v.source, notes: strOrNull(v.notes),
      };
      const q = initial?.id
        ? supabase.from('contacts').update(payload).eq('id', initial.id)
        : supabase.from('contacts').insert(payload);
      const { error } = await q;
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? 'Edit contact' : 'Add contact'} onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        <Field label="Full name"><input value={v.full_name} onChange={set('full_name')} required /></Field>
        <Field label="Title"><input value={v.title} onChange={set('title')} placeholder="Chief Financial Officer" /></Field>
        <Field label="Role bucket"><select value={v.role_category} onChange={set('role_category')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Source"><select value={v.source} onChange={set('source')}>{SOURCES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Email"><input type="email" value={v.email} onChange={set('email')} /></Field>
        <Field label="Mobile"><input value={v.mobile} onChange={set('mobile')} /></Field>
        <Field label="LinkedIn URL" full><input value={v.linkedin_url} onChange={set('linkedin_url')} /></Field>
        <Field label="Primary target?">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!v.is_primary} onChange={set('is_primary')} /> yes
          </label>
        </Field>
        <Field label="Notes" full><textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- SIGNAL ---------------- */
export function SignalForm({ tenant_id, tenants, onClose, onSaved }) {
  const [v, set] = useForm({
    tenant_id: tenant_id || '', signal_type: 'Headcount growth', direction: 'Expansion',
    impact: 'Medium', headline: '', detail: '', magnitude: '', source: '', source_url: '',
    detected_date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const payload = {
        tenant_id: v.tenant_id, signal_type: v.signal_type, direction: v.direction, impact: v.impact,
        headline: v.headline, detail: strOrNull(v.detail), magnitude: strOrNull(v.magnitude),
        source: strOrNull(v.source), source_url: strOrNull(v.source_url), detected_date: v.detected_date,
      };
      const { error } = await supabase.from('signals').insert(payload);
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add signal" onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        {!tenant_id && (
          <Field label="Tenant" full>
            <select value={v.tenant_id} onChange={set('tenant_id')} required>
              <option value="">— select —</option>
              {(tenants || []).map((t) => <option key={t.id} value={t.id}>{t.legal_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Type"><select value={v.signal_type} onChange={set('signal_type')}>{SIGNAL_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Direction"><select value={v.direction} onChange={set('direction')}>{DIRECTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Impact"><select value={v.impact} onChange={set('impact')}>{IMPACTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Magnitude"><input value={v.magnitude} onChange={set('magnitude')} placeholder="+17% YoY" /></Field>
        <Field label="Headline" full><input value={v.headline} onChange={set('headline')} required /></Field>
        <Field label="Detail" full><textarea rows={2} value={v.detail} onChange={set('detail')} /></Field>
        <Field label="Source"><input value={v.source} onChange={set('source')} placeholder="AFR / LinkedIn" /></Field>
        <Field label="Source URL"><input value={v.source_url} onChange={set('source_url')} /></Field>
        <Field label="Detected date"><input type="date" value={v.detected_date} onChange={set('detected_date')} /></Field>
      </div>
    </Modal>
  );
}
