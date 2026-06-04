// api/ebay-crear-ubicacion.js
// Crea (una sola vez) la ubicacion de inventario "merchant location" en eBay PRODUCCION.
// Sin esta ubicacion, createOffer falla con: "Location information not found" (error 25002).
//
// COMO USARLO:
//   1. Sube este archivo a la carpeta /api de tu repo.
//   2. Espera a que Vercel termine el deploy (1-2 min).
//   3. Abre en el navegador:  listador-ebay.vercel.app/api/ebay-crear-ubicacion
//   4. Debe decir "OK ubicacion creada" (o "ya existia", que tambien esta bien).

const LOCATION_KEY = "ubicacion-principal"; // <-- coincide con MERCHANT_LOCATION en ebay-draft.js

export default async function handler(req, res) {
  try {
    const appId   = process.env.EBAY_APP_ID;
    const certId  = process.env.EBAY_CERT_ID;
    const refresh = process.env.EBAY_REFRESH_TOKEN;

    // --- 1. Sacar un access token fresco con el refresh token ---
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
      return res.status(400).send(
        "<h2>Error sacando token</h2><pre>" +
        JSON.stringify(tokenData, null, 2) + "</pre>"
      );
    }
    const accessToken = tokenData.access_token;

    // --- 2. Crear la ubicacion de inventario ---
    const locationBody = {
      location: {
        address: {
          addressLine1: "1819 Ramar Rd",
          city: "Bullhead City",
          stateOrProvince: "AZ",
          postalCode: "86442",
          country: "US",
        },
      },
      locationInstructions: "Articulos enviados desde aqui.",
      name: "Bullhead City Storage",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
    };

    const createResp = await fetch(
      "https://api.ebay.com/sell/inventory/v1/location/" + LOCATION_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken,
          "Content-Language": "en-US",
        },
        body: JSON.stringify(locationBody),
      }
    );

    // eBay responde 204 (sin contenido) cuando la crea bien.
    if (createResp.status === 204) {
      return res.status(200).send(
        "<h2>OK ubicacion creada</h2>" +
        "<p>Clave (merchantLocationKey): <b>" + LOCATION_KEY + "</b></p>" +
        "<p>Ya puedes volver a probar 'Guardar en borrador'.</p>"
      );
    }

    const txt = await createResp.text();

    // Si ya existia, eBay manda un error de duplicado: eso tambien sirve.
    if (createResp.status === 409 || txt.includes("25801") || txt.toLowerCase().includes("already")) {
      return res.status(200).send(
        "<h2>La ubicacion ya existia (esta bien)</h2>" +
        "<p>Clave: <b>" + LOCATION_KEY + "</b></p>" +
        "<pre>" + txt + "</pre>"
      );
    }

    // Cualquier otro caso: mostrar el detalle para diagnosticar.
    return res.status(400).send(
      "<h2>Respuesta de eBay (status " + createResp.status + ")</h2><pre>" +
      txt + "</pre>"
    );
  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
}