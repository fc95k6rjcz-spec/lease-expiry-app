'use client';
import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normName } from '../lib/sources';

const blobToBase64 = (blob) => new Promise((res) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.readAsDataURL(blob);
});

function pickMime() {
  const cands = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg'];
  if (typeof MediaRecorder === 'undefined') return '';
  return cands.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
}

export default function VoiceCapture({ tenants = [], onClose, onSaved }) {
  const [mode, setMode] = useState('dictate');      // 'dictate' | 'speaker'
  const [text, setText] = useState('');             // the recap / transcript
  const [note, setNote] = useState(null);           // {summary, next_action, date, type}
  const [tenantId, setTenantId] = useState('');
  const [rec, setRec] = useState(false);
  const [phase, setPhase] = useState('');           // 'transcribing' | 'summarising' | 'saving'
  const [err, setErr] = useState('');
  const mr = useRef(null);
  const chunks = useRef([]);

  const tNorm = useMemo(() => tenants.map((t) => ({ id: t.id, name: t.legal_name, n: normName(t.legal_name) })), [tenants]);

  async function startRec() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const m = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      m.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: m.mimeType || mime || 'audio/mp4' });
        setPhase('transcribing');
        try {
          const b64 = await blobToBase64(blob);
          const r = await fetch('/api/transcribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mimeType: m.mimeType || mime }),
          });
          const j = await r.json();
          if (j.error) throw new Error(j.error);
          setText((prev) => (prev ? prev + ' ' : '') + (j.transcript || ''));
        } catch (e) { setErr('Transcription failed: ' + e.message + ' — you can type the recap instead.'); }
        finally { setPhase(''); }
      };
      m.start();
      mr.current = m;
      setRec(true);
    } catch (e) {
      setErr('Microphone unavailable: ' + e.message + ' — switch to Dictate and use the keyboard mic.');
    }
  }
  function stopRec() { try { mr.current?.stop(); } catch {} setRec(false); }

  async function summarise() {
    if (!text.trim()) return;
    setPhase('summarising'); setErr('');
    try {
      const r = await fetch('/api/note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, today: new Date().toISOString().slice(0, 10) }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const n = j.note || {};
      setNote({ summary: n.summary || '', next_action: n.next_action || '', date: n.date || '', type: n.type || 'Call' });
      // best-effort match the company the model heard to a tenant id
      if (n.tenant) {
        const want = normName(n.tenant);
        const hit = tNorm.find((t) => t.n === want) || tNorm.find((t) => t.n && (t.n.includes(want) || want.includes(t.n)));
        if (hit) setTenantId(hit.id);
      }
    } catch (e) { setErr(e.message); }
    finally { setPhase(''); }
  }

  async function save() {
    if (!tenantId || !note?.summary) { setErr('Pick a client and make sure there is a summary.'); return; }
    setPhase('saving'); setErr('');
    try {
      const { error } = await supabase.from('interactions').insert({
        tenant_id: tenantId, type: note.type || 'Call',
        summary: note.summary, next_action: note.next_action || null,
        next_action_date: note.date || null,
      });
      if (error) throw error;
      onSaved && (await onSaved());
      onClose();
    } catch (e) { setErr('Save failed: ' + e.message); }
    finally { setPhase(''); }
  }

  const setN = (k, v) => setNote((s) => ({ ...s, [k]: v }));

  return (
    <div className="asklex-overlay" onClick={onClose}>
      <div className="asklex-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="asklex-sheethd">
          <b>Capture a call</b>
          <button className="hamb" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={'segbtn' + (mode === 'dictate' ? ' on' : '')} onClick={() => setMode('dictate')}>Dictate<span>Talk your recap</span></button>
            <button className={'segbtn' + (mode === 'speaker' ? ' on' : '')} onClick={() => setMode('speaker')}>Speakerphone<span>Record the call</span></button>
          </div>

          {mode === 'speaker' ? (
            <>
              <div className="banner info" style={{ marginBottom: 10 }}>Let the client know you’re recording before you start — consent rules vary by state.</div>
              <button className={'btn block' + (rec ? '' : ' primary')} onClick={rec ? stopRec : startRec} disabled={phase === 'transcribing'}>
                {rec ? '■ Stop & transcribe' : phase === 'transcribing' ? 'Transcribing…' : '● Start recording'}
              </button>
            </>
          ) : null}

          <label className="t-sub" style={{ display: 'block', margin: '12px 0 4px' }}>
            {mode === 'dictate' ? 'Tap the keyboard mic and talk, or type your recap' : 'Transcript (editable)'}
          </label>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }}
            placeholder="e.g. Spoke to the CFO at Asahi, they’re reviewing their CBD footprint, call back in two weeks with options…" />

          <button className="btn primary block" style={{ marginTop: 10 }} onClick={summarise} disabled={!text.trim() || phase === 'summarising'}>
            {phase === 'summarising' ? 'Summarising…' : '✦ Summarise into a note'}
          </button>

          {note ? (
            <div className="card" style={{ marginTop: 14 }}><div className="bd pad">
              <label className="t-sub">Client</label>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
                <option value="">— pick the client —</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.legal_name}</option>)}
              </select>
              <label className="t-sub">Summary</label>
              <textarea rows={2} value={note.summary} onChange={(e) => setN('summary', e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
              <label className="t-sub">Next action</label>
              <input value={note.next_action} onChange={(e) => setN('next_action', e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="t-sub">Follow-up date</label>
                  <input type="date" value={note.date} onChange={(e) => setN('date', e.target.value)} style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="t-sub">Type</label>
                  <select value={note.type} onChange={(e) => setN('type', e.target.value)} style={{ width: '100%' }}>
                    {['Call', 'Email', 'Meeting', 'Note'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn primary block" style={{ marginTop: 12 }} onClick={save} disabled={phase === 'saving'}>
                {phase === 'saving' ? 'Saving…' : 'Save to CRM'}
              </button>
            </div></div>
          ) : null}

          {err ? <div className="banner err" style={{ marginTop: 12 }}>{err}</div> : null}
        </div>
      </div>
    </div>
  );
}
