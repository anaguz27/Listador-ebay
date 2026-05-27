// api/ebay-auth.js
// Inicia el flujo OAuth de eBay Sandbox.
// Redirige al usuario a la página de consentimiento de eBay.

export default function handler(req, res) {
  const APP_ID = process.env.EBAY_APP_ID;
  const RU_NAME = process.env.EBAY_RU_NAME;

  if (!APP_ID || !RU_NAME) {
    return res.status(500).json({
      error: 'Faltan variables de entorno EBAY_APP_ID o EBAY_RU_NAME en Vercel.'
    });
  }

  // Scopes que necesitamos para crear y publicar listings.
  // Para empezar usamos los mínimos necesarios; podemos añadir más después.
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
  ].join(' ');

  // URL de autorización de eBay SANDBOX
  const authUrl =
    'https://auth.sandbox.ebay.com/oauth2/authorize' +
    '?client_id=' + encodeURIComponent(APP_ID) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(RU_NAME) +
    '&scope=' + encodeURIComponent(scopes);

  // Redirige al usuario a eBay para que dé consentimiento
  res.redirect(302, authUrl);
}
