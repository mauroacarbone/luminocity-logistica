# Luminocity Logística

App interna para cargar pedidos, prepararlos, despacharlos y seguir reclamos de post venta. Los pedidos se guardan en el backend de `server/` (`server/data/orders.json`, fuera de git). El login y el registro también pasan por ese backend. Los datos maestros siguen en el navegador.

## Acceso

El panel pide sesión. Sin login, cualquier ruta de la app vuelve a `/login`. `/login` y `/registro` son públicas.

Si `server/data/users.json` no existe, al arrancar el backend se crea un usuario demo:

- Email: `mauro@luminocity.local`
- Contraseña: `demo1234`
- Rol: Admin

También se puede crear una cuenta (nombre, email, contraseña y rol: vendedor, depósito, encargado de depósito, chofer o admin). Los usuarios quedan en `server/data/users.json`, con la contraseña hasheada con bcrypt. El navegador guarda solo el token.

## Cómo levantarlo

En la raíz:

```
npm install
npm run dev
```

En `server/`:

```
npm install
cp .env.example .env
npm run dev
```

La app queda en el puerto de Vite y proxea `/api` a `http://localhost:3001`. En `server/`, `npm start` levanta la API sin recargar al cambiar archivos.

## Scripts de la app

- `npm run dev` — Vite
- `npm run build` — compilación
- `npm run lint` — ESLint
- `npm run preview` — vista de la build
