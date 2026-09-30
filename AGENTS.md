# Luminocity Logística

Luminocity vende artefactos lumínicos. Esta app es la operación de logística: cargar pedidos, prepararlos, despacharlos y seguir reclamos.
La rehacemos en este repo para que la use logística y escale con la empresa. Hoy los datos viven en el navegador; el backend es **Pendiente**.

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

Rutas reales: `src/App.tsx`. Menú: `src/layout/Sidebar.tsx`.

## Cómo trabajar

- Un brief a la vez, en `main`.
- Commits en español, en infinitivo, que digan para qué.
- `npm run build` y `npm run lint` tienen que pasar.
- No agregar features fuera del brief. No dejar código muerto.
- No inventar pantallas, datos ni integraciones. Lo que no está en el código es **Pendiente**.
- Auth de servidor, API de pedidos y menú por rol son los briefs 13, 14 y 15. No adelantarlos.

## Roles

Hoy el login guarda `vendedor`, `deposito`, `chofer` o `admin`. Cualquier usuario logueado ve todo el menú. `encargado_deposito` no existe. Matriz: [docs/ROLES.md](docs/ROLES.md).

| Rol | En una línea |
| --- | --- |
| Vendedor | Carga el pedido del cliente y sigue en qué estado está. |
| Depósito | Arma el pedido y lo pasa de pendiente a preparado, con bultos. |
| Encargado de depósito | Supervisa la preparación. **Pendiente**, Brief 15. |
| Chofer | Entrega lo que le toca y confirma la entrega. |
| Admin | Ve y corrige toda la operación, incluidos los datos maestros. |

## Cuándo leer cada doc

| Doc | Leelo cuando |
| --- | --- |
| [docs/ROLES.md](docs/ROLES.md) | El brief toca permisos, menú o qué estado mueve cada rol. |
| [docs/NEGOCIO.md](docs/NEGOCIO.md) | Hay que entender el flujo del pedido, zonas, despacho o reclamos. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Vas a persistir datos, cambiar un modelo o preparar el backend. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Hay que saber qué brief sigue y qué no hay que adelantar. |
| [docs/briefs/_PLANTILLA.md](docs/briefs/_PLANTILLA.md) | Vas a redactar un brief nuevo. |
