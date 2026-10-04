# Luminocity Logística

App interna para cargar pedidos, prepararlos, despacharlos y seguir reclamos de post venta. Los pedidos, los usuarios, las autorizaciones, los avisos y la ubicación del chofer se guardan en el backend de `server/`. Sin `DATABASE_URL` van a archivos JSON en `server/data/` (fuera de git). Con `DATABASE_URL` van a Postgres. El login y el registro también pasan por ese backend. Los datos maestros siguen en el navegador.

## Acceso

El panel pide sesión. Sin login, cualquier ruta de la app vuelve a `/login`. `/login` y `/registro` son públicas.

Si no hay `DATABASE_URL` y `server/data/users.json` no existe, al arrancar el backend se crea un usuario demo:

- Email: `mauro@luminocity.local`
- Contraseña: `demo1234`
- Rol: Admin

También se puede crear una cuenta (nombre, email, contraseña y rol: vendedor, depósito, encargado de depósito, chofer o admin). La contraseña se hashea con bcrypt. El navegador guarda solo el token.

Ese usuario demo no se crea si hay `DATABASE_URL`, ni en producción. Ahí el primer admin se carga con `npm run create-admin` (ver Deploy).

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

Cambiá `JWT_SECRET` en `server/.env`. El valor de `.env.example` es solo un ejemplo y no hay que dejarlo. Si vas a usar Postgres, agregá `DATABASE_URL` (en Neon, con `sslmode=require`). Sin esa variable el server sigue con los JSON. Generá el secreto con:

```
openssl rand -hex 32
```

La app queda en el puerto de Vite y proxea `/api` a `http://localhost:3001`. En `server/`, `npm start` levanta la API sin recargar al cambiar archivos.

## Scripts de la app

- `npm run dev` — Vite
- `npm run build` — compilación
- `npm run lint` — ESLint
- `npm run preview` — vista de la build

En `server/`:

- `npm run dev` — API con recarga
- `npm start` — API
- `npm run migrate:json` — copia los JSON de `server/data` a Postgres (hace falta `DATABASE_URL`)
- `npm run create-admin` — crea el primer admin en Postgres

## Deploy

Un solo servicio de Render sirve el build del front y la API (`/api`) por HTTPS. La base es Neon.

1. Creá un proyecto en [Neon](https://neon.tech) y copiá la connection string. Tiene que incluir ssl (`sslmode=require`).
2. En Render, creá el servicio desde este repo con el blueprint `render.yaml` (New → Blueprint). Es un Web Service de Node, plan free, región Ohio. El build instala y compila el front y el server; el start levanta `server/`.
3. Cargá a mano `DATABASE_URL` y `JWT_SECRET`. No van en el repo. `JWT_SECRET` sale de `openssl rand -hex 32`. `NODE_ENV=production` ya está en el blueprint.
4. Si en producción falta `DATABASE_URL` o `JWT_SECRET`, el server no arranca.
5. Los JSON no se suben a git. Para pasar los datos actuales, en una máquina que tenga `server/data` y la connection string:

```
cd server
DATABASE_URL='postgresql://...?...sslmode=require' npm run migrate:json
```

Se puede correr dos veces: hace upsert por id y al final imprime cuántos registros cargó por tabla. No borra filas que solo estén en la base. Si el JSON tiene el usuario demo (`mauro@luminocity.local` / `demo1234`), no lo migres a producción.

Si la base está vacía, creá el admin (en el shell de Render o en local, con `DATABASE_URL`):

```
cd server
ADMIN_EMAIL=tu@email.com ADMIN_PASSWORD='una-clave-larga' ADMIN_NAME='Tu nombre' npm run create-admin
```

Sin esas variables, el script las pide en la terminal. No uses `demo1234`.

6. Abrí `https://<tu-servicio>.onrender.com/api/health`. Tiene que responder 200. Después entrá a la raíz y logueate con el admin.

El plan gratis de Render se duerme tras unos 15 minutos sin uso y tarda cerca de un minuto en despertar.
