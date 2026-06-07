// api/ebay-subir-fotos.js
// Sube fotos a eBay (EPS) UNA sola vez y devuelve sus URLs públicas.
// Se usa al GUARDAR un borrador "publicable": así el borrador guarda solo
// URLs cortas (no base64 pesado) y publicar luego es instantáneo.
// Reutiliza exactamente la misma lógica de subida que ebay-draft.js (probada).

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60
};

const EBAY_OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";
const MEDIA_API = "https://apim.ebay.com/commerce/media/v1_beta";
const MAX_FOTOS = 24;

async function getAccessToken() {
  const refresh = process.env.EBAY_REFRESH_TOKEN;
  if (!refresh) throw new Error("Falta EBAY_REFRESH_TOKEN en Vercel");
  const creds = Buffer.from(
    `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
  ).toString("base64");
  const scopes = [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment"
  ].join(" ");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: scopes
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
  if (!r.ok) throw new Error("No se pudo renovar token: " + JSON.stringify(data));
  return data.access_token;
}

async function subirFoto(token, base64, mediaType) {
  try {
    const bin = Buffer.from(base64, "base64");
    const blob = new Blob([bin], { type: mediaType || "image/jpeg" });
    const form = new FormData();
    form.append("image", blob, "foto.jpg");

    const r = await fetch(`${MEDIA_API}/image/create_image_from_file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form
    });

    if (r.status !== 201) {
      const txt = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: txt.slice(0, 400) };
    }

    const loc = r.headers.get("location") || "";
    const imageId = loc.split("/image/")[1] || loc.split("/").pop();
    if (!imageId) return { ok: false, error: "No se obtuvo image_id" };

    const g = await fetch(`${MEDIA_API}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    const gd = await g.json().catch(() => ({}));
    const url =
      gd?.imageUrl ||
      (Array.isArray(gd?.imageUrls) ? (gd.imageUrls[0]?.imageUrl || gd.imageUrls[0]) : null) ||
      gd?.image?.imageUrl ||
      null;

    if (!url) return { ok: false, status: g.status, error: "getImage sin URL: " + JSON.stringify(gd).slice(0, 300) };
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: "excepcion: " + String(err) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pasos = [];
  try {
    const { images } = req.body || {};
    if (!images || !images.length) return res.status(400).json({ error: "Faltan fotos" });

    const token = await getAccessToken();
    pasos.push({ paso: "0-token", ok: true });

    const aSubir = images.slice(0, MAX_FOTOS);
    const resultados = await Promise.all(
      aSubir.map((img) => subirFoto(token, img.data, img.mediaType))
    );

    const urls = [];
    const erroresFoto = [];
    resultados.forEach((r, i) => {
      pasos.push({ paso: `foto-${i + 1}`, ok: r.ok, status: r.status, error: r.error });
      if (r.ok && r.url) urls.push(r.url);
      else erroresFoto.push(`foto ${i + 1}: [${r.status}] ${r.error}`);
    });

    if (!urls.length) {
      return res.status(502).json({
        error: "No se pudo subir ninguna foto a eBay",
        errorDetalle: erroresFoto.join(" || "),
        pasos
      });
    }

    return res.status(200).json({ ok: true, imageUrls: urls, fotos: urls.length, pasos });
  } catch (err) {
    return res.status(500).json({ error: String(err), pasos });
  }
}
