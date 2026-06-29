'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

const ROLES = ['CEO', 'CFO', 'Managing Director', 'Country Head', 'President', 'Vice President', 'COO', 'Head of Property', 'Office Manager', 'Other'];

export default function CardPage() {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState(null);
  const [logNote, setLogNote] = useState(true);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const set = (k, v) => setCard((s) => ({ ...s, [k]: v }));

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f)); setCard(null); setDone(false); setErr(''); setBusy(true);
    try {
      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
      const b64 = String(dataUrl).split(',')[1];
      const r = await fetch('/api/card', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mimeType: f.type || 'image/jpeg' }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const c = j.card || {};
      setCard({
        full_name: c.full_name || '', title: c.title || '',
        role_category: ROLES.includes(c.role_category) ? c.role_category : 'Other',
        company: c.company || '', email: c.email || '', mobile: c.mobile || '',
        phone_direct: c.phone_direct || '', linkedin_url: c.linkedin_url || '', summary: c.summary || '',
      });
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  async function save() {
    if (!card.full_name?.trim()) { setErr('A name is required.'); return; }
    if (!card.company?.trim()) { setErr('A company is required (it links the contact to an account).'); return; }
    setBusy(true); setErr('');
    try {
      const co = card.company.trim();
      let tenantId = null;
      { const { data } = await supabase.from('tenants').select('id').ilike('legal_name', co).limit(1); tenantId = data?.[0]?.id; }
      if (!tenantId) { const { data, error } = await supabase.from('tenants').insert({ legal_name: co, source: 'Manual' }).select('id').single(); if (error) throw error; tenantId = data.id; }

      const { error: ce } = await supabase.from('contacts').insert({
        tenant_id: tenantId, full_name: card.full_name.trim(), title: card.title || null,
        role_category: card.role_category || 'Other', email: card.email || null,
        mobile: card.mobile || null, phone_direct: card.phone_direct || null,
        linkedin_url: card.linkedin_url || null, source: 'Manual', notes: card.summary || null,
        last_verified_at: new Date().toISOString().slice(0, 10),
      });
      if (ce) throw ce;

      if (logNote && card.summary?.trim()) {
        await supabase.from('interactions').insert({
          tenant_id: tenantId, type: 'Meeting',
          summary: `Met ${card.full_name}${card.title ? ' (' + card.title + ')' : ''} — ${card.summary}`,
        });
      }
      setDone(true);
    } catch (e) { setErr('Save failed: ' + e.message); } finally { setBusy(false); }
  }

  const F = ({ k, label, type = 'text' }) => (
    <div>
      <label className="t-sub">{label}</label>
      <input type={type} value={card[k] ?? ''} onChange={(e) => set(k, e.target.value)} style={{ width: '100%' }} />
    </div>
  );

  return (
    <>
      <Topbar title="Meeting capture" sub="Snap a card or doc — LEX files the contact for you" />
      <div className="wrap mobile-narrow" style={{ maxWidth: 640 }}>
        <div className="card"><div className="bd pad">
          <label className="bigcam">
            <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} disabled={busy} />
            <span className="bigcam-ic">⊙</span>
            <span>{preview ? 'Retake / choose another' : 'Snap a card or document'}</span>
          </label>
          {preview ? <img src={preview} alt="capture" className="scanprev" /> : null}
          {busy && !card ? <div className="t-sub" style={{ marginTop: 12 }}>Reading…</div> : null}
          {err ? <div className="banner err" style={{ marginTop: 12 }}>{err}</div> : null}
        </div></div>

        {card ? (
          <div className="card" style={{ marginTop: 16 }}><div className="bd pad">
            {done ? <div className="banner info" style={{ marginBottom: 12 }}>✓ Contact saved.
              <span style={{ marginLeft: 8, color: 'var(--brand)', cursor: 'pointer' }} onClick={() => router.push('/crm')}>Open CRM →</span></div> : null}
            <div className="form-grid">
              <F k="full_name" label="Name" /><F k="title" label="Title" />
              <div>
                <label className="t-sub">Role</label>
                <select value={card.role_category} onChange={(e) => set('role_category', e.target.value)} style={{ width: '100%' }}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <F k="company" label="Company" />
              <F k="email" label="Email" type="email" /><F k="mobile" label="Mobile" />
              <F k="phone_direct" label="Direct line" /><F k="linkedin_url" label="LinkedIn" />
            </div>
            <label className="t-sub" style={{ marginTop: 10, display: 'block' }}>Context / note</label>
            <textarea rows={2} value={card.summary ?? ''} onChange={(e) => set('summary', e.target.value)} style={{ width: '100%' }} />
            <label className="t-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={logNote} onChange={(e) => setLogNote(e.target.checked)} style={{ width: 'auto' }} />
              Also log a meeting note against this company
            </label>
            <button className="btn primary block scanbtn" onClick={save} disabled={busy || done}>
              {busy ? 'Saving…' : done ? 'Saved ✓' : 'Save contact'}
            </button>
          </div></div>
        ) : null}
      </div>
    </>
  );
}
