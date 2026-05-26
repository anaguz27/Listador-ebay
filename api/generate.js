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
`You are a top 1% eBay PowerSeller and a deep expert on the Cassini search engine that ranks eBay listings. You know exactly how Cassini works: it rewards listings with high keyword relevance in the title, complete and accurate item specifics (especially Size, Brand, Department, Type, Color), competitive pricing, and high expected conversion. You sell huge volumes of pre-owned clothing, shoes and accessories and you write titles that maximize visibility and sales.

IMPORTANT: Your entire response must be ONLY a single valid JSON object. No text before or after, no markdown fences. Start with { and end with }.

Analyze these product photos. Read any labels, tags, brand names, size tags and material/care tags you can see. The seller marked the condition as: "${condition || "Pre-owned - Good"}".${extraNotes ? ` Extra notes from seller: "${extraNotes}".` : ""}

CRITICAL RULE ABOUT SIZE: eBay will block or hide apparel and footwear listings that have missing, incomplete or non-standard size information (this policy is active from July 2026). Therefore the SIZE IS MANDATORY. The title MUST contain the size, and the "Size" item specific MUST be filled. If you genuinely cannot read the size from the photos, use your best expert estimate based on the garment and add "(verify)" after it, and put "Size XX (verify)" in the title. NEVER leave size blank or omit it from the title.

CASSINI TITLE STRATEGY: Use as many of the 80 characters as possible without going over. Front-load the highest-traffic search keywords (what a real buyer would type). Order: Brand + Department (Women's/Men's/Girls'/Boys'/Plus Size) + Item Type + key descriptors (Color, Material, Style, Fit) + Size. Use natural buyer search terms, no punctuation, no filler words like "beautiful" or "nice", no ALL CAPS spam.

Create a complete, ready-to-publish eBay listing as a JSON object with exactly this shape:

{
  "title": "optimized eBay title in ENGLISH, aim for 70-80 characters, front-load most-searched keywords, MUST include brand + department + item type + color + material/style + SIZE; use Women's/Men's/Plus Size when relevant; NO punctuation, NO filler",
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

For price_min and price_max: estimate the realistic SOLD price range in USD for this item in this condition on eBay, as an experienced reseller would, considering the brand's resale demand, item type and condition. Give a sensible range (not too wide).

If you cannot read a field, give your best expert estimate and add "(verify)" after the value. Keep item_specifics relevant to the actual product. Remember: Size is mandatory and must never be empty.`,
    });

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
