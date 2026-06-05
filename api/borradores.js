// api/borradores.js
// Maneja los borradores de Listador eBay guardados en Upstash Redis.

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const PREFIX = "borrador:";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }

  try {
    const body = req.body || {};
    const accion = body.accion;

    if (accion === "guardar") {
      const borrador = body.borrador || {};
      const id = borrador.id || String(Date.now());
      const dato = {
        id,
        titulo: borrador.titulo || "Sin título",
        contenido: borrador.contenido || "",
        creado: borrador.creado || Date.now(),
        actualizado: Date.now(),
      };
      await redis.set(PREFIX + id, JSON.stringify(dato));
      return res.status(200).json({ ok: true, id, borrador: dato });
    }

    if (accion === "listar") {
      const claves = [];
      let cursor = 0;
      do {
        const resultado = await redis.scan(cursor, {
          match: PREFIX + "*",
          count: 100,
        });
        cursor = Number(resultado[0]);
        claves.push(...resultado[1]);
      } while (cursor !== 0);

      if (claves.length === 0) {
        return res.status(200).json({ ok: true, borradores: [] });
      }

      const valores = await redis.mget(...claves);
      const borradores = valores
        .filter(Boolean)
        .map((v) => (typeof v === "string" ? JSON.parse(v) : v))
        .sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));

      return res.status(200).json({ ok: true, borradores });
    }

    if (accion === "leer") {
      const id = body.id;
      if (!id) return res.status(400).json({ error: "Falta id" });
      const v = await redis.get(PREFIX + id);
      if (!v) return res.status(404).json({ error: "No existe" });
      const borrador = typeof v === "string" ? JSON.parse(v) : v;
      return res.status(200).json({ ok: true, borrador });
    }

    if (accion === "borrar") {
      const id = body.id;
      if (!id) return res.status(400).json({ error: "Falta id" });
      await redis.del(PREFIX + id);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(400).json({ error: "Acción no válida: " + accion });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}