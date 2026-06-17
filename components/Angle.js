'use client';
import { useState } from 'react';

export function AngleBlock({ why, timing, opener, compact }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    if (navigator.clipboard) navigator.clipboard.writeText(opener).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: compact ? 6 : 10, padding: '10px 12px', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 4 }}>Reason to call</div>
      {why ? <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{why}</div> : null}
      {timing ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{timing}</div> : null}
      {opener ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, color: '#cdd8e8', fontStyle: 'italic' }}>&ldquo;{opener}&rdquo;</div>
          <button className="btn" style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }} onClick={copy}>{copied ? 'Copied ✓' : 'Copy opener'}</button>
        </div>
      ) : null}
    </div>
  );
}
