export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ROLES = 'CEO|CFO|Managing Director|Country Head|President|Vice President|COO|Head of Property|Office Manager|Other';

const PROMPT =
  'This photo is from a meeting — a business card, an email signature, a slide, or a document with a person and/or company on it. ' +
  'Extract the contact and company details you can read. ' +
  'Return ONLY JSON: {"full_name":"","title":"","role_category":"' + ROLES + '","company":"","email":"","mobile":"","phone_direct":"","linkedin_url":"","summary":""}. ' +
  'full_name = the person. title = their verbatim job title. role_category = best fit from the list (else "Other"). ' +
  'company = their organisation. mobile vs phone_direct: mobile is a cell number, phone_direct a landline/office line. ' +
  'summary = one short line on what this is or any useful context (e.g. "discussed CBD relocation"). ' +
  'Leave a field "" if not present. Do not invent anything.';

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { imageBase64, mimeType } = body || {};
  if (!imageBase64) return Response.json({ error: 'No image' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
        ] }],
        generationConfig: { temperature: 0, response_mime_type: 'application/json' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 404) return Response.json({ error: `Gemini model "${MODEL}" not found (404). Set GEMINI_VISION_MODEL to a current model.` }, { status: 502 });
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await r.json();
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    let card = {};
    try { card = JSON.parse(out); } catch { card = {}; }
    return Response.json({ card });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
