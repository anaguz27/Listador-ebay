// api/ebay-draft.js  — Guarda el listado como BORRADOR en eBay (NO lo publica)
// Basado en ebay-publicar.js (Fase 4 v5), con tres diferencias:
//  1) Apunta a PRODUCCIÓN (sin .sandbox)
//  2) Ordena los item specifics en el orden EXACTO de eBay (capturas del vendedor)
//  3) Crea el inventory item + offer pero NO llama a publishOffer:
//     un offer sin publicar ES un borrador, visible en tu Seller Hub.

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60
};

// PRODUCCIÓN (sin .sandbox)
const EBAY_OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.ebay.com/sell/inventory/v1";
const MEDIA_API = "https://apim.ebay.com/commerce/media/v1_beta";

const MARKETPLACE = "EBAY_US";
const MAX_FOTOS = 24;

// === IDs de PRODUCCIÓN (cuenta anaguz62) ===
const POLICY_PAGO = "243970968017";          // eBay Managed Payments
const POLICY_DEVOLUCIONES = "243970966017";  // 30 days money back
const ENVIO = {
  "6.50": "2584576720177", // LIGTHWEIGHT  — blusas/tops delgados (default blusas)
  "7.00": "2584731900017", // BLOUSES      — blusas normales (disponible, no por defecto)
  "8.99": "2583076640177", // SWEATER      — suéteres + vestidos
  "9.98": "2583077390017"  // PANTS        — pantalones + jackets + pesado
};
const MERCHANT_LOCATION = "ubicacion-principal"; // clave de la inventory location en PRODUCCIÓN (ver nota abajo)

// Orden EXACTO de los item specifics (tomado de las capturas reales de eBay)
const EBAY_SPEC_ORDER = [
  "Brand", "Size Type", "Size", "Color", "Department", "Type",
  "Style", "Sleeve Type", "Material", "Neckline", "Sleeve Length",
  "Accents", "Pattern", "Theme", "Features", "Fabric Type", "Character",
  "Fit", "Vintage", "Dress Length", "Waist Size", "Inseam", "Leg Style",
  "Rise", "Occasion", "Closure", "Season", "Strap Type",
  "Country of Origin", "Country/Region of Manufacture", "Handmade",
  "Personalize", "Garment Care", "California Prop 65 Warning",
  "Fabric Weight", "Heel Height", "MPN", "Unit Quantity", "Unit Type",
  "UPC", "Custom SKU", "Condition"
];

function envioPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  // Regla real del vendedor:
  //  blusa/top        -> 6.50 (por defecto)
  //  suéter + vestido -> 8.99
  //  resto (pantalón, shorts, jacket, pesado...) -> 9.98
  if (g === "blouse") return ENVIO["6.50"];
  if (g === "sweater" || g === "dress") return ENVIO["8.99"];
  return ENVIO["9.98"];
}

function categoriaPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  const cats = {
    blouse: "53159", dress: "63861", pants: "63863", shorts: "11555",
    sweater: "63866", shoes: "3034", bag: "169291", swimsuit: "63867", bra: "163225"
  };
  return cats[g] || "53159";
}

function tipoPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  const tipos = {
    blouse: "Blouse", dress: "Dress", pants: "Pants", shorts: "Shorts",
    sweater: "Sweater", shoes: "Shoes", bag: "Handbag", swimsuit: "Swimwear", bra: "Bra"
  };
  return tipos[g] || "Top";
}

function nuevoSku() { return "APP-" + Date.now(); }

async function getAccessToken() {
  const refresh = process.env.EBAY_REFRESH_TOKEN;
  if (!refresh) throw new Error("Falta EBAY_REFRESH_TOKEN en Vercel");
  const creds = Buffer.from(
    `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
  ).toString("base64");
  const scopes = [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment"
  ].join(" ");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: scopes
  });
  const r = await fetch(EBAY_OAUTH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`
    },
    body
  });
  const data = await r.json();
  if (!r.ok) throw new Error("No se pudo renovar token: " + JSON.stringify(data));
  return data.access_token;
}

function H(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Language": "en-US",
    "Accept-Language": "en-US"
  };
}

async function subirFoto(token, base64, mediaType) {
  try {
    const bin = Buffer.from(base64, "base64");
    const blob = new Blob([bin], { type: mediaType || "image/jpeg" });
    const form = new FormData();
    form.append("image", blob, "foto.jpg");

    const r = await fetch(`${MEDIA_API}/image/create_image_from_file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form
    });

    if (r.status !== 201) {
      const txt = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: txt.slice(0, 400) };
    }

    const loc = r.headers.get("location") || "";
    const imageId = loc.split("/image/")[1] || loc.split("/").pop();
    if (!imageId) return { ok: false, error: "No se obtuvo image_id" };

    const g = await fetch(`${MEDIA_API}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    const gd = await g.json().catch(() => ({}));
    const url =
      gd?.imageUrl ||
      (Array.isArray(gd?.imageUrls) ? (gd.imageUrls[0]?.imageUrl || gd.imageUrls[0]) : null) ||
      gd?.image?.imageUrl ||
      null;

    if (!url) return { ok: false, status: g.status, error: "getImage sin URL: " + JSON.stringify(gd).slice(0, 300) };
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: "excepcion: " + String(err) };
  }
}

