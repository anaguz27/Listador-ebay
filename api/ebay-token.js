// api/ebay-token.js  — Fase 4, Paso A: obtener el REFRESH TOKEN (dura 18 meses)
// Recibe ?code= fresco, lo intercambia, y MUESTRA el refresh_token para
// que lo copies y lo guardes en Vercel como variable EBAY_REFRESH_TOKEN.
// Uso: login OAuth, copiar ?code= y pegarlo en:
//   /api/ebay-token?code=EL_CODIGO   (dentro de 5 min)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({
      error: "Falta ?code= en la URL. Haz login OAuth primero en /api/ebay-auth."
    });
  }

  try {
    const creds = Buffer.from(
      `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.EBAY_RU_NAME
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
    if (!r.ok) {
      return res.status(r.status).json({ error: "No se pudo obtener el token", detalle: data });
    }

    return res.status(200).json({
      MENSAJE: "COPIA el valor de refresh_token y guardalo en Vercel como variable EBAY_REFRESH_TOKEN",
      refresh_token: data.refresh_token,
      refresh_token_expira_en_segundos: data.refresh_token_expires_in,
      nota_access: "El access_token dura poco (2h) y se renueva solo; NO necesitas guardarlo."
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
