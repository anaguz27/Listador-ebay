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
  // IMPORTANTE: todas deben ser categorías HOJA ("leaf") de eBay US.
  // Una categoría padre (ej. 3034 = "Women's Shoes") hace que publishOffer
  // falle con error 25005 ("category is not a leaf category").
  const cats = {
    blouse: "53159",   // Women's Tops
    dress: "63861",    // Women's Dresses
    pants: "63863",    // Women's Pants
    shorts: "11555",   // Women's Shorts
    sweater: "63866",  // Women's Sweaters
    shoes: "62107",    // Women's Sandals (HOJA) — antes era 3034 (padre, no publicaba)
    bag: "169291",     // Women's Handbags
    swimsuit: "63867", // Women's Swimwear
    bra: "163225"      // Women's Bras
  };
  return cats[g] || "53159";
}

function tipoPorPrenda(garment) {
  const g = (garment || "").toLowerCase();
  const tipos = {
    blouse: "Blouse", dress: "Dress", pants: "Pants", shorts: "Shorts",
    sweater: "Sweater", shoes: "Sandals", bag: "Handbag", swimsuit: "Swimwear", bra: "Bra"
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

// ====================================================================
//  CREAR LA OFERTA con reintento automático del error 25002
//  ("Offer entity already exists"). Si eBay dice que ya existe una oferta
//  para este SKU, la buscamos por SKU, la BORRAMOS (DELETE) y reintentamos.
//  Así Ana no tiene que cambiar el SKU a mano nunca más.
// ====================================================================
async function crearOfertaConReintento(token, offerBody, sku, pasos) {
  // Intento 1: crear la oferta normalmente.
  let ofRes = await fetch(`${INVENTORY_API}/offer`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(offerBody)
  });
  let ofData = await ofRes.json().catch(() => ({}));

  if (ofRes.status === 200 || ofRes.status === 201) {
    return { ok: true, offerId: ofData.offerId };
  }

  // ¿Es el error 25002 (la oferta ya existe para este SKU)?
  const es25002 = (ofData.errors || []).some((x) => Number(x.errorId) === 25002);
  if (!es25002) {
    // Otro error distinto: devolver tal cual para que el handler lo reporte.
    return { ok: false, status: ofRes.status, error: ofData };
  }

  pasos.push({ paso: "2a-detectado-25002", ok: true, nota: "Oferta huérfana encontrada, se borrará y reintentará." });

  // Paso A: buscar la oferta existente de este SKU para sacar su offerId.
  let offerIdHuerfano = null;
  try {
    const getRes = await fetch(
      `${INVENTORY_API}/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${MARKETPLACE}`,
      { method: "GET", headers: H(token) }
    );
    const getData = await getRes.json().catch(() => ({}));
    if (getRes.ok && Array.isArray(getData.offers) && getData.offers.length) {
      offerIdHuerfano = getData.offers[0].offerId;
    }
  } catch (e) { /* si falla la búsqueda, lo manejamos abajo */ }

  // Algunos errores 25002 traen el offerId directo en los parámetros.
  if (!offerIdHuerfano) {
    for (const err of (ofData.errors || [])) {
      const p = (err.parameters || []).find((x) => x.value && /^\d+$/.test(x.value));
      if (p) { offerIdHuerfano = p.value; break; }
    }
  }

  if (!offerIdHuerfano) {
    return {
      ok: false,
      status: ofRes.status,
      error: { mensaje: "Se detectó el error 25002 pero no se pudo localizar la oferta existente para borrarla.", original: ofData }
    };
  }

  // Paso B: borrar la oferta huérfana.
  const delRes = await fetch(`${INVENTORY_API}/offer/${offerIdHuerfano}`, {
    method: "DELETE",
    headers: H(token)
  });
  // 204 = borrada OK. 404 = ya no existía (también está bien para reintentar).
  if (delRes.status !== 204 && delRes.status !== 200 && delRes.status !== 404) {
    const delErr = await delRes.json().catch(() => ({}));
    return {
      ok: false,
      status: delRes.status,
      error: { mensaje: "No se pudo borrar la oferta huérfana (offerId " + offerIdHuerfano + ").", original: delErr }
    };
  }
  pasos.push({ paso: "2b-borrada-huerfana", ok: true, offerIdBorrado: offerIdHuerfano });

  // Paso C: reintentar la creación de la oferta, ahora que el SKU quedó libre.
  ofRes = await fetch(`${INVENTORY_API}/offer`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(offerBody)
  });
  ofData = await ofRes.json().catch(() => ({}));
  if (ofRes.status === 200 || ofRes.status === 201) {
    return { ok: true, offerId: ofData.offerId, reintentado: true };
  }
  return { ok: false, status: ofRes.status, error: ofData };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pasos = [];
  try {
    const { listing, imageUrls, precioElegido, envioElegido, skuElegido, aceptaOfertas, categoriaTienda } = req.body || {};
    if (!listing) return res.status(400).json({ error: "Falta listing" });
    if (!imageUrls || !imageUrls.length) {
      return res.status(400).json({ error: "Faltan las fotos (imageUrls). Vuelve a guardar el borrador." });
    }

    const token = await getAccessToken();
    pasos.push({ paso: "0-token", ok: true });

    // 1) Inventory item (usando las URLs YA subidas, sin volver a subir nada)
    // SKU: usa el que escribió Ana (su código de ubicación); si viene vacío,
    // genera uno automático para no fallar. Se limpia de espacios y caracteres raros.
    const skuLimpio = (skuElegido || "").trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 50);
    const sku = skuLimpio || nuevoSku();
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

    // Cuerpo de la oferta. La categoría de tienda (carpeta) la eliges TÚ en la
    // pantalla antes de publicar. Si viene vacía o es "Other", NO se manda nada.
    const offerBody = {
      sku,
      marketplaceId: MARKETPLACE,
      format: "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: categoriaPorPrenda(listing.garment),
      listingDescription: descBlock,
      pricingSummary: { price: { value: precio, currency: "USD" } },
      listingPolicies: {
        // Best Offer activado: el comprador puede hacer ofertas, Ana decide cada una.
        // IMPORTANTE: bestOfferTerms va DENTRO de listingPolicies (no en
        // pricingSummary ni suelto). Si va en otro lado, eBay lo ignora y el
        // listado sale con "Ofertas: No". Por defecto se activa, salvo que la
        // pantalla mande aceptaOfertas:false.
        bestOfferTerms: { bestOfferEnabled: aceptaOfertas !== false },
        paymentPolicyId: POLICY_PAGO,
        returnPolicyId: POLICY_DEVOLUCIONES,
        fulfillmentPolicyId: fulfillmentId
      },
      merchantLocationKey: MERCHANT_LOCATION
    };

    // Categoría de tienda (storeCategoryNames). eBay la espera como una ruta que
    // empieza con "/", p.ej. "/WOMENS/BLOUSES". La pantalla manda el nombre tal
    // como aparece (ej. "WOMENS > BLOUSES"); aquí lo convertimos a "/WOMENS/BLOUSES".
    // Si la categoría es "Other" o viene vacía, no se manda (eBay la deja por defecto).
    if (categoriaTienda && String(categoriaTienda).trim() && String(categoriaTienda).trim().toLowerCase() !== "other") {
      const ruta = "/" + String(categoriaTienda).trim()
        .split(">")
        .map((p) => p.trim())
        .filter(Boolean)
        .join("/");
      offerBody.storeCategoryNames = [ruta];
    }

    // Crear la oferta, con reintento automático si sale el error 25002.
    const resultadoOferta = await crearOfertaConReintento(token, offerBody, sku, pasos);
    if (!resultadoOferta.ok) {
      pasos.push({ paso: "2-oferta", ok: false, status: resultadoOferta.status, error: resultadoOferta.error });
      const errObj = resultadoOferta.error || {};
      const msgs = (errObj.errors || []).map((x) => x.message).join(" | ");
      return res.status(502).json({ error: "Fallo al crear la oferta: " + (msgs || JSON.stringify(errObj).slice(0, 400)), pasos });
    }
    const offerId = resultadoOferta.offerId;
    pasos.push({ paso: "2-oferta", ok: true, offerId, reintentado: !!resultadoOferta.reintentado });

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
