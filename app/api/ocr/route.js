export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const PROMPT =
  'This is a photo of a commercial office building tenant directory board (the lobby sign listing who is on each floor). ' +
  'Extract every tenant listing. Return ONLY a JSON object: {"listings":[{"floor":"","suite":"","tenant":""}]}. ' +
  'floor = the level text exactly as shown (e.g. "Level 5", "Ground", "Mezzanine"); suite = suite/unit if shown else ""; ' +
  'tenant = the company name. Skip building management, amenities, toilets, parking and empty entries. If you cannot read it, return {"listings":[]}.';

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
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        }],
        generationConfig: { temperature: 0, response_mime_type: 'application/json' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 160)}` }, { status: 502 });
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const listings = Array.isArray(parsed.listings) ? parsed.listings : Array.isArray(parsed) ? parsed : [];
    const clean = listings
      .map((l) => ({ floor: (l.floor || '').toString().trim(), suite: (l.suite || '').toString().trim(), tenant: (l.tenant || '').toString().trim() }))
      .filter((l) => l.tenant);
    return Response.json({ listings: clean });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
