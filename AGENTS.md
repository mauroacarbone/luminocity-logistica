# Luminocity Logística

Luminocity vende artefactos lumínicos. Esta app es la operación de logística: cargar pedidos, prepararlos, despacharlos y seguir reclamos.
Los datos viven en el navegador hasta que haya backend. Qué brief está hecho y cuál sigue: `HISTORY.md`.

## Stack y carpetas

React 19, Vite, TypeScript, React Router. Estilos en `src/index.css` (Tailwind 4).

| Carpeta | Qué hay |
| --- | --- |
| `src/pages/` | Una pantalla por ruta |
| `src/state/` | Contextos: auth, pedidos, picking, reclamos, catálogo |
| `src/lib/` | Persistencia, hash, zona, geocodificación, rutas, adjuntos, Excel de picking |
| `src/data/` | Tipos y semillas: pedido, reclamo, catálogo |
| `src/layout/` | Sidebar, shell y tarjeta de login |
| `src/components/` | Diálogos de QR, carátula y link del adjunto |

Rutas: `src/App.tsx`. Menú: `src/layout/Sidebar.tsx`.

## Cómo trabajar

- Un brief a la vez, en `main`.
- No agregar features fuera del brief. No dejar código muerto.
- No inventar pantallas, datos ni integraciones. Lo que no está en el código es **Pendiente**.
- No adelantar los briefs 13 (Express + JWT), 14 (API de pedidos) ni 15 (menú por rol).
- El login guarda `vendedor`, `deposito`, `chofer` o `admin`. Cualquier usuario logueado ve todo el menú. `encargado_deposito` no existe.

## Commits

- Mensaje en español, en infinitivo, una línea que diga para qué.
- Sin `Co-authored-by` ni otros trailers.
- En `main`.
- Antes de commitear código, `npm run build` y `npm run lint` tienen que pasar.
- No commitear `.env` ni secretos.
- No hacer push salvo que el brief lo pida.
