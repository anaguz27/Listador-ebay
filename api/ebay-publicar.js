// api/ebay-publicar.js  — Fase 4 v4: arregla el TIMEOUT (502)
// Cambios clave:
//  - maxDuration 60s (mas tiempo para la funcion)
//  - sube fotos EN PARALELO (no una por una)
//  - NO hace la segunda llamada getImage: usa la URL del header Location directo
//  - limita a 8 fotos para ir mas rapido

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60
};

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";
const MEDIA_API = "https://apim.sandbox.ebay.com/commerce/media/v1_beta";

const MARKETPLACE = "EBAY_US";
const MAX_FOTOS = 8;

const POLICY_PAGO = "6229043000";
const POLICY_DEVOLUCIONES = "6229044000";
const ENVIO = {
  "6.50": "6229037000",
  "7.00": "6229038000",
  "8.99": "6229039000",
  "9.98": "6229041000"
};

function envioPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  if (g === "blouse") return ENVIO["7.00"];
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

function nuevoSku() { return "APP-" + Date.now(); }

function fechaPorDefecto() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  return d.toISOString().split(".")[0] + "Z";
}

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

// Sube UNA foto a EPS. Usa la URL del header Location directo (sin getImage).
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

    if (r.status === 201) {
      // La URL publica EPS viene en el header Location
      const loc = r.headers.get("location") || "";
      return { ok: true, url: loc };
    }
    const txt = await r.text().catch(() => "");
    return { ok: false, status: r.status, error: txt.slice(0, 400) };
  } catch (err) {
    return { ok: false, error: "excepcion: " + String(err) };
  }
}

function toAspects(specs) {
  const aspects = {};
  (specs || []).forEach((s) => {
    if (!s || !s.label || !s.value) return;
    if (s.value === "—") return;
    aspects[s.label] = [String(s.value)];
  });
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

    // 1) Subir fotos EN PARALELO (clave para no exceder el tiempo)
    const aSubir = images.slice(0, MAX_FOTOS);
    const resultados = await Promise.all(
      aSubir.map((img) => subirFoto(token, img.data, img.mediaType))
    );
    const urls = [];
    const erroresFoto = [];
    resultados.forEach((r, i) => {
      pasos.push({ paso: `1-foto-${i + 1}`, ok: r.ok, url: r.url, status: r.status, error: r.error });
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

    // 2) Inventory item
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

    // 3) Oferta agendada
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
