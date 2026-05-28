export default async function handler(req, res) {
  const APP_ID = process.env.EBAY_APP_ID;
  const CERT_ID = process.env.EBAY_CERT_ID;
  const RU_NAME = process.env.EBAY_RU_NAME;

  if (!APP_ID || !CERT_ID || !RU_NAME) {
    return res.status(500).send('Faltan variables EBAY_APP_ID, EBAY_CERT_ID o EBAY_RU_NAME en Vercel.');
  }

  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send('<h1>Error de eBay</h1><p><strong>' + error + '</strong></p><p>' + (error_description || '') + '</p><a href="/">Volver a Listador eBay</a>');
  }

  if (!code) {
    return res.status(400).send('<h1>Falta el parametro code</h1><p>eBay no envio el codigo de autorizacion.</p><a href="/">Volver a Listador eBay</a>');
  }

  try {
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
      return res.status(tokenResponse.status).send('<h1>Error al intercambiar el codigo</h1><pre>' + JSON.stringify(tokenData, null, 2) + '</pre><a href="/">Volver a Listador eBay</a>');
    }

    const accessToken = JSON.stringify(tokenData.access_token || '');
    const refreshToken = JSON.stringify(tokenData.refresh_token || '');
    const expiresIn = tokenData.expires_in || 7200;

    const html = '<!DOCTYPE html>\n' +
      '<html lang="es">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <title>Conectado con eBay</title>\n' +
      '  <style>\n' +
      '    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; text-align: center; }\n' +
      '    h1 { color: #2d8f4e; }\n' +
      '    .info { color: #666; font-size: 14px; margin: 20px 0; }\n' +
      '    .btn { display
