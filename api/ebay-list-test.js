// api/ebay-list-test.js  — Fase 3 (prueba)
// Crea: ubicacion de inventario -> inventory item (blusa) -> oferta (SIN publicar).
// Usa los IDs de politicas ya creados en Fase 2.
// Uso: login OAuth, copiar ?code= fresco y pegarlo en:
//   /api/ebay-list-test?code=EL_CODIGO   (dentro de 5 min)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";

const MARKETPLACE = "EBAY_US";

// --- IDs de politicas de la Fase 2 ---
const POLICY_PAGO = "6229043000";
const POLICY_DEVOLUCIONES = "6229044000";
const POLICY_ENVIO_7 = "6229038000"; // 7.00 blusas normales

// --- Datos de la prueba ---
const SKU = "TEST-BLUSA-001";
const MERCHANT_LOCATION_KEY = "ubicacion-principal";
// Categoria eBay: 53159 = Women's Tops & Blouses (Sandbox suele aceptarla)
const CATEGORY_ID = "53159";

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

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Language": "en-US",
    "Accept-Language": "en-US"
  };
}

// Paso 1: ubicacion de inventario (PUT, idempotente)
async function crearUbicacion(token) {
  try {
    const res = await fetch(
      `${INVENTORY_API}/location/${MERCHANT_LOCATION_KEY}`,
      {
        method: "POST",
        headers: authHeaders(token),
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
          locationInstructions: "Envios desde aqui",
          name: "Ubicacion Principal",
          merchantLocationStatus: "ENABLED",
          locationTypes: ["WAREHOUSE"]
        })
      }
    );
    if (res.status === 204 || res.status === 200) {
      return { paso: "1-ubicacion", ok: true, nota: "creada" };
    }
    const data = await res.json().catch(() => ({}));
    // Si ya existe, eBay devuelve error 25801; lo tomamos como ok.
    const yaExiste = data?.errors?.some((e) => e.errorId === 25801);
    if (yaExiste) return { paso: "1-ubicacion", ok: true, nota: "ya existia" };
    return { paso: "1-ubicacion", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "1-ubicacion", ok: false, error: String(err) };
  }
}

// Paso 2: inventory item (PUT con SKU)
async function crearItem(token) {
  try {
    const res = await fetch(`${INVENTORY_API}/inventory_item/${SKU}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        availability: {
          shipToLocationAvailability: { quantity: 1 }
        },
        condition: "USED_EXCELLENT",
        product: {
          title: "Blusa de mujer talla M - prueba Sandbox",
          description:
            "Blusa de mujer en excelente estado. Talla M. Listado de prueba en Sandbox.",
          aspects: {
            Brand: ["Unbranded"],
            Size: ["M"],
            Color: ["Blue"],
            Department: ["Women"],
            Type: ["Blouse"]
          },
          imageUrls: [
            "https://i.ebayimg.com/images/g/9~0AAOSwAAAAAAAA/s-l500.jpg"
          ]
        }
      })
    });
    if (res.status === 204 || res.status === 200) {
      return { paso: "2-item", ok: true, sku: SKU };
    }
    const data = await res.json().catch(() => ({}));
    return { paso: "2-item", ok: false, status: res.status, error: data };
  } catch (err) {
    return { paso: "2-item", ok: false, error: String(err) };
  }
}

// Paso 3: crear oferta (SIN publicar)
async function crearOferta(token) {
  try {
    const res = await fetch(`${INVENTORY_API}/offer`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        sku: SKU,
        marketplaceId: MARKETPLACE,
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId: CATEGORY_ID,
        listingDescription:
          "Blusa de mujer en excelente estado. Talla M. Listado de prueba en Sandbox.",
        pricingSummary: {
          price: { value: "19.99", currency: "USD" }
        },
        listingPolicies: {
          paymentPolicyId: POLICY_PAGO,
          returnPolicyId: POLICY_DEVOLUCIONES,
          fulfillmentPolicyId: POLICY_ENVIO_7
        },
        merchantLocationKey: MERCHANT_LOCATION_KEY
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) {
      return { paso: "3-oferta", ok: true, offerId: data.offerId };
    }
    // Si la oferta ya existe para ese SKU, eBay da el offerId en el error.
    const dup = data?.errors?.find((e) => e.errorId === 25002);
    return {
      paso: "3-oferta",
      ok: false,
      status: res.status,
      error: data,
      nota: dup ? "quiza ya existe una oferta para este SKU" : undefined
    };
  } catch (err) {
    return { paso: "3-oferta", ok: false, error: String(err) };
  }
}

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    return res
      .status(400)
      .json({ error: "Falta ?code= en la URL. Haz login OAuth primero." });
  }
  try {
    const token = await getToken(code);
    const pasos = [];
    pasos.push(await crearUbicacion(token));
    pasos.push(await crearItem(token));
    pasos.push(await crearOferta(token));

    const oferta = pasos.find((p) => p.paso === "3-oferta");
    return res.status(200).json({
      resumen: oferta?.ok
        ? `OFERTA CREADA (sin publicar). offerId: ${oferta.offerId}`
        : "Reviso el detalle: algun paso fallo",
      offerId: oferta?.offerId || null,
      pasos
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
