// api/ebay-publish-test.js  — Fase 3, publicar la oferta de prueba
// Publica el offerId creado en el paso anterior (publishOffer).
// Aqui eBay valida TODO; si falta algun item specific, el log lo dira.
// Uso: login OAuth, copiar ?code= fresco y pegarlo en:
//   /api/ebay-publish-test?code=EL_CODIGO   (dentro de 5 min)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const INVENTORY_API = "https://api.sandbox.ebay.com/sell/inventory/v1";

// offerId creado en la Fase 3 (paso anterior)
const OFFER_ID = "11115828010";

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

async function publicar(token) {
  try {
    const res = await fetch(
      `${INVENTORY_API}/offer/${OFFER_ID}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Language": "en-US"
        }
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) {
      return { ok: true, listingId: data.listingId, respuesta: data };
    }
    return { ok: false, status: res.status, error: data };
  } catch (err) {
    return { ok: false, error: String(err) };
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
    const resultado = await publicar(token);
    return res.status(200).json({
      resumen: resultado.ok
        ? `LISTADO PUBLICADO. listingId: ${resultado.listingId}`
        : "La publicacion fallo: revisa el detalle (probablemente item specifics)",
      offerId: OFFER_ID,
      resultado
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
