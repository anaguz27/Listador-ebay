// Backend serverless (Vercel). Esta función vive en el servidor, NO en el navegador.
// Por eso la clave de API nunca se expone y Safari no la bloquea.

export default async function handler(req, res) {
  // Permitir solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta la clave. Configura ANTHROPIC_API_KEY en las variables de entorno de Vercel.",
    });
  }

  try {
    const { images, condition, extraNotes } = req.body || {};
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "No se recibieron imágenes." });
    }

    // Construir el contenido del mensaje: imágenes + instrucción
    const content = [];
    for (const img of images) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType || "image/jpeg",
          data: img.data,
        },
      });
    }

    content.push({
      type: "text",
      text:
`You are an expert eBay reseller who knows the Cassini search algorithm and sells lots of pre-owned clothing, shoes and accessories.

IMPORTANT: Your entire response must be ONLY a single valid JSON object. No text before or after, no markdown fences. Start with { and end with }.

Analyze these product photos. Read any labels, tags, brand names, size tags and material/care tags you can see. The seller marked the condition as: "${condition || "Pre-owned - Good"}".${extraNotes ? ` Extra notes from seller: "${extraNotes}".` : ""}

Create a complete, ready-to-publish eBay listing as a JSON object with exactly this shape:

{
  "title": "optimized eBay title in ENGLISH, MAX 80 characters, front-load most-searched keywords, include brand + item type + size + color + material/style; use Women's/Men's/Plus Size when relevant; NO punctuation, NO filler",
  "category": "suggested eBay category path in English",
  "item_specifics": [
    {"label": "Brand", "value": "..."},
    {"label": "Department", "value": "..."},
    {"label": "Type", "value": "..."},
    {"label": "Size", "value": "..."},
    {"label": "Size Type", "value": "..."},
    {"label": "Color", "value": "..."},
    {"label": "Material", "value": "..."},
    {"label": "Style", "value": "..."},
    {"label": "Pattern", "value": "..."},
    {"label": "Condition", "value": "..."}
  ],
  "keywords": ["8-12 buyer search keywords in english, no # symbol"],
  "description": "persuasive sales description in english, 2-3 short paragraphs, mention condition honestly and any flaws",
  "price_min": number,
  "price_max": number
}

If you cannot read a field, give your best expert estimate and add "(verify)" after the value. Keep item_specifics relevant to the actual product.`,
    });

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({
        error: `La IA rechazó la petición (${apiRes.status}). ${errText.slice(0, 200)}`,
      });
    }

    const data = await apiRes.json();
    let text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");

    // Extracción robusta del JSON
    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(502).json({ error: "La IA respondió en un formato inesperado. Intenta de nuevo." });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno del servidor." });
  }
}

function extractJson(raw) {
  if (!raw) return null;
  let t = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch {}
  }
  return null;
}
