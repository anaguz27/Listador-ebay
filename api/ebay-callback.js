export default async function handler(req, res) {
  const id = process.env.EBAY_APP_ID, cert = process.env.EBAY_CERT_ID, ru = process.env.EBAY_RU_NAME;
  const code = req.query.code;
  if (!code) return res.status(400).send("Falta code");
  const auth = Buffer.from(id + ":" + cert).toString("base64");
  const r = await fetch("https://api.sandbox.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + auth },
    body: "grant_type=authorization_code&code=" + encodeURIComponent(code) + "&redirect_uri=" + encodeURIComponent(ru)
  });
  const data = await r.json();
  res.setHeader("Content-Type", "text/plain");
  res.status(r.ok ? 200 : 400).send(JSON.stringify(data, null, 2));
}
