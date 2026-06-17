'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Field } from './ui';
import { GRADES, CONFIDENCE, ner } from '../lib/deals';

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const strOrNull = (v) => (v === '' || v == null ? null : v);

export default function DealForm({ initial, onClose, onSaved }) {
  const [v, setV] = useState({
    building_name: '', address: '', suburb: 'Sydney', grade: 'A', tenant: '', landlord: '', floor: '',
    area_sqm: '', deal_date: '', lease_term_years: '', face_rent_sqm: '', incentive_pct: '',
    rent_basis: 'Net', review_type: '', review_value: '', source: '', confidence: 'Reported', notes: '',
    ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const preview = ner(v.face_rent_sqm, v.incentive_pct);

  async function submit() {
    setBusy(true);
    try {
      const payload = {
        building_name: strOrNull(v.building_name), address: strOrNull(v.address), suburb: strOrNull(v.suburb),
        grade: v.grade, tenant: strOrNull(v.tenant), landlord: strOrNull(v.landlord), floor: strOrNull(v.floor),
        area_sqm: numOrNull(v.area_sqm), deal_date: strOrNull(v.deal_date), lease_term_years: numOrNull(v.lease_term_years),
        face_rent_sqm: numOrNull(v.face_rent_sqm), incentive_pct: numOrNull(v.incentive_pct), rent_basis: v.rent_basis,
        review_type: strOrNull(v.review_type), review_value: numOrNull(v.review_value),
        source: strOrNull(v.source), confidence: v.confidence, notes: strOrNull(v.notes),
      };
      const q = initial?.id ? supabase.from('deals').update(payload).eq('id', initial.id) : supabase.from('deals').insert(payload);
      const { error } = await q;
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { alert('Could not save: ' + (e.message || e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={initial?.id ? 'Edit deal' : 'Record a deal'} onClose={onClose} onSubmit={submit} submitting={busy}>
      <div className="form-grid">
        <Field label="Building"><input value={v.building_name} onChange={set('building_name')} /></Field>
        <Field label="Address"><input value={v.address} onChange={set('address')} /></Field>
        <Field label="Suburb"><input value={v.suburb} onChange={set('suburb')} /></Field>
        <Field label="Grade"><select value={v.grade} onChange={set('grade')}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Tenant"><input value={v.tenant} onChange={set('tenant')} placeholder="or 'Confidential'" /></Field>
        <Field label="Landlord"><input value={v.landlord} onChange={set('landlord')} /></Field>
        <Field label="Floor"><input value={v.floor} onChange={set('floor')} /></Field>
        <Field label="Area (m²)"><input type="number" step="0.01" value={v.area_sqm} onChange={set('area_sqm')} /></Field>
        <Field label="Deal date"><input type="date" value={v.deal_date || ''} onChange={set('deal_date')} /></Field>
        <Field label="Term (years)"><input type="number" step="0.5" value={v.lease_term_years} onChange={set('lease_term_years')} /></Field>
        <Field label="Face rent $/m²"><input type="number" step="0.01" value={v.face_rent_sqm} onChange={set('face_rent_sqm')} /></Field>
        <Field label="Incentive %"><input type="number" step="0.1" value={v.incentive_pct} onChange={set('incentive_pct')} /></Field>
        <Field label="Net effective $/m²" full>
          <input value={preview != null ? '$' + preview.toLocaleString() + ' /m² (auto)' : '—'} disabled style={{ opacity: 0.8 }} />
        </Field>
        <Field label="Basis"><select value={v.rent_basis} onChange={set('rent_basis')}><option>Net</option><option>Gross</option></select></Field>
        <Field label="Confidence"><select value={v.confidence} onChange={set('confidence')}>{CONFIDENCE.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Source" full><input value={v.source} onChange={set('source')} placeholder="Your deal · broker · valuer" /></Field>
        <Field label="Notes" full><textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
