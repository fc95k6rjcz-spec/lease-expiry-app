import { signalAngle } from '../../../lib/angles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const SYS = `You are an expert Sydney commercial real estate leasing broker writing a short, warm, confident first-contact message to a tenant decision-maker (email or LinkedIn). Reference the specific trigger and their lease timing, and make a soft ask for a brief call. Australian English, conversational, no corporate jargon, no emojis, under 60 words. Output ONLY the message text — no greeting line like "Hi", no preamble, no sign-off.`;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { tenant, contact, signal, lease, building, angle, examples } = body || {};
  const fallback = (angle && String(angle).trim())
    || (signal ? signalAngle(signal, lease || {}).opener
      : 'There’s a timely reason to reach out — happy to walk you through the options on a quick call.');

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ opener: fallback, source: 'fallback' });

  try {
    const lines = [`Tenant: ${tenant || 'the company'}`];
    if (contact?.name) lines.push(`Contact: ${contact.name}${contact.title ? ', ' + contact.title : ''}`);
    if (building) lines.push(`Building: ${building}`);
    if (signal) lines.push(`Trigger: ${signal.signal_type || ''} (${signal.direction || ''}) — ${signal.headline || ''}${signal.magnitude ? ' [' + signal.magnitude + ']' : ''}`);
    if (lease) {
      if (lease.inHoldover) lines.push('Lease status: holding over month-to-month (no security).');
      else if (lease.expiryDate) lines.push(`Lease expires: ${lease.expiryDate}${lease.months != null ? ` (~${Math.round(lease.months)} months away)` : ''}`);
      if (lease.optionDue) lines.push('An option-to-renew decision is due soon.');
    }
    // Ground the model on the deterministic angle so it never invents facts.
    if (angle && String(angle).trim()) lines.push(`\nReference angle (rephrase in your own voice, keep the facts): ${angle}`);

    // Voice few-shot: real openers the user previously sent/kept, so output
    // matches how they actually write. Cap length to stay within budget.
    const sys = (Array.isArray(examples) && examples.length)
      ? SYS + `\n\nMatch the voice, length and tone of these openers the user has sent before:\n` +
        examples.slice(0, 5).map((e, i) => `${i + 1}. ${String(e).slice(0, 300)}`).join('\n')
      : SYS;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts: [{ text: lines.join('\n') }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 220 },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return Response.json({ opener: fallback, source: 'fallback', error: `model ${MODEL} ${r.status} ${t.slice(0, 120)}` });
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    return Response.json({ opener: text || fallback, source: text ? 'ai' : 'fallback' });
  } catch (e) {
    return Response.json({ opener: fallback, source: 'fallback', error: e.message });
  }
}
