// api/ebay-agendar-test.js  — Fase 3+: LISTADO AGENDADO (fecha futura)
// Crea item nuevo -> oferta con listingStartDate a 7 dias -> publishOffer.
// El listado quedara PROGRAMADO: visible solo para la vendedora en Seller Hub
// hasta que llegue la fecha; entonces se activa solo.
// Uso: login OAuth, copiar ?code= fresco y pegarlo en:
//   /api/ebay-agendar-test?code=EL_CODIGO   (dentro de 5 min)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";

const MARKETPLACE = "EBAY_US";

const POLICY_PAGO = "6229043000";
const POLICY_DEVOLUCIONES = "6229044000";
const POLICY_ENVIO_7 = "6229038000";

const SKU = "TEST-BLUSA-AGENDADA";
const MERCHANT_LOCATION_KEY = "ubicacion-principal";
const CATEGORY_ID = "53159";

// Fecha de inicio: 7 dias en el futuro, en formato UTC (ej. 2026-06-06T18:00:00Z)
function fechaFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  // redondeo a la hora en punto para que se vea limpio
  d.setMinutes(0, 0, 0);
  return d.toISOString().split(".")[0] + "Z";
}

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

async function crearItem(token) {
  try {
    const res = await fetch(`${INVENTORY_API}/inventory_item/${SKU}`, {
      method: "PUT",
      headers: H(token),
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: "USED_EXCELLENT",
        product: {
          title: "Blusa de mujer talla M - prueba AGENDADA Sandbox",
          description: "Blusa de mujer en excelente estado. Talla M. Listado AGENDADO de prueba.",
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
    if (res.status === 204 || res.status === 200) return { paso: "1-item", ok: true, sku: SKU };
    const data = await res.json().catch(() => ({}));
    return { paso: "1-item", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "1-item", ok: false, error: String(err) };
  }
}

async function crearOfertaAgendada(token, fecha) {
  try {
    // primero busca si ya existe oferta para el SKU
    const get = await fetch(`${INVENTORY_API}/offer?sku=${SKU}`, { method: "GET", headers: H(token) });
    const gd = await get.json().catch(() => ({}));
    if (gd?.offers?.length) {
      return { paso: "2-oferta", ok: true, offerId: gd.offers[0].offerId, nota: "ya existia", fecha };
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
        listingStartDate: fecha,   // <-- la fecha futura: aqui ocurre la magia
        listingDescription: "Blusa de mujer en excelente estado. Talla M. Listado AGENDADO de prueba.",
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
    if (res.status === 200 || res.status === 201) return { paso: "2-oferta", ok: true, offerId: data.offerId, fecha };
    return { paso: "2-oferta", ok: false, status: res.status, error: data, fecha };
  } catch (err) {
    return { paso: "2-oferta", ok: false, error: String(err) };
  }
}

async function publicar(token, offerId) {
  try {
    const res = await fetch(`${INVENTORY_API}/offer/${offerId}/publish`, {
      method: "POST",
      headers: H(token)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) return { paso: "3-publicar", ok: true, listingId: data.listingId };
    return { paso: "3-publicar", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "3-publicar", ok: false, error: String(err) };
  }
}

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: "Falta ?code= en la URL. Haz login OAuth primero." });
  }
  try {
    const token = await getToken(code);
    const fecha = fechaFutura();
    const pasos = [];
    pasos.push(await crearItem(token));
    const oferta = await crearOfertaAgendada(token, fecha);
    pasos.push(oferta);

    let pub = null;
    if (oferta.ok && oferta.offerId) {
      pub = await publicar(token, oferta.offerId);
      pasos.push(pub);
    }

    return res.status(200).json({
      resumen: pub?.ok
        ? `LISTADO AGENDADO PUBLICADO para ${fecha}. listingId: ${pub.listingId}`
        : "Reviso el detalle: ver que paso fallo",
      fechaProgramada: fecha,
      listingId: pub?.listingId || null,
      offerId: oferta?.offerId || null,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
