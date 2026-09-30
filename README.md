# Luminocity Logística

App interna para cargar pedidos, prepararlos, despacharlos y seguir reclamos de post venta. Los datos viven en el navegador (localStorage) hasta que haya backend.

## Acceso

El panel pide sesión. Sin login, cualquier ruta de la app vuelve a `/login`. `/login` y `/registro` son públicas.

La primera vez se crea un usuario demo:

- Email: `mauro@luminocity.local`
- Contraseña: `demo1234`
- Rol: Vendedor

También se puede crear una cuenta (nombre, email, contraseña y rol: vendedor, depósito, chofer o admin). Los usuarios quedan en `luminocity.users.v1` y la sesión en `luminocity.session.v1`.

La contraseña no se guarda en texto plano: es un SHA-256 con salt por usuario, calculado en el navegador. El Brief 13 lo reemplaza por bcrypt en el servidor.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — compilación
- `npm run lint` — ESLint
- `npm run preview` — vista de la build

## Documentación

- [AGENTS.md](AGENTS.md) — qué es la app y cómo trabajar en el repo
- [docs/ROLES.md](docs/ROLES.md) — qué ve y qué puede cambiar cada rol
- [docs/NEGOCIO.md](docs/NEGOCIO.md) — ciclo del pedido, despacho, zonas y reclamos
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — contextos, localStorage y modelos
- [docs/ROADMAP.md](docs/ROADMAP.md) — briefs hechos y los que siguen
- [docs/briefs/_PLANTILLA.md](docs/briefs/_PLANTILLA.md) — formato de un brief nuevo
