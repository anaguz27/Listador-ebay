// api/ebay-list-test.js  — Fase 3 v2: item con MAS specifics + recrea oferta + PUBLICA
// Agrega "Size Type" (lo que eBay pidio) y otros aspects comunes de ropa.
// Hace los 4 pasos con UN solo code: ubicacion -> item -> oferta -> publicar.
// Uso: login OAuth, copiar ?code= fresco y pegarlo en:
//   /api/ebay-list-test?code=EL_CODIGO   (dentro de 5 min)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";

const MARKETPLACE = "EBAY_US";

// IDs de politicas (Fase 2)
const POLICY_PAGO = "6229043000";
const POLICY_DEVOLUCIONES = "6229044000";
const POLICY_ENVIO_7 = "6229038000"; // 7.00 blusas normales

const SKU = "TEST-BLUSA-001";
const MERCHANT_LOCATION_KEY = "ubicacion-principal";
const CATEGORY_ID = "53159"; // Women's Tops & Blouses

async function getToken(code) {
  const creds = Buffer.from(
    `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.EBAY_RU_NAME
  });
  const res = await fetch(EBAY_OAUTH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`
    },
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
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

async function crearUbicacion(token) {
  try {
    const res = await fetch(`${INVENTORY_API}/location/${MERCHANT_LOCATION_KEY}`, {
      method: "POST",
      headers: H(token),
      body: JSON.stringify({
        location: {
          address: {
            addressLine1: "123 Main St",
            city: "San Jose",
            stateOrProvince: "CA",
            postalCode: "95125",
            country: "US"
          }
        },
        name: "Ubicacion Principal",
        merchantLocationStatus: "ENABLED",
        locationTypes: ["WAREHOUSE"]
      })
    });
    if (res.status === 204 || res.status === 200) return { paso: "1-ubicacion", ok: true, nota: "creada" };
    const data = await res.json().catch(() => ({}));
    if (data?.errors?.some((e) => e.errorId === 25801)) return { paso: "1-ubicacion", ok: true, nota: "ya existia" };
    return { paso: "1-ubicacion", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "1-ubicacion", ok: false, error: String(err) };
  }
}

async function crearItem(token) {
  try {
    const res = await fetch(`${INVENTORY_API}/inventory_item/${SKU}`, {
      method: "PUT",
      headers: H(token),
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: "USED_EXCELLENT",
        product: {
          title: "Blusa de mujer talla M - prueba Sandbox",
          description: "Blusa de mujer en excelente estado. Talla M. Listado de prueba en Sandbox.",
          aspects: {
            Brand: ["Unbranded"],
            Size: ["M"],
            "Size Type": ["Regular"],
            Color: ["Blue"],
            Department: ["Women"],
            Type: ["Blouse"],
            "Sleeve Length": ["Short Sleeve"],
            Material: ["Cotton"],
            Style: ["Basic Tee"],
            Occasion: ["Casual"]
          },
          imageUrls: ["https://i.ebayimg.com/images/g/9~0AAOSwAAAAAAAA/s-l500.jpg"]
        }
      })
    });
    if (res.status === 204 || res.status === 200) return { paso: "2-item", ok: true, sku: SKU };
    const data = await res.json().catch(() => ({}));
    return { paso: "2-item", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "2-item", ok: false, error: String(err) };
  }
}

async function obtenerOferta(token) {
  // Busca si ya hay una oferta para este SKU; si no, la crea.
  try {
    const get = await fetch(`${INVENTORY_API}/offer?sku=${SKU}`, {
      method: "GET",
      headers: H(token)
    });
    const gd = await get.json().catch(() => ({}));
    if (gd?.offers?.length) {
      return { paso: "3-oferta", ok: true, offerId: gd.offers[0].offerId, nota: "ya existia" };
    }
    const res = await fetch(`${INVENTORY_API}/offer`, {
      method: "POST",
      headers: H(token),
      body: JSON.stringify({
        sku: SKU,
        marketplaceId: MARKETPLACE,
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId: CATEGORY_ID,
        listingDescription: "Blusa de mujer en excelente estado. Talla M. Listado de prueba en Sandbox.",
        pricingSummary: { price: { value: "19.99", currency: "USD" } },
        listingPolicies: {
          paymentPolicyId: POLICY_PAGO,
          returnPolicyId: POLICY_DEVOLUCIONES,
          fulfillmentPolicyId: POLICY_ENVIO_7
        },
        merchantLocationKey: MERCHANT_LOCATION_KEY
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) return { paso: "3-oferta", ok: true, offerId: data.offerId };
    return { paso: "3-oferta", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "3-oferta", ok: false, error: String(err) };
  }
}

async function publicar(token, offerId) {
  try {
    const res = await fetch(`${INVENTORY_API}/offer/${offerId}/publish`, {
      method: "POST",
      headers: H(token)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) return { paso: "4-publicar", ok: true, listingId: data.listingId };
    return { paso: "4-publicar", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "4-publicar", ok: false, error: String(err) };
  }
}

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: "Falta ?code= en la URL. Haz login OAuth primero." });
  }
  try {
    const token = await getToken(code);
    const pasos = [];
    pasos.push(await crearUbicacion(token));
    pasos.push(await crearItem(token));
    const oferta = await obtenerOferta(token);
    pasos.push(oferta);

    let pub = null;
    if (oferta.ok && oferta.offerId) {
      pub = await publicar(token, oferta.offerId);
      pasos.push(pub);
    }

    return res.status(200).json({
      resumen: pub?.ok
        ? `LISTADO PUBLICADO! listingId: ${pub.listingId}`
        : "Reviso el detalle: ver que paso fallo",
      listingId: pub?.listingId || null,
      offerId: oferta?.offerId || null,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
