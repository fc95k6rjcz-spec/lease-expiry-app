'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function AngleBlock({ why, timing, opener, compact, aiPayload }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(opener);
  const [generated, setGenerated] = useState(opener); // last machine-produced version
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const { user } = useAuth();

  // Record what Rowan actually uses, so future openers learn his voice.
  async function logFeedback(action) {
    try {
      await supabase.from('opener_feedback').insert({
        tenant_id: aiPayload?.tenant_id ?? null,
        signal_type: aiPayload?.signal?.signal_type ?? null,
        generated,
        final: text,
        action,
        edited: (text || '').trim() !== (generated || '').trim(),
        created_by: user?.email || null,
      });
    } catch (_) { /* never block the broker on logging */ }
  }

  function copy(e) {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    }
    logFeedback((text || '').trim() !== (generated || '').trim() ? 'edited' : 'copied');
  }

  async function tailor(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      // Pull a few recent openers Rowan kept, to steer the voice.
      let examples = [];
      try {
        const { data } = await supabase
          .from('opener_feedback')
          .select('final')
          .not('final', 'is', null)
          .order('created_at', { ascending: false })
          .limit(8);
        examples = [...new Set((data || []).map((d) => d.final).filter(Boolean))].slice(0, 5);
      } catch (_) { /* examples are optional */ }

      const r = await fetch('/api/opener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(aiPayload || {}), angle: opener, examples }),
      });
      const j = await r.json();
      if (j.opener) { setText(j.opener); setGenerated(j.opener); setAi(j.source === 'ai'); }
    } catch (_) { /* keep template */ } finally { setBusy(false); }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: compact ? 6 : 10, padding: '10px 12px', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 4 }}>
        Reason to call {ai ? <span style={{ color: '#e3d2a4' }}>· AI-tailored</span> : null}
      </div>
      {why ? <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{why}</div> : null}
      {timing ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{timing}</div> : null}
      {text != null ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontSize: 12.5, lineHeight: 1.5, color: '#cdd8e8', background: 'rgba(8,11,16,.5)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}
          />
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            {aiPayload ? <button className="btn" style={{ padding: '4px 10px', fontSize: 12, color: '#e3d2a4', borderColor: 'rgba(227,210,164,.4)' }} onClick={tailor} disabled={busy}>{busy ? 'Tailoring…' : '✦ Tailor with AI'}</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
