// api/ebay-setup.js
// Fase 2 — crea las 6 politicas de cumplimiento en eBay Sandbox de una sola vez.
// Uso: hacer login OAuth, copiar el ?code= de la URL de retorno y pegarlo en:
//   /api/ebay-setup?code=EL_CODIGO   (dentro de los 5 minutos)

const EBAY_OAUTH = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const ACCOUNT_API = "https://api.sandbox.ebay.com/sell/account/v1";

const MARKETPLACE = "EBAY_US";
const CATEGORY = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];

// Politica de envio reutilizable: solo cambia nombre y precio
function shippingPolicy(name, price) {
  return {
    name,
    marketplaceId: MARKETPLACE,
    categoryTypes: CATEGORY,
    handlingTime: { unit: "DAY", value: 1 },
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType: "FLAT_RATE",
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: "USPS",
            shippingServiceCode: "USPSPriority",
            shippingCost: { currency: "USD", value: price },
            freeShipping: false,
            buyerResponsibleForShipping: false
          }
        ]
      }
    ]
  };
}

const PAYMENT_POLICY = {
  name: "Pago inmediato",
  marketplaceId: MARKETPLACE,
  categoryTypes: CATEGORY,
  immediatePay: true
};

const RETURN_POLICY = {
  name: "Devoluciones 30 dias",
  marketplaceId: MARKETPLACE,
  categoryTypes: CATEGORY,
  returnsAccepted: true,
  returnPeriod: { unit: "DAY", value: 30 },
  returnShippingCostPayer: "BUYER",
  returnMethod: "MONEY_BACK"
};

const SHIPPING_POLICIES = [
  shippingPolicy("Envio 6.50 - blusas tops delgados", "6.50"),
  shippingPolicy("Envio 7.00 - blusas normales", "7.00"),
  shippingPolicy("Envio 8.99 - sueteres y vestidos delgados", "8.99"),
  shippingPolicy("Envio 9.98 - pantalones y vestidos pesados", "9.98")
];

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
  if (!res.ok) {
    throw new Error(`Token error: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function createPolicy(endpoint, token, payload, label) {
  try {
    const res = await fetch(`${ACCOUNT_API}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Language": "en-US"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      return { label, ok: false, status: res.status, error: data };
    }

    const id =
      data.fulfillmentPolicyId ||
      data.paymentPolicyId ||
      data.returnPolicyId ||
      null;

    return { label, ok: true, id, name: payload.name };
  } catch (err) {
    return { label, ok: false, error: String(err) };
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

    const results = [];
    results.push(
      await createPolicy("payment_policy", token, PAYMENT_POLICY, "pago")
    );
    results.push(
      await createPolicy("return_policy", token, RETURN_POLICY, "devoluciones")
    );
    for (const sp of SHIPPING_POLICIES) {
      results.push(
        await createPolicy("fulfillment_policy", token, sp, `envio ${sp.name}`)
      );
    }

    const ids = results
      .filter((r) => r.ok)
      .map((r) => ({ label: r.label, id: r.id, name: r.name }));

    return res.status(200).json({
      resumen: `${ids.length} de ${results.length} politicas creadas`,
      idsParaGuardar: ids,
      detalleCompleto: results
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
