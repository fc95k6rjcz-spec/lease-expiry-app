export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

const SYS = `You are a commercial real estate lease abstractor. Read the attached lease document and extract its key terms.
Return ONLY JSON, no prose, with these fields (use "" or null when a term is not stated — never guess):
{
 "tenant":"lessee / tenant legal name",
 "building":"building name if given",
 "address":"street address of the premises",
 "levels":"floor/level text e.g. 'Level 5' or 'Ground + L2'",
 "size_sqm": number or null,
 "rent_per_annum": number or null,
 "rent_basis":"Net|Gross",
 "annual_increase_type":"Fixed %|Fixed $|CPI|CPI + %|Market|None|Other",
 "annual_increase_value": number or null,
 "commencement_date":"YYYY-MM-DD",
 "expiry_date":"YYYY-MM-DD",
 "has_mid_term_review": boolean,
 "mid_term_review_date":"YYYY-MM-DD or ''",
 "has_break_right": boolean,
 "break_date":"YYYY-MM-DD or ''",
 "break_notice_months": number or null,
 "has_renewal_option": boolean,
 "option_terms":"e.g. '1 x 5 years'",
 "option_notice_months": number or null,
 "notes":"anything notable (incentive, make-good, special conditions) in one line"
}`;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { pdfBase64, mimeType } = body || {};
  if (!pdfBase64) return Response.json({ error: 'No file' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYS }] },
        contents: [{ parts: [{ inline_data: { mime_type: mimeType || 'application/pdf', data: pdfBase64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1200, response_mime_type: 'application/json' },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 404) return Response.json({ error: `Gemini model "${MODEL}" not found (404). Set GEMINI_CHAT_MODEL to a current model.` }, { status: 502 });
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    let lease = {};
    try { lease = JSON.parse(out); } catch { return Response.json({ error: 'Could not parse the lease — try a clearer PDF.' }, { status: 502 }); }
    return Response.json({ lease });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
