export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

// Audio -> verbatim transcript, via Gemini's audio understanding. NOTE: the set
// of audio MIME types browsers produce (Safari = audio/mp4, Chrome = audio/webm)
// is not identical to what the API accepts, so this path needs on-device testing.
export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { audioBase64, mimeType } = body || {};
  if (!audioBase64) return Response.json({ error: 'No audio' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe this audio verbatim. Return only the transcript text, no commentary.' },
            { inline_data: { mime_type: mimeType || 'audio/mp4', data: audioBase64 } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2000 },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 404) return Response.json({ error: `Gemini model "${MODEL}" not found (404).` }, { status: 502 });
      return Response.json({ error: `Gemini ${r.status} ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join(' ').trim();
    return Response.json({ transcript: text });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
