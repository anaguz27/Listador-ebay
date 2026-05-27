// api/ebay-callback.js
// eBay redirige aquí después de que el usuario da consentimiento.
// Recibe el "code" en la URL y lo intercambia por access_token + refresh_token.

export default async function handler(req, res) {
  const APP_ID = process.env.EBAY_APP_ID;
  const CERT_ID = process.env.EBAY_CERT_ID;
  const RU_NAME = process.env.EBAY_RU_NAME;

  if (!APP_ID || !CERT_ID || !RU_NAME) {
    return res.status(500).send(
      'Faltan variables de entorno: EBAY_APP_ID, EBAY_CERT_ID o EBAY_RU_NAME en Vercel.'
    );
  }

  const { code, error, error_description } = req.query;

  // Si eBay devolvió un error en el redirect
  if (error) {
    return res.status(400).send(
      '<h1>Error de eBay</h1>' +
      '<p><strong>' + error + '</strong></p>' +
      '<p>' + (error_description || '') + '</p>' +
      '<a href="/">Volver a Listador eBay</a>'
    );
  }

  if (!code) {
    return res.status(400).send(
      '<h1>Falta el parámetro "code"</h1>' +
      '<p>eBay no envió el código de autorización.</p>' +
      '<a href="/">Volver a Listador eBay</a>'
    );
  }

  try {
    // Intercambiar el code por access_token + refresh_token
    const credentials = Buffer.from(APP_ID + ':' + CERT_ID).toString('base64');

    const tokenResponse = await fetch('https://api.sandbox.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + credentials
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: RU_NAME
      }).toString()
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).send(
        '<h1>Error al intercambiar el código</h1>' +
        '<pre>' + JSON.stringify(tokenData, null, 2) + '</pre>' +
        '<a href="/">Volver a Listador eBay</a>'
      );
    }

    // ¡Éxito! Devolvemos los tokens en un HTML que los guarda en localStorage
    // y luego redirige al usuario a la app principal.
    // (En producción usaríamos almacenamiento seguro, pero para Sandbox esto sirve.)
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Conectado con eBay ✓</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 600px;
      margin: 60px auto;
      padding: 20px;
      text-align: center;
    }
    h1 { color: #2d8f4e; }
    .info { color: #666; font-size: 14px; margin: 20px 0; }
    .btn {
      display: inline-block;
      background: #0654ba;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>✓ Conectado con eBay Sandbox</h1>
  <p class="info">Tu cuenta de eBay está vinculada. Ya puedes regresar a la app.</p>
  <a href="/" class="btn">Volver a Listador eBay</a>

  <script>
    // Guardamos los tokens en localStorage para que la app los pueda usar
    try {
      localStorage.setItem('ebay_access_token', ${JSON.stringify(tokenData.access_token || '')});
      localStorage.setItem('ebay_refresh_token', ${JSON.stringify(tokenData.refresh_token || '')});
      localStorage.setItem('ebay_token_expires_at', String(Date.now() + (${tokenData.expires_in || 7200} * 1000)));
      localStorage.setItem('ebay_env', 'sandbox');
    } catch (e) {
      console.error('No se pudo guardar el token:', e);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (err) {
    return res.status(500).send(
      '<h1>Error inesperado</h1>' +
      '<pre>' + (err.message || String(err)) + '</pre>' +
      '<a href="/">Volver a Listador eBay</a>'
    );
  }
}
