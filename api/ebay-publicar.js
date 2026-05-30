// api/ebay-publicar.js  — Fase 4, Paso C: publicar listado AGENDADO desde la app
// Usa el EBAY_REFRESH_TOKEN guardado en Vercel para renovar acceso solo.
// Recibe del frontend: { listing, images, startDate }
//   listing = el JSON de la IA (title, item_specifics, description, price_min/max, garment, display, fixedNotes)
//   images  = [{ data: base64SinPrefijo, mediaType }]
//   startDate = ISO UTC opcional (ej "2026-06-10T18:00:00Z"); si falta, +7 dias
// Hace: token -> sube fotos a EPS -> item -> oferta agendada -> publishOffer
// Devuelve log por paso.

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";
const MEDIA_API = "https://apim.sandbox.ebay.com/commerce/media/v1_beta";

const MARKETPLACE = "EBAY_US";

// Politicas (Fase 2)
const POLICY_PAGO = "6229043000";
const POLICY_DEVOLUCIONES = "6229044000";
const ENVIO = {
  "6.50": "6229037000",
  "7.00": "6229038000",
  "8.99": "6229039000",
  "9.98": "6229041000"
};

// Mapa: tipo de prenda -> politica de envio
function envioPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  if (g === "blouse") return ENVIO["7.00"];
  if (g === "sweater" || g === "dress") return ENVIO["8.99"];
  if (g === "pants" || g === "shorts" || g === "shoes" || g === "bag" || g === "swimsuit" || g === "bra")
    return ENVIO["9.98"];
  return ENVIO["9.98"]; // por defecto, el mas alto (seguro)
}

// Categoria eBay por tipo de prenda (Sandbox suele aceptar estas)
function categoriaPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  const cats = {
    blouse: "53159",   // Women's Tops & Blouses
    dress: "63861",    // Women's Dresses
    pants: "63863",    // Women's Pants
    shorts: "11555",   // Women's Shorts
    sweater: "63866",  // Women's Sweaters
    shoes: "3034",     // Women's Shoes
    bag: "169291",     // Women's Bags & Handbags
    swimsuit: "63867", // Women's Swimwear
    bra: "163225"      // Women's Intimates
  };
  return cats[g] || "53159";
}

// Genera un SKU unico
function nuevoSku() {
  return "APP-" + Date.now();
}

function fechaPorDefecto() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  return d.toISOString().split(".")[0] + "Z";
}

// --- Renovar access token con el refresh token guardado ---
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

// --- Subir UNA foto a EPS (multipart) y devolver su URL ---
async function subirFoto(token, base64, mediaType) {
  const bin = Buffer.from(base64, "base64");
  const boundary = "----eps" + Date.now() + Math.random().toString(16).slice(2);
  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="foto.jpg"\r\n` +
    `Content-Type: ${mediaType || "image/jpeg"}\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const cuerpo = Buffer.concat([pre, bin, post]);

  const r = await fetch(`${MEDIA_API}/image/create_image_from_file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: cuerpo
  });

  // EPS devuelve 201 con la URL de la imagen en el header Location
  if (r.status === 201) {
    const loc = r.headers.get("location") || "";
    // loc = https://apim.sandbox.ebay.com/commerce/media/v1_beta/image/{image_id}
    const imageId = loc.split("/image/")[1];
    // La URL que se usa en el listado es la EPS publica; la obtenemos con getImage
    try {
      const g = await fetch(`${MEDIA_API}/image/${imageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const gd = await g.json().catch(() => ({}));
      const url = gd?.imageUrls?.[0]?.imageUrl || gd?.image?.imageUrl || null;
      return { ok: true, imageId, url };
    } catch {
      return { ok: true, imageId, url: null };
    }
  }
  const err = await r.text().catch(() => "");
  return { ok: false, status: r.status, error: err.slice(0, 300) };
}

