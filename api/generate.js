// Backend serverless (Vercel). Esta función vive en el servidor, NO en el navegador.
// Por eso la clave de API nunca se expone y Safari no la bloquea.

// Permite recibir peticiones más grandes (varias fotos en base64).
export const config = {
  api: {
    bodyParser: { sizeLimit: "4.5mb" },
  },
};

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

    // Enviar a la IA como máximo las primeras 10 fotos (las más importantes).
    // El usuario puede subir hasta 16, pero solo las primeras 10 van al modelo.
    const imagesForAI = images.slice(0, 10);

    // Construir el contenido del mensaje: imágenes + instrucción
    const content = [];
    for (const img of imagesForAI) {
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

DETECT THE GARMENT TYPE: Look at the photos and decide which ONE of these the item is. Return the English key exactly:
- "blouse" (blouse, top, shirt)
- "shorts"
- "dress"
- "pants" (pants, trousers, jeans, leggings)
- "shoes" (shoes, sandals, boots, heels, sneakers)
- "sweater" (sweater, cardigan, jacket, coat, hoodie)
- "bra" (bra, lingerie)
- "swimsuit" (swimsuit, bikini)
- "bag" (bag, purse, handbag)
If it does not clearly fit any, choose the closest one.

DETECT HOW IT IS DISPLAYED: Decide if the item is photographed on a mannequin/body form ("mannequin") or on a hanger / laid flat / held up ("hanger"). If you cannot tell, use "hanger".

CRITICAL RULE ABOUT SIZE: eBay will block or hide apparel and footwear listings that have missing, incomplete or non-standard size information (this policy is active from July 2026). Therefore the SIZE IS MANDATORY. The title MUST contain the size, and the "Size" item specific MUST be filled. If you genuinely cannot read the size from the photos, use your best expert estimate based on the garment and add "(verify)" after it, and put "Size XX (verify)" in the title. NEVER leave size blank or omit it from the title.

CASSINI TITLE STRATEGY: Use as many of the 80 characters as possible without going over. Front-load the highest-traffic search keywords (what a real buyer would type). Order: Brand + Department (Women's/Men's/Girls'/Boys'/Plus Size) + Item Type + key descriptors (Color, Material, Style, Fit) + Size. Use natural buyer search terms, no punctuation, no filler words like "beautiful" or "nice", no ALL CAPS spam.

ITEM SPECIFICS — FILL AS MANY AS YOU CAN, NEVER INVENT: eBay rewards listings with MANY completed item specifics, so fill EVERY field below that you can determine with confidence from the photos (brand/care tags and the garment itself). This strongly improves Cassini ranking.
RULE: Only fill a field if you can see it or determine it with real confidence. If you are reasonably sure but not fully certain, fill it and add " (verify)" after the value. If you genuinely cannot tell, OMIT that field entirely from the array — DO NOT GUESS and DO NOT invent values. An omitted field is always better than a made-up one.
MEASUREMENT-BASED FIELDS — READ THE TAPE MEASURE FIRST: The seller almost always includes photos with a tape measure (cinta métrica) laid along the garment to show its real length — typically one photo showing the whole garment with the tape running down it, and a close-up photo where the number on the tape is clearly readable at the hem/edge. Your job is to USE that measurement, not guess.
STEP 1 — Look for a tape measure in the photos. If you can read a number on the tape where the garment ends (e.g. the hem reaches 41 inches), use THAT real measurement.
STEP 2 — For Dress Length, convert the measured shoulder-to-hem length using this standard eBay table and state the result as a FACT (no "(verify)"):
   • up to 33 in → Mini
   • 34–37 in → Knee-Length
   • 38–44 in → Midi
   • 45 in and above → Maxi
   (Apply the analogous logic to other measured fields: Sleeve Length, Inseam, Rise, Heel Height, Band/Cup Size — if the tape shows the number, use it as fact.)
STEP 3 — ONLY if there is NO readable tape measure in any photo and no measurement on a tag, then you are merely estimating visually: in that case you MUST add " (verify)" after the value (e.g. "Midi (verify)", "Maxi (verify)"), and when ambiguous between two options pick the more conservative/shorter one. The same applies to Style/Type fields that contain a length word (write "Maxi Dress (verify)" only if the length is a pure visual guess).
NEVER assert a definitive length from the image alone — but DO assert it confidently when the tape measure in the photo shows the number.

PANTS/JEANS MEASUREMENTS — WAIST, INSEAM AND LEG STYLE (apply ONLY when the garment is pants, jeans, trousers or leggings):
The seller includes tape-measure photos specifically for pants. Use them to fill these item specifics. ALL measurements must be reported in INCHES. If a tape shows centimeters, convert to inches (1 in = 2.54 cm) and round to the nearest whole inch.
• WAIST SIZE — the seller lays the tape FLAT across the waistband from side to side (edge to edge), so it shows HALF of the real waist. Read that flat width and MULTIPLY BY 2 to get the full waist circumference. Put the result in an item specific labeled "Waist Size" in inches (e.g. "32 in"). State it as a FACT (no "(verify)") when you can read the tape.
• INSEAM — the seller lays the tape ALONG THE INNER LEG, from the crotch seam down to the bottom hem, in a photo where you can see the full leg length and read the number at the hem. Read that number directly (it is already the full inseam, do NOT multiply). Put it in an item specific labeled "Inseam" in inches (e.g. "30 in"). State it as a FACT when readable.
• LEG STYLE / FIT — decide whether the pants are "Wide Leg" or "Straight" using BOTH the leg-opening width photo (the tape laid ACROSS the bottom hem, side to side) AND the overall shape of the leg in the full photo:
   - Measure the leg opening (flat width across the hem). A flat hem width of about 8 in or less, with a leg that stays the same width or tapers slightly from knee to hem, means "Straight".
   - A flat hem width clearly wider (about 9–10 in or more) AND a leg that visibly widens/flares from the knee down to the hem means "Wide Leg".
   - Put the result in an item specific labeled "Leg Style" (value exactly "Wide Leg" or "Straight"). Also reflect it in the title and Style field when relevant. State it as a FACT when the photos clearly show it; add " (verify)" only if you truly cannot tell.
- Country of Origin usually comes from the "Made in ___" line on the brand/care tag.
- Occasion: where the item would realistically be worn (e.g. Casual, Travel, Workwear, Party/Cocktail, Beach, Vacation).
- Theme: PUT AT LEAST 5 style/search words that a real buyer would type, separated by commas, based on the garment's actual style and the occasion it suits (e.g. "Vintage, Western, Casual, Everyday, Retro, Streetwear"). Base them on the real style of THIS item — do not invent unrelated themes.
- Garment Care comes from the care tag (e.g. Machine Washable, Hand Wash, Dry Clean Only).
Always include Brand, Department, Type, Size and Condition. Then add every other field below that clearly applies.

Create a complete, ready-to-publish eBay listing as a JSON object with exactly this shape:

{
  "garment": "one of: blouse|shorts|dress|pants|shoes|sweater|bra|swimsuit|bag",
  "display": "mannequin|hanger",
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
  "keywords": ["8-12 buyer search keywords in english based on STYLE and OCCASION, no # symbol"],
  "description": "persuasive sales description in ENGLISH, MEDIUM length — like a typical good eBay clothing listing, NOT long. Write ONE single natural paragraph (you decide the exact length, but keep it medium and tight, roughly 4-7 sentences). Cover only the essentials: what the item is, the brand if known, the key style points (silhouette/fit, neckline, sleeves, hem, print/color), the size, and the condition stated honestly with any visible flaws. Do not pad it, do not repeat the item specifics, do not write multiple paragraphs. Do NOT include any keyword list, hashtag list, search-terms line or SEO keywords inside the description. Do NOT include shipping, washing, color-variation or measurement boilerplate notes; those are added separately by the app.",
  "price_min": number,
  "price_max": number
}

The item_specifics array above is the MINIMUM. ADD as many of these additional labels as you can determine for this exact item (omit any you are unsure of): Neckline, Sleeve Length, Sleeve Type, Dress Length, Waist Size, Inseam, Leg Style, Rise, Closure, Fabric Type, Features, Occasion, Theme, Season, Country of Origin, Vintage, Garment Care, Heel Height (shoes), Department-specific fields. The more accurate specifics, the better — but never invent.

For price_min and price_max: estimate the realistic SOLD price range in USD for this item in this condition on eBay, as an experienced reseller would, considering the brand's resale demand, item type and condition. Give a sensible range (not too wide).

If you cannot read a field, give your best expert estimate and add "(verify)" after the value. Keep item_specifics relevant to the actual product. Remember: Size is mandatory and must never be empty. The "keywords" must reflect the garment's style and the occasion it suits. The "Theme" item specific must contain at least 5 comma-separated buyer search words.`,
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
        max_tokens: 3000,
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
  // Si viene con texto alrededor, recortar al primer { y último }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = t.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}
