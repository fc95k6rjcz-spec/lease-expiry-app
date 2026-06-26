export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// One general extractor. Works on a lobby directory board, a tenant list, a
// rent roll / lease schedule, or a table on a screen — whatever has occupiers in it.
const PROMPTS = {
  auto:
    'This image contains commercial-property occupancy data — it might be a building lobby tenant directory board, ' +
    'a list of company names, a tenancy schedule / rent roll, or a table on a screen. ' +
    'Extract EVERY occupier/tenant row you can read. ' +
    'Return ONLY JSON: {"kind":"board|list|schedule|other","listings":[{"tenant":"","floor":"","suite":"","building":"","market":"","size_sqm":null,"expiry":""}]}. ' +
    'tenant = company name (required). floor = level text if shown (e.g. "Level 5","Ground"). suite = unit if shown. ' +
    'building = building name/address if the image makes it clear. market = suburb/precinct if shown. ' +
    'size_sqm = number only (no commas/units) if an area is shown, else null. ' +
    'expiry = lease expiry date as YYYY-MM-DD if shown, else "". ' +
    'Skip building management, amenities, toilets, parking, vacant/empty entries and column headers. ' +
    'If nothing readable, return {"kind":"other","listings":[]}.',
  board:
    'This is a building lobby tenant directory board. Extract every tenant listing. ' +
    'Return ONLY JSON: {"kind":"board","listings":[{"tenant":"","floor":"","suite":""}]}. ' +
    'Skip management, amenities, parking and empty entries.',
};

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { imageBase64, mimeType, mode } = body || {};
  if (!imageBase64) return Response.json({ error: 'No image' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const prompt = PROMPTS[mode] || PROMPTS.auto;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        }],
        generationConfig: { temperature: 0, response_mime_type: 'application/json' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // A 404 here means the model name in the request path isn't valid for
      // this API — almost always a stale GEMINI_VISION_MODEL / GEMINI_MODEL
      // env var pointing at a retired model. Make that self-diagnosing.
      if (r.status === 404) {
        return Response.json({
          error:
            `Gemini model "${MODEL}" was not found (404). It's likely retired or misspelled. ` +
            `Set GEMINI_VISION_MODEL (or GEMINI_MODEL) to a current model such as ` +
            `"gemini-2.5-flash" or "gemini-3.5-flash" and redeploy.`,
          model: MODEL,
          gemini: t.slice(0, 300),
        }, { status: 502 });
      }
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 200)}`, model: MODEL }, { status: 502 });
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const raw = Array.isArray(parsed.listings) ? parsed.listings : Array.isArray(parsed) ? parsed : [];

    const str = (v) => (v == null ? '' : String(v).trim());
    const numOr = (v) => {
      const n = parseFloat(String(v ?? '').replace(/[, ]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const isoDate = (v) => {
      const s = str(v);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    };

    const listings = raw
      .map((l) => ({
        tenant: str(l.tenant || l.name),
        floor: str(l.floor),
        suite: str(l.suite),
        building: str(l.building),
        market: str(l.market),
        size_sqm: numOr(l.size_sqm),
        expiry: isoDate(l.expiry),
      }))
      .filter((l) => l.tenant);

    return Response.json({ kind: parsed.kind || 'other', listings });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
