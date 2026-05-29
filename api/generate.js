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

ABSOLUTE RULE — NEVER INVENT ANYTHING: Every value you output must come from what you can actually SEE in the photos (the garment itself, the brand/care/size tags) or MEASURE from a tape measure visible in the photos. You must NOT guess, estimate, infer or invent any value. If you cannot clearly see or read it, you OMIT that field. Do NOT use "(verify)" guesses. Do NOT fabricate a style, length, leg shape, material, color, brand or size that you cannot actually confirm from the image. An omitted field is ALWAYS better than a guessed one. This rule overrides every other instruction below.

SIZE: Try hard to read the size from the size tag in the photos. If you can read it, put it in the title and in the "Size" item specific. If you genuinely CANNOT read a size anywhere in the photos, set the "Size" item specific value to "—" (an em dash) and do NOT put any size in the title. Never invent or estimate a size.

CASSINI TITLE STRATEGY: Use as many of the 80 characters as possible without going over, using ONLY information you actually see. Front-load the highest-traffic search keywords (what a real buyer would type). Order: Brand + Department (Women's/Men's/Girls'/Boys'/Plus Size) + Item Type + key descriptors you can confirm (Color, Material, Style, Fit) + Size (only if you read it). Use natural buyer search terms, no punctuation, no filler words like "beautiful" or "nice", no ALL CAPS spam. Do not pad the title with descriptors you cannot confirm.

ITEM SPECIFICS — FILL ONLY WHAT YOU CAN CONFIRM, NEVER INVENT: eBay rewards listings with MANY completed item specifics, so fill EVERY field you can actually determine from the photos (brand/care/size tags and the visible garment). But ONLY fill a field when you can see it or read it with real certainty. If you cannot tell, OMIT that field entirely from the array. Do NOT guess and do NOT add "(verify)". An omitted field is always better than a made-up one.

MEASUREMENT-BASED FIELDS — READ THE TAPE MEASURE (this is reading, not guessing): The seller often includes photos with a tape measure (cinta métrica) laid along the garment to show its real length. Reading a number off the tape is allowed and encouraged — it is a real measurement, not a guess.
- If you can clearly read a number on the tape where the garment ends, USE that real measurement as a FACT.
- For Dress Length, convert the measured shoulder-to-hem length using this standard eBay table:
   • up to 33 in → Mini
   • 34–37 in → Knee-Length
   • 38–44 in → Midi
   • 45 in and above → Maxi
   (Apply the analogous logic to other measured fields when the tape clearly shows the number.)
- If there is NO readable tape measure and no measurement on a tag, then OMIT the length/measurement field entirely. Do NOT estimate it visually and do NOT add "(verify)". Never assert a length from the image alone without a tape measure.

PANTS/JEANS MEASUREMENTS — WAIST, INSEAM AND LEG STYLE (apply ONLY when the garment is pants, jeans, trousers or leggings, and ONLY when a tape measure is clearly readable in the photos):
All measurements must be reported in INCHES. If a tape shows centimeters, convert to inches (1 in = 2.54 cm) and round to the nearest whole inch.
• WAIST SIZE — the seller lays the tape FLAT across the waistband from side to side (edge to edge), so it shows HALF of the real waist. Read that flat width and MULTIPLY BY 2 to get the full waist circumference. Put the result in an item specific labeled "Waist Size" in inches (e.g. "32 in"), as a FACT. If you cannot read the tape, OMIT "Waist Size".
• INSEAM — the seller lays the tape ALONG THE INNER LEG, from the crotch seam down to the bottom hem. Read that number directly (do NOT multiply). Put it in an item specific labeled "Inseam" in inches (e.g. "30 in"), as a FACT. If you cannot read the tape, OMIT "Inseam".
• LEG STYLE / FIT — decide "Wide Leg" or "Straight" ONLY if a tape measure shows the leg-opening (flat width across the bottom hem) AND the leg shape is clearly visible:
   - flat hem width about 8 in or less, leg same width or slightly tapering → "Straight".
   - flat hem width clearly wider (about 9–10 in or more) AND leg visibly widens/flares from the knee down → "Wide Leg".
   - Put the result in an item specific labeled "Leg Style" (value exactly "Wide Leg" or "Straight"), as a FACT.
   - If there is NO readable tape measure for the leg opening, OMIT "Leg Style" entirely. Do NOT guess it from the photo and do NOT add "(verify)".
- Country of Origin: only if the "Made in ___" line is readable on the brand/care tag; otherwise omit.
- Occasion: only a realistic, clearly-supported use (e.g. Casual, Travel, Workwear, Party/Cocktail, Beach, Vacation); if unsure, omit.
- Theme: ONLY if you can confidently base it on the garment's actual visible style — put at least 5 style/search words a real buyer would type, separated by commas (e.g. "Vintage, Western, Casual, Everyday, Retro"). If you cannot confidently characterize the style, omit Theme. Never invent unrelated themes.
- Garment Care: only if readable on the care tag (e.g. Machine Washable, Hand Wash, Dry Clean Only); otherwise omit.
Always include Brand, Department, Type and Condition when visible. Include Size per the SIZE rule above (use "—" if unreadable). Then add every other field you can actually confirm.

