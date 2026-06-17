'use client';
import { useState } from 'react';

export function AngleBlock({ why, timing, opener, compact, aiPayload }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(opener);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);

  const copy = (e) => {
    e.stopPropagation();
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  async function tailor(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await fetch('/api/opener', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiPayload || {}) });
      const j = await r.json();
      if (j.opener) { setText(j.opener); setAi(j.source === 'ai'); }
    } catch (_) { /* keep template */ } finally { setBusy(false); }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: compact ? 6 : 10, padding: '10px 12px', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 4 }}>
        Reason to call {ai ? <span style={{ color: '#e3d2a4' }}>· AI-tailored</span> : null}
      </div>
      {why ? <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{why}</div> : null}
      {timing ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{timing}</div> : null}
      {text ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, color: '#cdd8e8', fontStyle: 'italic' }}>&ldquo;{text}&rdquo;</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            {aiPayload ? <button className="btn" style={{ padding: '4px 10px', fontSize: 12, color: '#e3d2a4', borderColor: 'rgba(227,210,164,.4)' }} onClick={tailor} disabled={busy}>{busy ? 'Tailoring…' : '✦ Tailor with AI'}</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
