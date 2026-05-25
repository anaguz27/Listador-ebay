// api/generate.js
// Función serverless de Vercel. Guarda tu clave en secreto y habla con la IA.
// El frontend (public/index.html) le manda las fotos y este servidor responde con el listado.

export default async function handler(req, res) {
  // Permitir solo POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta la clave ANTHROPIC_API_KEY en Vercel." });
    return;
  }

  try {
    const { images, systemPrompt } = req.body;

    if (!images || images.length === 0) {
      res.status(400).json({ error: "No se recibieron imágenes." });
      return;
    }

    // Construir el contenido: todas las imágenes + la instrucción final
    const content = [
      ...images.map((im) => ({
        type: "image",
        source: { type: "base64", media_type: im.mediaType, data: im.base64 },
      })),
      {
        type: "text",
        text: "Analiza estas fotos y genera el listado en JSON según las instrucciones. Recuerda: no inventes ningún dato.",
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // modelo actual (mayo 2026)
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      res.status(500).json({ error: data.error.message || "Error de la IA." });
      return;
    }

    const text = (data.content || [])
      .map((i) => (i.type === "text" ? i.text : ""))
      .join("\n");

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: "Error en el servidor: " + err.message });
  }
}