// Convierte item_specifics [{label,value}] al formato aspects de eBay
function toAspects(specs) {
  const aspects = {};
  (specs || []).forEach((s) => {
    if (!s || !s.label || !s.value) return;
    if (s.value === "—") return; // saltar size desconocido
    aspects[s.label] = [String(s.value)];
  });
  // Garantizar Size Type (eBay lo exige en blusas)
  if (!aspects["Size Type"]) aspects["Size Type"] = ["Regular"];
  return aspects;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pasos = [];
  try {
    const { listing, images, startDate } = req.body || {};
    if (!listing) return res.status(400).json({ error: "Falta listing" });
    if (!images || !images.length) return res.status(400).json({ error: "Faltan fotos" });

    const token = await getAccessToken();
    pasos.push({ paso: "0-token", ok: true });

    // 1) Subir fotos a EPS
    const urls = [];
    for (let i = 0; i < Math.min(images.length, 12); i++) {
      const r = await subirFoto(token, images[i].data, images[i].mediaType);
      pasos.push({ paso: `1-foto-${i + 1}`, ok: r.ok, url: r.url, error: r.error });
      if (r.ok && r.url) urls.push(r.url);
    }
    if (!urls.length) {
      return res.status(502).json({ error: "No se pudo subir ninguna foto a eBay", pasos });
    }

    // 2) Crear inventory item
    const sku = nuevoSku();
    const descBlock =
      (listing.fixedNotes ? listing.fixedNotes + "\n\n" : "") + (listing.description || "");
    const itemRes = await fetch(`${INVENTORY_API}/inventory_item/${sku}`, {
      method: "PUT",
      headers: H(token),
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: "USED_EXCELLENT",
        product: {
          title: (listing.title || "").slice(0, 80),
          description: descBlock,
          aspects: toAspects(listing.item_specifics),
          imageUrls: urls
        }
      })
    });
    if (itemRes.status !== 200 && itemRes.status !== 204) {
      const e = await itemRes.json().catch(() => ({}));
      pasos.push({ paso: "2-item", ok: false, status: itemRes.status, error: e });
      return res.status(502).json({ error: "Fallo al crear el item", pasos });
    }
    pasos.push({ paso: "2-item", ok: true, sku });

    // 3) Crear oferta agendada
    const fecha = startDate || fechaPorDefecto();
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
        listingStartDate: fecha,
        listingDescription: descBlock,
        pricingSummary: { price: { value: precio, currency: "USD" } },
        listingPolicies: {
          paymentPolicyId: POLICY_PAGO,
          returnPolicyId: POLICY_DEVOLUCIONES,
          fulfillmentPolicyId: envioPorPrenda(listing.garment)
        },
        merchantLocationKey: "ubicacion-principal"
      })
    });
    const ofData = await ofRes.json().catch(() => ({}));
    if (ofRes.status !== 200 && ofRes.status !== 201) {
      pasos.push({ paso: "3-oferta", ok: false, status: ofRes.status, error: ofData });
      return res.status(502).json({ error: "Fallo al crear la oferta", pasos });
    }
    const offerId = ofData.offerId;
    pasos.push({ paso: "3-oferta", ok: true, offerId, fecha });

    // 4) Publicar
    const pubRes = await fetch(`${INVENTORY_API}/offer/${offerId}/publish`, {
      method: "POST",
      headers: H(token)
    });
    const pubData = await pubRes.json().catch(() => ({}));
    if (pubRes.status !== 200 && pubRes.status !== 201) {
      pasos.push({ paso: "4-publicar", ok: false, status: pubRes.status, error: pubData });
      return res.status(502).json({ error: "Fallo al publicar", pasos });
    }
    pasos.push({ paso: "4-publicar", ok: true, listingId: pubData.listingId });

    return res.status(200).json({
      ok: true,
      mensaje: `Listado AGENDADO para ${fecha}`,
      listingId: pubData.listingId,
      offerId,
      sku,
      fotos: urls.length,
      fecha,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err), pasos });
  }
}
