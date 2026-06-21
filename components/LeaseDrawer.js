'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { Drawer, Pill } from './ui';
import { LeaseForm } from './forms';
import { dfmt, money0, sqm, expClass, rentOf } from '../lib/format';
import { RELATIONSHIPS } from '../lib/crm';

export default function LeaseDrawer({ lease, buildings, tenants, onClose, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [rel, setRel] = useState(lease?.tenant_obj?.relationship || null);
  if (!lease) return null;
  const x = lease;
  async function setRelationship(r) {
    if (!x.tenant_id) return;
    const { error } = await supabase.from('tenants').update({ relationship: r }).eq('id', x.tenant_id);
    if (error) return alert(error.message);
    setRel(r);
    onChanged && onChanged();
  }
  const [c, l] = expClass(x.months_to_expiry);
  const inc =
    x.annual_increase_value != null && x.annual_increase_type
      ? `${x.annual_increase_value}${x.annual_increase_type.includes('%') ? '%' : ''} · ${x.annual_increase_type}`
      : x.annual_increase_type || '—';

  async function del() {
    if (!confirm('Delete this lease? This cannot be undone.')) return;
    const { error } = await supabase.from('leases').delete().eq('id', x.id);
    if (error) return alert('Delete failed: ' + error.message);
    onChanged && (await onChanged());
    onClose();
  }

  return (
    <>
      <Drawer
        title={x.tenant_name || '—'}
        subtitle={`${x.building_name}${x.address ? ' · ' + x.address : ''}`}
        onClose={onClose}
      >
        <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill cls={c}>{l === 'Expired' ? 'Expired' : 'Expires in ' + l}</Pill>
          <Pill cls="p-slate">{x.status || 'Active'}</Pill>
        </div>
        {x.building_name ? (
          <div style={{ marginBottom: 14 }}>
            <Link href={'/stack?b=' + encodeURIComponent(x.building_name)} onClick={onClose}>▥ View {x.building_name} stack plan →</Link>
          </div>
        ) : null}

        <div className="sec-t">
          Lease
          <span className="add" onClick={() => setEditing(true)}>Edit</span>
        </div>
        <dl className="kv">
          <dt>Level / Suite</dt>
          <dd>{x.levels || '—'}{x.suite ? ' · ' + x.suite : ''}</dd>
          <dt>Area</dt>
          <dd>{sqm(x.size_sqm)}</dd>
          <dt>Rent</dt>
          <dd>{money0(rentOf(x))} p.a.{x.rent_per_sqm ? ' · ' + money0(x.rent_per_sqm) + '/m²' : ''}</dd>
          <dt>Commenced</dt>
          <dd>{dfmt(x.commencement_date)}</dd>
          <dt>Expires</dt>
          <dd><b>{dfmt(x.expiry_date)}</b></dd>
          <dt>Annual increase</dt>
          <dd>{inc}</dd>
          <dt>Next review</dt>
          <dd>{dfmt(x.next_review_date)}{x.review_type ? ' · ' + x.review_type : ''}</dd>
          <dt>Mid-term review</dt>
          <dd>{x.has_mid_term_review ? dfmt(x.mid_term_review_date) : 'No'}</dd>
          <dt>Right to break</dt>
          <dd>{x.has_break_right ? 'Yes · ' + dfmt(x.break_date) : 'No'}</dd>
          <dt>Option to renew</dt>
          <dd>{x.has_renewal_option ? x.option_terms || 'Yes' : 'No'}</dd>
          {x.notes ? (<><dt>Notes</dt><dd>{x.notes}</dd></>) : null}
        </dl>

        <div className="sec-t">Tenant contact</div>
        <div className="contactbox">
          <div className="cn">{x.tenant_name || '—'}</div>
          {x.tenant_obj?.website ? (
            <a href={'http://' + String(x.tenant_obj.website).replace(/^https?:\/\//, '')} target="_blank" rel="noreferrer">🔗 website</a>
          ) : null}
          {x.tenant_obj?.linkedin_url ? (
            <a href={x.tenant_obj.linkedin_url} target="_blank" rel="noreferrer">in LinkedIn</a>
          ) : null}
          {x.tenant_id ? (
            <div style={{ marginTop: 8 }}>
              <Link href={'/crm?tenant=' + x.tenant_id}>Open tenant in CRM →</Link>
            </div>
          ) : null}
        </div>

        {x.tenant_id ? (
          <>
            <div className="sec-t">Categorise → CRM</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {RELATIONSHIPS.map((r) => (
                <button key={r} className={'chip' + (rel === r ? ' on' : '')} style={{ border: '1px solid var(--line)' }}
                  onClick={() => setRelationship(rel === r ? null : r)}>{r}</button>
              ))}
              {rel ? <button className="chip" style={{ border: '1px solid var(--line)' }} onClick={() => setRelationship(null)}>Clear</button> : null}
            </div>
            <div className="t-sub">Tagging {x.tenant_name} adds them to the CRM under that status.</div>
          </>
        ) : null}

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => setEditing(true)}>Edit lease</button>
          <button className="btn" style={{ color: 'var(--red)' }} onClick={del}>Delete</button>
        </div>
      </Drawer>

      {editing && (
        <LeaseForm
          initial={x}
          buildings={buildings}
          tenants={tenants}
          onClose={() => setEditing(false)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