OUTPUT ORDER OF item_specifics — VERY IMPORTANT: Return the item_specifics array in EXACTLY this eBay order, including only the fields you can confirm (skip the rest, keep the relative order):
Brand, Size Type, Style, Dress Length, Color, Department, Size, Type, Sleeve Length, Pattern, Occasion, Material, Theme, Neckline, Fabric Type, Character, Vintage, Season, Sleeve Type, Closure, Waist Size, Inseam, Leg Style, Rise, Accents, Features, Country of Origin, Handmade, Personalize, Garment Care, California Prop 65 Warning, Fabric Weight, Heel Height, Condition.
(The app will also re-sort them into this order, but please output them already in this order.)

Create a complete, ready-to-publish eBay listing as a JSON object with exactly this shape:

{
  "garment": "one of: blouse|shorts|dress|pants|shoes|sweater|bra|swimsuit|bag",
  "display": "mannequin|hanger",
  "title": "optimized eBay title in ENGLISH, aim for 70-80 characters, front-load most-searched keywords using ONLY confirmed info; include brand + department + item type + color + material/style + SIZE (size only if you actually read it); use Women's/Men's/Plus Size when relevant; NO punctuation, NO filler",
  "category": "suggested eBay category path in English",
  "item_specifics": [
    {"label": "Brand", "value": "..."},
    {"label": "Department", "value": "..."},
    {"label": "Type", "value": "..."},
    {"label": "Size", "value": "..."},
    {"label": "Color", "value": "..."},
    {"label": "Condition", "value": "..."}
  ],
  "description": "persuasive sales description in ENGLISH, MEDIUM length — like a typical good eBay clothing listing, NOT long. Write ONE single natural paragraph (you decide the exact length, but keep it medium and tight, roughly 4-7 sentences). Cover only the essentials you can actually confirm: what the item is, the brand if known, the key style points you can see (silhouette/fit, neckline, sleeves, hem, print/color), the size (only if read), and the condition stated honestly with any visible flaws. Do not pad it, do not repeat the item specifics, do not write multiple paragraphs. Do NOT invent details you cannot see. Do NOT include any keyword list, hashtag list, search-terms line or SEO keywords inside the description. Do NOT include shipping, washing, color-variation or measurement boilerplate notes; those are added separately by the app.",
  "price_min": number,
  "price_max": number
}

The item_specifics array above shows only a few example fields. ADD as many of these additional labels as you can ACTUALLY CONFIRM for this exact item (omit any you are unsure of), keeping the eBay output order described above: Size Type, Style, Dress Length, Sleeve Length, Sleeve Type, Pattern, Neckline, Waist Size, Inseam, Leg Style, Rise, Closure, Fabric Type, Features, Accents, Occasion, Theme, Season, Country of Origin, Vintage, Garment Care, Heel Height (shoes). The more accurate specifics, the better — but never invent.

For price_min and price_max: estimate the realistic SOLD price range in USD for this item in this condition on eBay, as an experienced reseller would, considering the brand's resale demand, item type and condition. Give a sensible range (not too wide).

REMINDER: Never invent. If you cannot read or see a field, OMIT it (or use "—" only for Size). No "(verify)" values. The "Theme" item specific, when included, must contain at least 5 comma-separated buyer search words based on the real visible style.`,
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

    // Reordenar los item specifics al orden oficial de eBay (red de seguridad
    // por si la IA no respeta el orden pedido en el prompt).
    if (Array.isArray(parsed.item_specifics)) {
      parsed.item_specifics = sortSpecsToEbayOrder(parsed.item_specifics);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno del servidor." });
  }
}

// Orden oficial de Item Specifics de eBay (categoría ropa de mujer),
// tomado del flujo real de venta de eBay. Los campos que la IA devuelva
// se reordenan según esta lista; cualquier campo no listado se coloca al
// final, conservando su orden relativo.
const EBAY_SPEC_ORDER = [
  "Brand",
  "Size Type",
  "Style",
  "Dress Length",
  "Color",
  "Department",
  "Size",
  "Type",
  "Sleeve Length",
  "Pattern",
  "Occasion",
  "Material",
  "Theme",
  "Neckline",
  "Fabric Type",
  "Character",
  "Vintage",
  "Season",
  "Sleeve Type",
  "Closure",
  "Waist Size",
  "Inseam",
  "Leg Style",
  "Rise",
  "Accents",
  "Features",
  "Country of Origin",
  "Country/Region of Manufacture",
  "Handmade",
  "Personalize",
  "Garment Care",
  "California Prop 65 Warning",
  "Fabric Weight",
  "Heel Height",
  "MPN",
  "Unit Quantity",
  "Unit Type",
  "UPC",
  "Custom SKU",
  "Condition",
];

function sortSpecsToEbayOrder(specs) {
  // Índice de cada etiqueta en el orden de eBay (case-insensitive).
  const orderIndex = (label) => {
    const norm = (label || "").trim().toLowerCase();
    const i = EBAY_SPEC_ORDER.findIndex((x) => x.toLowerCase() === norm);
    // Los no listados van al final (valor alto), conservando orden de llegada.
    return i === -1 ? EBAY_SPEC_ORDER.length : i;
  };
  // Orden estable: mantiene el orden original entre empates / no listados.
  return specs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const oa = orderIndex(a.s.label);
      const ob = orderIndex(b.s.label);
      return oa === ob ? a.i - b.i : oa - ob;
    })
    .map((x) => x.s);
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
