'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useLeases, useTable } from '../lib/data';
import { buildLeadContext } from '../lib/context';

const STARTERS = [
  'Who should I call this week?',
  'Any holdovers or expiries under 12 months?',
  'Which multi-market occupiers are uncontested?',
  'Summarise my pipeline and what needs attention.',
];

const ALLOWED_STATUS = new Set([
  'Active Target', 'Watching', 'Already Represented', 'Already Renewed',
  'Already Relocated', 'Not a Fit', 'Do Not Contact', 'Lost Opportunity',
]);

// Pull a trailing ```lex-actions [...] ``` block out of the reply.
function splitActions(reply) {
  const m = String(reply || '').match(/```lex-actions\s*([\s\S]*?)```/i);
  if (!m) return { text: String(reply || '').trim(), actions: [] };
  let actions = [];
  try { const a = JSON.parse(m[1].trim()); if (Array.isArray(a)) actions = a; } catch (_) {}
  const text = String(reply).replace(m[0], '').trim();
  return { text, actions };
}

const actionLabel = (a) =>
  a.type === 'log_followup' ? `Log follow-up · ${a.tenant}${a.date ? ' (' + a.date + ')' : ''}`
  : a.type === 'set_status' ? `Set ${a.tenant} → ${a.status}`
  : a.type === 'draft_opener' ? `Save opener · ${a.tenant}`
  : a.type;

export default function AskLex() {
  const { user } = useAuth();
  const { rows: leases } = useLeases();
  const { rows: signals } = useTable('signals', { select: '*' });
  const { rows: contacts } = useTable('contacts', { select: 'tenant_id' });
  const { rows: interactions } = useTable('interactions', { select: '*' });
  const { rows: tenants } = useTable('tenants', { select: 'id,legal_name' });

  const [msgs, setMsgs] = useState([]);   // {role:'user'|'assistant', text, actions?, done?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [actState, setActState] = useState({}); // `${mi}-${ai}` -> 'busy'|'done'|'err'
  const endRef = useRef(null);

  const ctx = useMemo(
    () => buildLeadContext({ leases, signals, contacts, interactions, tenants }),
    [leases, signals, contacts, interactions, tenants]
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  async function send(q) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', text: question }];
    setMsgs(next);
    setBusy(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          context: ctx.text,
        }),
      });
      const j = await r.json();
      if (j.error) { setMsgs((m) => [...m, { role: 'assistant', text: '⚠️ ' + j.error }]); return; }
      const { text, actions } = splitActions(j.reply);
      setMsgs((m) => [...m, { role: 'assistant', text, actions }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', text: '⚠️ ' + (e.message || 'Request failed') }]);
    } finally { setBusy(false); }
  }

  async function runAction(mi, ai, a) {
    const key = `${mi}-${ai}`;
    setActState((s) => ({ ...s, [key]: 'busy' }));
    try {
      if (a.type === 'log_followup') {
        if (!a.tenant_id) throw new Error('missing tenant');
        const { error } = await supabase.from('interactions').insert({
          tenant_id: a.tenant_id, type: 'Note',
          summary: a.summary || a.next_action || 'Follow-up (via Ask LEX)',
          next_action: a.next_action || null, next_action_date: a.date || null,
        });
        if (error) throw error;
      } else if (a.type === 'set_status') {
        if (!a.tenant_id || !ALLOWED_STATUS.has(a.status)) throw new Error('invalid status');
        const { error } = await supabase.from('tenants').update({ occupier_status: a.status }).eq('id', a.tenant_id);
        if (error) throw error;
      } else if (a.type === 'draft_opener') {
        if (navigator.clipboard && a.text) await navigator.clipboard.writeText(a.text);
        await supabase.from('opener_feedback').insert({
          tenant_id: a.tenant_id || null, generated: a.text, final: a.text,
          action: 'drafted', created_by: user?.email || null,
        });
      } else {
        throw new Error('unknown action');
      }
      setActState((s) => ({ ...s, [key]: 'done' }));
    } catch (e) {
      setActState((s) => ({ ...s, [key]: 'err' }));
    }
  }

  return (
    <div className="asklex">
      <div className="asklex-thread">
        {msgs.length === 0 ? (
          <div className="asklex-empty">
            <div className="t-sub" style={{ marginBottom: 10 }}>Ask LEX about your leads — it reasons over the live opportunity scores and signals.</div>
            {STARTERS.map((s) => (
              <button key={s} className="asklex-starter" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        ) : msgs.map((m, mi) => (
          <div key={mi} className={'asklex-msg ' + m.role}>
            <div className="asklex-bubble">
              {m.text.split('\n').map((ln, i) => <div key={i}>{ln || ' '}</div>)}
            </div>
            {m.actions && m.actions.length ? (
              <div className="asklex-actions">
                {m.actions.map((a, ai) => {
                  const st = actState[`${mi}-${ai}`];
                  return (
                    <button key={ai} className="btn" disabled={st === 'busy' || st === 'done'} onClick={() => runAction(mi, ai, a)}>
                      {st === 'done' ? '✓ Done' : st === 'busy' ? 'Saving…' : st === 'err' ? '⚠ Retry' : actionLabel(a)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="asklex-msg assistant"><div className="asklex-bubble t-sub">Thinking…</div></div> : null}
        <div ref={endRef} />
      </div>

      <div className="asklex-input">
        <textarea
          rows={1} value={input} placeholder="Ask about a tenant, a market, who to call…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="btn primary" onClick={() => send()} disabled={busy || !input.trim()}>Send</button>
      </div>
    </div>
  );
}
