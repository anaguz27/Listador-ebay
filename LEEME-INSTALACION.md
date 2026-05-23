# 🏷️ Listador eBay — Guía de instalación

Tu app que convierte fotos en listados de eBay optimizados. Sigue estos pasos **una sola vez** y quedará funcionando para siempre en tu iPhone.

Necesitas: tu clave de API de Anthropic (la que ya tienes) y unos 15 minutos.

---

## Por qué esta vez SÍ va a funcionar

Antes fallaba porque la app llamaba a la IA directamente desde el navegador, y Safari bloquea eso. Ahora hay un **servidor intermedio** (la carpeta `api`) que guarda tu clave en secreto y habla con la IA por ti. Safari ya no tiene nada que bloquear. Esa era la pieza que faltaba.

---

## PASO 1 — Crea una cuenta en GitHub (gratis)

1. Entra a **github.com** y crea una cuenta (o inicia sesión si ya tienes).
2. Arriba a la derecha, toca el **+** y luego **New repository**.
3. Ponle un nombre, por ejemplo `listador-ebay`.
4. Déjalo en **Private** si quieres, y toca **Create repository**.

## PASO 2 — Sube los archivos del proyecto

La forma más fácil desde el celular o la computadora:

1. En tu nuevo repositorio, toca **uploading an existing file** (o "Add file" → "Upload files").
2. Sube TODOS los archivos y carpetas de este proyecto, **manteniendo la estructura**:
   - la carpeta `api` (con `generate.js` dentro)
   - la carpeta `public` (con `index.html` dentro)
   - `vercel.json`
   - `package.json`
   - `.gitignore`
3. Toca **Commit changes**.

> Importante: la carpeta `api` debe quedar como `api/generate.js` y la web como `public/index.html`. No las metas dentro de otra carpeta.

## PASO 3 — Conecta con Vercel (gratis)

1. Entra a **vercel.com** y toca **Sign Up** → **Continue with GitHub** (inicia con tu cuenta de GitHub).
2. Ya dentro, toca **Add New…** → **Project**.
3. Busca tu repositorio `listador-ebay` y toca **Import**.

## PASO 4 — Pon tu clave secreta (lo más importante)

Antes de darle a "Deploy", en la misma pantalla:

1. Abre la sección **Environment Variables**.
2. En **Name** escribe exactamente:  `ANTHROPIC_API_KEY`
3. En **Value** pega tu clave de API (empieza con `sk-ant-...`).
4. Toca **Add**.

> Tu clave queda guardada solo en el servidor de Vercel. Nunca aparece en la app ni la puede ver nadie que la use. Por eso es seguro.

## PASO 5 — Despliega

1. Toca **Deploy** y espera 1–2 minutos.
2. Cuando termine, Vercel te da una dirección como `https://listador-ebay.vercel.app`.
3. Ábrela en Safari de tu iPhone.

## PASO 6 — Ponla en tu pantalla de inicio (como una app real)

1. Con la página abierta en Safari, toca el botón **Compartir** (el cuadrito con la flecha ↑).
2. Toca **Añadir a pantalla de inicio**.
3. ¡Listo! Ahora tienes un ícono como cualquier app. La abres, subes fotos y genera el listado.

---

## Cómo se usa

1. Abre la app.
2. Toca **Cámara** o **Galería** y sube las fotos del producto (incluye la etiqueta de marca, la talla y la de composición).
3. Elige el estado y añade notas si quieres.
4. Toca **Generar listado**.
5. Revisa, edita lo que quieras, y toca **Copiar todo** para pegarlo en eBay.

## Costo

Cada listado cuesta unos 2–5 centavos de dólar de tu cuenta de API. Sin suscripción: pagas solo lo que uses.

## Si algo falla

- **"Falta la clave"**: revisa que en Vercel la variable se llame exactamente `ANTHROPIC_API_KEY` (Settings → Environment Variables) y vuelve a desplegar (Deployments → … → Redeploy).
- **Error 401**: tu clave es incorrecta o no tiene saldo. Revisa en console.anthropic.com.
- **"Formato inesperado"**: pulsa Generar otra vez; casi siempre entra al segundo intento.
