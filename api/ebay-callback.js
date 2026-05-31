export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) {
    res.status(400).send('Falta el code en la URL');
    return;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const ruName = process.env.EBAY_RU_NAME;

  const credentials = Buffer.from(appId + ':' + certId).toString('base64');

  try {
    const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + credentials
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: decodeURIComponent(code),
        redirect_uri: ruName
      })
    });

    const data = await resp.json();

    if (data.refresh_token) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(
        '<h2>OK Refresh token de PRODUCCION</h2>' +
        '<p>Copialo y guardalo en Vercel como <b>EBAY_REFRESH_TOKEN</b>:</p>' +
        '<textarea style="width:100%;height:120px;font-size:14px">' +
        data.refresh_token + '</textarea>' +
        '<p>Expira en: ' + (data.refresh_token_expires_in / 86400).toFixed(0) + ' dias</p>'
      );
    } else {
      res.status(400).send('<h2>Error</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>');
    }
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
}