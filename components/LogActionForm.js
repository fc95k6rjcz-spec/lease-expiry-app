'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Field } from './ui';

const TYPES = ['Call', 'Email', 'Meeting', 'LinkedIn message', 'Note', 'Proposal sent', 'Inspection'];

// Logs an interaction against a tenant and (optionally) marks a signal actioned.
export default function LogActionForm({ tenant_id, signalId, onClose, onSaved }) {
  const [v, setV] = useState({ type: 'Call', summary: '', next_action: '', next_action_date: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    try {
      const { error } = await supabase.from('interactions').insert({
        tenant_id,
        type: v.type,
        summary: v.summary || v.type,
        next_action: v.next_action || null,
        next_action_date: v.next_action_date || null,
      });
      if (error) throw error;
      if (signalId) await supabase.from('signals').update({ status: 'actioned' }).eq('id', signalId);
      onSaved && (await onSaved());
      onClose();
    } catch (e) {
      alert('Could not save: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Log action" onClose={onClose} onSubmit={submit} submitting={busy} submitLabel="Save">
      <div className="form-grid">
        <Field label="Type">
          <select value={v.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Follow-up date">
          <input type="date" value={v.next_action_date} onChange={set('next_action_date')} />
        </Field>
        <Field label="What happened" full>
          <textarea rows={2} value={v.summary} onChange={set('summary')} placeholder="Called CFO, sent options…" />
        </Field>
        <Field label="Next action" full>
          <input value={v.next_action} onChange={set('next_action')} placeholder="Send shortlist; call back next week" />
        </Field>
      </div>
    </Modal>
  );
}
