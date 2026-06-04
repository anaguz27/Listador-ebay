// api/ver-inventario.js
// Diagnostico: muestra que inventory items y ofertas existen en tu cuenta de eBay PRODUCCION.
// USO:  listador-ebay.vercel.app/api/ver-inventario

export default async function handler(req, res) {
  try {
    const appId   = process.env.EBAY_APP_ID;
    const certId  = process.env.EBAY_CERT_ID;
    const refresh = process.env.EBAY_REFRESH_TOKEN;

    // 1. Access token
    const creds = Buffer.from(appId + ":" + certId).toString("base64");
    const tokenResp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + creds,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(400).send("<h2>Error token</h2><pre>" + JSON.stringify(tokenData, null, 2) + "</pre>");
    }
    const token = tokenData.access_token;
    const headers = {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
    };

    // 2. Listar inventory items
    const invResp = await fetch(
      "https://api.ebay.com/sell/inventory/v1/inventory_item?limit=20",
      { headers }
    );
    const invData = await invResp.json();

    // 3. Listar ofertas (offers)
    const offersResp = await fetch(
      "https://api.ebay.com/sell/inventory/v1/offer?limit=20",
      { headers }
    );
    const offersData = await offersResp.json();

    // 4. Armar resumen legible
    let html = "<h2>Diagnostico de inventario eBay</h2>";

    html += "<h3>Inventory Items (" + (invData.total || 0) + ")</h3>";
    if (invData.inventoryItems && invData.inventoryItems.length) {
      html += "<ul>";
      for (const it of invData.inventoryItems) {
        const titulo = (it.product && it.product.title) ? it.product.title : "(sin titulo)";
        html += "<li><b>SKU:</b> " + it.sku + " &mdash; " + titulo + "</li>";
      }
      html += "</ul>";
    } else {
      html += "<p>No hay inventory items.</p>";
    }

    html += "<h3>Ofertas / Offers (" + (offersData.total || 0) + ")</h3>";
    if (offersData.offers && offersData.offers.length) {
      html += "<ul>";
      for (const of of offersData.offers) {
        html += "<li><b>SKU:</b> " + of.sku +
                " | <b>offerId:</b> " + of.offerId +
                " | <b>status:</b> " + of.status +
                " | <b>listingId:</b> " + (of.listing && of.listing.listingId ? of.listing.listingId : "(ninguno)") +
                "</li>";
      }
      html += "</ul>";
    } else {
      html += "<p>No hay ofertas.</p>";
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
}