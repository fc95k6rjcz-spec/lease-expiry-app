export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Chat gets its own model knob (independent of the cheaper OCR/opener default)
// so we can run the smartest model here. gemini-3.5-flash is the current stable
// flagship and wins on grounded + agent/tool-call work, which is what this does.
// Flip GEMINI_CHAT_MODEL to gemini-3.1-pro-preview for max research-grade reasoning.
const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

const STATUSES = 'Active Target | Watching | Already Represented | Already Renewed | Already Relocated | Not a Fit | Do Not Contact | Lost Opportunity';

const SYSTEM = `You are LEX, the in-app assistant for Rowan, a Sydney commercial real estate leasing broker. You help him find and work sales leads (tenants whose leases are expiring or who are likely to move/grow).

GROUNDING — strict:
- Answer ONLY from the CONTEXT block below, which is LEX's own computed intelligence (ranked occupiers with opportunity scores, live signals, KPIs, follow-ups).
- Never invent tenants, leases, dates, sizes or scores. If something isn't in the context, say you don't have it and suggest where in LEX to look.
- Be concise and practical. Australian English. No emojis, no corporate filler. Lead with the answer, then the why.
- When ranking or recommending who to call, use the opportunity score and explain the trigger in one line.

ACTIONS:
- When Rowan asks you to DO something — log a follow-up, set a tenant's status, or draft an opener — PROPOSE it; do not claim it is done. The app shows him a confirm button.
- To propose actions, append EXACTLY ONE fenced block at the very end of your reply, after your prose:
\`\`\`lex-actions
[ {"type":"log_followup","tenant_id":"<id from context>","tenant":"<name>","next_action":"<text>","date":"YYYY-MM-DD","summary":"<optional>"},
  {"type":"set_status","tenant_id":"<id>","tenant":"<name>","status":"<one of: ${STATUSES}>"},
  {"type":"draft_opener","tenant_id":"<id>","tenant":"<name>","text":"<opener, under 60 words>"} ]
\`\`\`
- Only use tenant_id values that appear in the CONTEXT. Omit the block entirely when no action is requested. Keep the JSON valid.`;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { messages, context } = body || {};
  const hist = Array.isArray(messages) ? messages : [];
  if (!hist.length) return Response.json({ error: 'No message' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const sys = SYSTEM + '\n\n===== CONTEXT (LEX intelligence) =====\n' + (context || '(no context provided)');

  const contents = hist.map((m) => ({
    role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m.text || '') }],
  }));

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1400 },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 404) {
        return Response.json({ error: `Gemini model "${MODEL}" not found (404). Set GEMINI_MODEL to a current model like gemini-2.5-flash.` }, { status: 502 });
      }
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    return Response.json({ reply: text || 'No response.' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
