// api/ebay-publicar-vivo.js
// Publica un listado EN VIVO (a la venta ya) en eBay PRODUCCIÓN, partiendo
// de un "listing" + "imageUrls" YA subidas (las que guardó el borrador).
// NO vuelve a subir fotos: usa las URLs directamente => publicar es rápido.
// Es como ebay-draft.js pero: (1) recibe imageUrls en vez de base64, y
// (2) llama a publishOffer para que el listado quede activo de inmediato.

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
  maxDuration: 60
};

const EBAY_OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.ebay.com/sell/inventory/v1";

const MARKETPLACE = "EBAY_US";

// === IDs de PRODUCCIÓN (cuenta bernabep78) ===
const POLICY_PAGO = "243970968017";
const POLICY_DEVOLUCIONES = "243970966017";
const ENVIO = {
  "6.50": "258457672017",  // LIGTHWEIGHT
  "7.00": "258473190017",  // BLOUSES
  "8.99": "258307664017",  // SWEATER
  "9.98": "258307739017"   // PANTS
};
const MERCHANT_LOCATION = "ubicacion-principal";

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

  const tmp = {};
  (specs || []).forEach((s) => {
    if (!s || !s.label || !s.value) return;
    if (s.value === "—") return;
    tmp[s.label] = limpia(s.value);
  });

  if (!tmp["Brand"]) tmp["Brand"] = "Unbranded";
  if (!tmp["Department"]) tmp["Department"] = "Women";
  if (!tmp["Type"]) tmp["Type"] = tipoPorPrenda(garment);
  if (!tmp["Color"]) tmp["Color"] = "Multicolor";
  if (!tmp["Size"]) tmp["Size"] = "One Size";
  if (!tmp["Size Type"]) tmp["Size Type"] = "Regular";

  const aspects = {};
  EBAY_SPEC_ORDER.forEach((label) => {
    if (tmp[label] !== undefined) {
      aspects[label] = [tmp[label]];
      delete tmp[label];
    }
  });
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
    const { listing, imageUrls, precioElegido, envioElegido } = req.body || {};
    if (!listing) return res.status(400).json({ error: "Falta listing" });
    if (!imageUrls || !imageUrls.length) {
      return res.status(400).json({ error: "Faltan las fotos (imageUrls). Vuelve a guardar el borrador." });
    }

    const token = await getAccessToken();
    pasos.push({ paso: "0-token", ok: true });

    // 1) Inventory item (usando las URLs YA subidas, sin volver a subir nada)
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
        // Peso y dimensiones del paquete: requeridos por USPS Ground Advantage.
        // Sin esto, publishOffer falla con error 25007 ("invalid shipping data").
        // 1 libra y caja chica cubren casi cualquier prenda doblada.
        packageWeightAndSize: {
          packageType: "PACKAGE_THICK_ENVELOPE",
          weight: { value: 1, unit: "POUND" },
          dimensions: { length: 12, width: 9, height: 2, unit: "INCH" }
        },
        product: {
          title: (listing.title || "").slice(0, 80),
          description: descBlock,
          aspects,
          imageUrls: imageUrls
        }
      })
    });
    if (itemRes.status !== 200 && itemRes.status !== 204) {
      const e = await itemRes.json().catch(() => ({}));
      pasos.push({ paso: "1-item", ok: false, status: itemRes.status, error: e });
      const msgs = (e.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al crear el item: " + (msgs || JSON.stringify(e).slice(0, 400)), pasos });
    }
    pasos.push({ paso: "1-item", ok: true, sku });

    // 2) Oferta — SIN listingStartDate => al publicar queda ACTIVA de inmediato
    // Precio: usa el que eligió la pantalla; si no, el price_max del listado.
    const precio = String(precioElegido || listing.price_max || listing.price_min || "9.99");
    // Envío: usa el ID que eligió la pantalla; si no, el automático por prenda.
    const fulfillmentId =
      (envioElegido && ENVIO[envioElegido]) ? ENVIO[envioElegido] : envioPorPrenda(listing.garment);
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
        // Best Offer activado: el comprador puede hacer ofertas, Ana decide cada una.
        // Sin auto-aceptar ni auto-rechazar (control manual).
        bestOfferTerms: { bestOfferEnabled: true },
        listingPolicies: {
          paymentPolicyId: POLICY_PAGO,
          returnPolicyId: POLICY_DEVOLUCIONES,
          fulfillmentPolicyId: fulfillmentId
        },
        merchantLocationKey: MERCHANT_LOCATION
      })
    });
    const ofData = await ofRes.json().catch(() => ({}));
    if (ofRes.status !== 200 && ofRes.status !== 201) {
      pasos.push({ paso: "2-oferta", ok: false, status: ofRes.status, error: ofData });
      const msgs = (ofData.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al crear la oferta: " + (msgs || JSON.stringify(ofData).slice(0, 400)), pasos });
    }
    const offerId = ofData.offerId;
    pasos.push({ paso: "2-oferta", ok: true, offerId });

    // 3) PUBLICAR => el listado queda EN VIVO (a la venta) de inmediato
    const pubRes = await fetch(`${INVENTORY_API}/offer/${offerId}/publish`, {
      method: "POST",
      headers: H(token)
    });
    const pubData = await pubRes.json().catch(() => ({}));
    if (pubRes.status !== 200) {
      pasos.push({ paso: "3-publicar", ok: false, status: pubRes.status, error: pubData });
      const msgs = (pubData.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al publicar: " + (msgs || JSON.stringify(pubData).slice(0, 400)), pasos });
    }
    const listingId = pubData.listingId;
    pasos.push({ paso: "3-publicar", ok: true, listingId });

    return res.status(200).json({
      ok: true,
      mensaje: "¡Listado publicado EN VIVO en eBay! Ya está a la venta.",
      listingId,
      offerId,
      sku,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err), pasos });
  }
}
