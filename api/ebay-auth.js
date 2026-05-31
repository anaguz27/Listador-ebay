export default async function handler(req, res) {
  const appId = process.env.EBAY_APP_ID;
  const ruName = process.env.EBAY_RU_NAME;

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
  ].join(' ');

  const authUrl = 'https://auth.ebay.com/oauth2/authorize'
    + '?client_id=' + encodeURIComponent(appId)
    + '&response_type=code'
    + '&redirect_uri=' + encodeURIComponent(ruName)
    + '&scope=' + encodeURIComponent(scopes);

  res.writeHead(302, { Location: authUrl });
  res.end();
}