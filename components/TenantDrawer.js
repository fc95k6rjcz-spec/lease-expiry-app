'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Drawer, Pill } from './ui';
import { ContactForm, SignalForm, TenantForm } from './forms';
import LogActionForm from './LogActionForm';
import { dfmt, money0, sqm, expClass, rentOf } from '../lib/format';

const liUrl = (c, company) =>
  c.linkedin_url ||
  'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent((c.full_name || '') + ' ' + (company || ''));

export default function TenantDrawer({ account, onClose, onOpenLease, onChanged }) {
  const tenant_id = account?.id;
  const [contacts, setContacts] = useState([]);
  const [signals, setSignals] = useState([]);
  const [addContact, setAddContact] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [addSignal, setAddSignal] = useState(false);
  const [editTenant, setEditTenant] = useState(false);
  const [acts, setActs] = useState([]);
  const [logAction, setLogAction] = useState(false);

  const load = useCallback(async () => {
    if (!tenant_id) return;
    const [{ data: c }, { data: s }, { data: a }] = await Promise.all([
      supabase.from('contacts').select('*').eq('tenant_id', tenant_id).order('is_primary', { ascending: false }),
      supabase.from('signals').select('*').eq('tenant_id', tenant_id).order('detected_date', { ascending: false }),
      supabase.from('interactions').select('*').eq('tenant_id', tenant_id).order('occurred_at', { ascending: false }),
    ]);
    setContacts(c || []);
    setSignals(s || []);
    setActs(a || []);
  }, [tenant_id]);

  useEffect(() => { load(); }, [load]);

  async function delContact(id) {
    if (!confirm('Delete this contact?')) return;
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) return alert(error.message);
    load();
  }

  if (!account) return null;
  const t = account.tenant_obj || {};
  const leases = account.leases.slice().sort((a, b) => (a.months_to_expiry == null ? 1e9 : a.months_to_expiry) - (b.months_to_expiry == null ? 1e9 : b.months_to_expiry));

  return (
    <>
      <Drawer
        title={account.name}
        subtitle={`${account.leases.length} tenancies · ${Math.round(account.area).toLocaleString()} m² · ${account.buildings.size || account.buildings.length || ''} building(s)`}
        onClose={onClose}
      >
        <div className="sec-t">
          Decision-makers
          <span className="add" onClick={() => setAddContact(true)}>+ Add</span>
        </div>
        {contacts.length === 0 ? (
          <div className="enrich">
            No contacts yet. Target buyers: <b>CEO</b> &amp; <b>CFO</b> (or foreign equivalent — MD, Country Head,
            President, VP). Add them from LinkedIn / Lusha.
          </div>
        ) : (
          contacts.map((c) => (
            <div className="contactbox" key={c.id}>
              <div className="cn">
                <a href={liUrl(c, account.name)} target="_blank" rel="noreferrer" title="Open LinkedIn">{c.full_name}</a>
                {' '}{c.is_primary ? <Pill cls="p-green">primary</Pill> : null}
                <span style={{ float: 'right', cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setEditContact(c)}>edit</span>
              </div>
              <div className="ct">{c.title || c.role_category}</div>
              {c.email ? <a href={'mailto:' + c.email}>✉ {c.email}</a> : null}
              {c.mobile ? <a href={'tel:' + c.mobile}>☎ {c.mobile}</a> : null}
              {c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer">in</a> : null}
              <span style={{ marginLeft: 10, cursor: 'pointer', color: 'var(--red)', fontSize: 12 }} onClick={() => delContact(c.id)}>delete</span>
            </div>
          ))
        )}

        <div className="sec-t">
          Signals
          <span className="add" onClick={() => setAddSignal(true)}>+ Add</span>
        </div>
        {signals.length === 0 ? <div className="t-sub">No signals recorded.</div> : signals.map((s) => (
          <div className="contactbox" key={s.id} style={{ borderLeft: '3px solid var(--green)' }}>
            <div className="cn">{s.signal_type} <span style={{ float: 'right' }}><Pill cls={s.impact === 'High' ? 'p-red' : 'p-amber'}>{s.impact}</Pill></span></div>
            <div className="ct">{s.headline}</div>
            {s.detected_date ? <div className="t-sub">{dfmt(s.detected_date)}{s.source ? ' · ' + s.source : ''}</div> : null}
          </div>
        ))}

        <div className="sec-t">
          Activity &amp; follow-ups
          <span className="add" onClick={() => setLogAction(true)}>+ Log action</span>
        </div>
        {acts.length === 0 ? <div className="t-sub">No activity logged yet.</div> : acts.map((a) => (
          <div className="contactbox" key={a.id}>
            <div className="cn">{a.type}
              {a.next_action_date ? <span style={{ float: 'right' }}><Pill cls="p-amber">follow-up {dfmt(a.next_action_date)}</Pill></span> : null}
            </div>
            <div className="ct">{a.summary}</div>
            {a.next_action ? <div className="t-sub">Next: {a.next_action}</div> : null}
            <div className="t-sub">{dfmt(a.occurred_at)}</div>
          </div>
        ))}

        <div className="sec-t">Company</div>
        <div className="contactbox">
          {t.website ? <a href={'http://' + String(t.website).replace(/^https?:\/\//, '')} target="_blank" rel="noreferrer">🔗 website</a> : null}
          {t.linkedin_url ? <a href={t.linkedin_url} target="_blank" rel="noreferrer">in LinkedIn</a> : null}
          {t.industry ? <div className="t-sub" style={{ marginTop: 6 }}>{t.industry}{t.headcount ? ' · ' + t.headcount + ' staff' : ''}{t.is_foreign ? ' · foreign HQ' + (t.hq_country ? ' (' + t.hq_country + ')' : '') : ''}</div> : null}
          <div style={{ marginTop: 8 }}><span className="add" style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 700 }} onClick={() => setEditTenant(true)}>Edit company details</span></div>
        </div>

        <div className="sec-t">Tenancies</div>
        {leases.map((x) => {
          const [c, l] = expClass(x.months_to_expiry);
          return (
            <div className="minirow" key={x.id} onClick={() => onOpenLease && onOpenLease(x)}>
              <span><b>{x.building_name}</b> · {x.levels || x.suite || ''}<br /><span className="t-sub">{sqm(x.size_sqm)} · {money0(rentOf(x))} p.a.</span></span>
              <Pill cls={c}>{l}</Pill>
            </div>
          );
        })}
      </Drawer>

      {addContact && <ContactForm tenant_id={tenant_id} onClose={() => setAddContact(false)} onSaved={load} />}
      {editContact && <ContactForm initial={editContact} onClose={() => setEditContact(null)} onSaved={load} />}
      {addSignal && <SignalForm tenant_id={tenant_id} onClose={() => setAddSignal(false)} onSaved={() => { load(); onChanged && onChanged(); }} />}
      {editTenant && <TenantForm initial={t.id ? t : { id: tenant_id, legal_name: account.name }} onClose={() => setEditTenant(false)} onSaved={() => { onChanged && onChanged(); }} />}
      {logAction && <LogActionForm tenant_id={tenant_id} onClose={() => setLogAction(false)} onSaved={load} />}
    </>
  );
}
