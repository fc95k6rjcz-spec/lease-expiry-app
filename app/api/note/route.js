export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

const SYS = `You turn a commercial real estate broker's spoken call recap into a tidy CRM note. Australian English.
Return ONLY JSON, no prose:
{"summary":"1-2 sentences on what happened","next_action":"the follow-up task, or ''","date":"YYYY-MM-DD if a follow-up time was mentioned/implied, else ''","tenant":"the company/tenant name mentioned, or ''","type":"Call|Email|Meeting|Note"}
Keep it factual — do not invent details that weren't said.`;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { text, today } = body || {};
  if (!text || !String(text).trim()) return Response.json({ error: 'No text' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const prompt = `Today is ${today || new Date().toISOString().slice(0, 10)}.\nRecap:\n${text}`;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYS }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400, response_mime_type: 'application/json' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 404) return Response.json({ error: `Gemini model "${MODEL}" not found (404). Set GEMINI_CHAT_MODEL to a current model.` }, { status: 502 });
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await r.json();
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    let note = {};
    try { note = JSON.parse(out); } catch { note = { summary: out }; }
    return Response.json({ note });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