// Construye los aspects EN EL ORDEN EXACTO de eBay, rellenando los
// obligatorios de ropa si faltan, y recortando a 65 caracteres.
function toAspects(specs, garment) {
  const limpia = (v) => {
    let s = String(v).trim();
    if (s.length > 65) {
      if (s.includes(",")) {
        const partes = s.split(",").map((p) => p.trim());
        let acc = "";
        for (const p of partes) {
          const intento = acc ? acc + ", " + p : p;
          if (intento.length > 65) break;
          acc = intento;
        }
        s = acc || partes[0].slice(0, 65);
      } else {
        s = s.slice(0, 65);
      }
    }
    return s;
  };

  // 1) Mapa temporal con lo que mandó la app (ignorando blancos "—")
  const tmp = {};
  (specs || []).forEach((s) => {
    if (!s || !s.label || !s.value) return;
    if (s.value === "—") return;
    tmp[s.label] = limpia(s.value);
  });

  // 2) Rellenos seguros para evitar error 25002 (obligatorios de ropa)
  if (!tmp["Brand"]) tmp["Brand"] = "Unbranded";
  if (!tmp["Department"]) tmp["Department"] = "Women";
  if (!tmp["Type"]) tmp["Type"] = tipoPorPrenda(garment);
  if (!tmp["Color"]) tmp["Color"] = "Multicolor";
  if (!tmp["Size"]) tmp["Size"] = "One Size";
  if (!tmp["Size Type"]) tmp["Size Type"] = "Regular";

  // 3) Construir el objeto final EN EL ORDEN de EBAY_SPEC_ORDER.
  //    (Aunque eBay no garantiza el orden visual por el JSON, así enviamos
  //     las claves ya ordenadas; los campos no listados van al final.)
  const aspects = {};
  EBAY_SPEC_ORDER.forEach((label) => {
    if (tmp[label] !== undefined) {
      aspects[label] = [tmp[label]];
      delete tmp[label];
    }
  });
  // Cualquier campo restante no contemplado en el orden, al final
  Object.keys(tmp).forEach((label) => {
    aspects[label] = [tmp[label]];
  });

  return aspects;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pasos = [];
  try {
    const { listing, images } = req.body || {};
    if (!listing) return res.status(400).json({ error: "Falta listing" });
    if (!images || !images.length) return res.status(400).json({ error: "Faltan fotos" });

    const token = await getAccessToken();
    pasos.push({ paso: "0-token", ok: true });

    // 1) Subir fotos EN PARALELO
    const aSubir = images.slice(0, MAX_FOTOS);
    const resultados = await Promise.all(
      aSubir.map((img) => subirFoto(token, img.data, img.mediaType))
    );
    const urls = [];
    const erroresFoto = [];
    resultados.forEach((r, i) => {
      pasos.push({ paso: `1-foto-${i + 1}`, ok: r.ok, status: r.status, error: r.error });
      if (r.ok && r.url) urls.push(r.url);
      else erroresFoto.push(`foto ${i + 1}: [${r.status}] ${r.error}`);
    });
    if (!urls.length) {
      return res.status(502).json({
        error: "No se pudo subir ninguna foto a eBay",
        errorDetalle: erroresFoto.join(" || "),
        pasos
      });
    }

    // 2) Inventory item (con aspects ORDENADOS)
    const sku = nuevoSku();
    const descBlock =
      (listing.fixedNotes ? listing.fixedNotes + "\n\n" : "") + (listing.description || "");
    const aspects = toAspects(listing.item_specifics, listing.garment);
    const itemRes = await fetch(`${INVENTORY_API}/inventory_item/${sku}`, {
      method: "PUT",
      headers: H(token),
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: "USED_EXCELLENT",
        product: {
          title: (listing.title || "").slice(0, 80),
          description: descBlock,
          aspects,
          imageUrls: urls
        }
      })
    });
    if (itemRes.status !== 200 && itemRes.status !== 204) {
      const e = await itemRes.json().catch(() => ({}));
      pasos.push({ paso: "2-item", ok: false, status: itemRes.status, error: e });
      const msgs = (e.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al crear el item: " + (msgs || JSON.stringify(e).slice(0,400)), pasos });
    }
    pasos.push({ paso: "2-item", ok: true, sku });

    // 3) Oferta — SIN listingStartDate y SIN publicar => queda como BORRADOR
    const precio = String(listing.price_max || listing.price_min || "9.99");
    const ofRes = await fetch(`${INVENTORY_API}/offer`, {
      method: "POST",
      headers: H(token),
      body: JSON.stringify({
        sku,
        marketplaceId: MARKETPLACE,
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId: categoriaPorPrenda(listing.garment),
        listingDescription: descBlock,
        pricingSummary: { price: { value: precio, currency: "USD" } },
        listingPolicies: {
          paymentPolicyId: POLICY_PAGO,
          returnPolicyId: POLICY_DEVOLUCIONES,
          fulfillmentPolicyId: envioPorPrenda(listing.garment)
        },
        merchantLocationKey: MERCHANT_LOCATION
      })
    });
    const ofData = await ofRes.json().catch(() => ({}));
    if (ofRes.status !== 200 && ofRes.status !== 201) {
      pasos.push({ paso: "3-oferta", ok: false, status: ofRes.status, error: ofData });
      const msgs = (ofData.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al crear el borrador: " + (msgs || JSON.stringify(ofData).slice(0,400)), pasos });
    }
    const offerId = ofData.offerId;
    pasos.push({ paso: "3-oferta(borrador)", ok: true, offerId });

    // 4) NO se publica. El offer queda como borrador en el Seller Hub.
    return res.status(200).json({
      ok: true,
      mensaje: "Borrador guardado en eBay (sin publicar). Lo verás en tu Seller Hub para revisarlo y publicarlo cuando quieras.",
      offerId,
      sku,
      fotos: urls.length,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err), pasos });
  }
}
