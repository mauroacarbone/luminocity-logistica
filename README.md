# Luminocity Logística

Luminocity Logística es la app interna que sigue cada pedido desde que el vendedor lo carga hasta que se entrega o se retira, y los reclamos de post venta hasta que el producto vuelve reparado. La usan vendedores, depósito, el encargado, los choferes, el técnico, gerencia y el administrador. Se abre desde el navegador o el celular.

## Qué hace cada rol

- Vendedor: carga pedidos y reclamos, y sigue los suyos.
- Depósito: prepara pedidos en Mi preparación, atiende retiros y recibe productos en post venta.
- Encargado de depósito: panel operativo, despacho, rutas, usuarios, tarifas y reportes. Da de alta usuarios, modifica las tarifas de viaje y ve Reportes; no ve ni modifica al administrador.
- Chofer: sus entregas y viajes.
- Técnico: Mi taller. Levanta reparaciones, presupuesta y avisa al cliente.
- Gerencia: solo Reportes.
- Admin: todo, más Datos maestros.

App interna para cargar pedidos, prepararlos, despacharlos y seguir reclamos de post venta. Los pedidos, los usuarios, las autorizaciones, los avisos, la ubicación del chofer y los datos maestros se guardan en el backend de `server/`. Sin `DATABASE_URL` van a archivos JSON en `server/data/` (fuera de git). Con `DATABASE_URL` van a Postgres. El login y el registro también pasan por ese backend.

## Acceso

El panel pide sesión. Sin login, cualquier ruta de la app vuelve a `/login`. `/login` y `/registro` son públicas.

Si no hay `DATABASE_URL` y `server/data/users.json` no existe, al arrancar el backend se crea un usuario demo:

- Email: `mauro@luminocity.local`
- Contraseña: `demo1234`
- Rol: Admin

En desarrollo, `/registro` crea un vendedor. El admin da de alta y administra las cuentas desde Usuarios: nombre, email, contraseña inicial (10 a 72 caracteres) y rol (vendedor, depósito, encargado de depósito, chofer, técnico, gerencia o admin). Si el rol es vendedor o chofer, también puede vincular el vendedor o el transportista. El encargado entra a la misma pantalla: ve a todos y puede crear y modificar, pero no toca a un admin ni asigna ese rol. Puede activar o desactivar cuentas, editar nombre y email, y resetear la contraseña. Un usuario inactivo no puede entrar. Nadie se desactiva a sí mismo y tiene que quedar al menos un admin activo. La contraseña se hashea con bcrypt. El navegador guarda solo el token.

`/api/users` (admin y encargado; el resto recibe 403):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/users` | Lista las cuentas |
| POST | `/api/users` | Alta |
| PATCH | `/api/users/:id` | Nombre, email, celular, vendedor o transportista |
| PATCH | `/api/users/:id/role` | Rol |
| PATCH | `/api/users/:id/active` | Activo o inactivo |
| PATCH | `/api/users/:id/password` | Contraseña nueva, de 10 a 72 caracteres |

Ese usuario demo no se crea si hay `DATABASE_URL`, ni en producción. `npm run create-admin` queda solo para crear el primer admin (ver Deploy).

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

Cambiá `JWT_SECRET` en `server/.env`. El valor de `.env.example` es solo un ejemplo y no hay que dejarlo. En producción tiene que tener 32 caracteres o más. Si vas a usar Postgres, agregá `DATABASE_URL` (en Neon, con `sslmode=require` y el host `-pooler`). Sin esa variable el server sigue con los JSON. En PowerShell:

```powershell
$env:JWT_SECRET = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
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
- `npm run create-admin` — crea el primer admin en Postgres. El resto de las cuentas las da de alta el admin desde Usuarios

## Deploy

Un solo servicio de Render sirve el build del front y la API (`/api`) por HTTPS. La base es Neon.

1. Creá un proyecto en [Neon](https://neon.tech) y copiá la connection string. Tiene que incluir ssl (`sslmode=require`).
2. En Render, creá el servicio desde este repo con el blueprint `render.yaml` (New → Blueprint). Es un Web Service de Node, plan free, región Ohio. El build instala y compila el front y el server; el start levanta `server/`.
3. Cargá a mano `DATABASE_URL` y `JWT_SECRET`. No van en el repo. `NODE_ENV=production` ya está en el blueprint. El secreto tiene que tener 32 caracteres o más. En PowerShell:

```powershell
$env:JWT_SECRET = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

4. Si en producción falta `DATABASE_URL` o `JWT_SECRET`, o el secreto tiene menos de 32 caracteres, el server no arranca.
5. El plan gratis de Render no tiene shell. `migrate:json` y `create-admin` se corren en tu PC, con la connection string de Neon. Usá el host que termina en `-pooler`. En PowerShell, desde `server/`:

```powershell
$env:DATABASE_URL = 'postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require'
npm run migrate:json
$env:ADMIN_EMAIL = 'tu@email.com'
$env:ADMIN_PASSWORD = 'una-clave-de-10'
$env:ADMIN_NAME = 'Tu nombre'
npm run create-admin
```

`migrate:json` se puede correr dos veces: hace upsert por id y al final imprime cuántos registros cargó por tabla. No borra filas que solo estén en la base. Si el JSON tiene el usuario demo (`mauro@luminocity.local` / `demo1234`), no lo migres a producción. La contraseña del admin tiene que tener al menos 10 caracteres.

En producción no hay registro público. El admin da de alta y administra las cuentas desde Usuarios. El encargado también, salvo las cuentas admin y el rol admin. `npm run create-admin` queda solo para el primer admin.

6. Abrí `https://<tu-servicio>.onrender.com/api/health`. Tiene que responder 200. Después entrá a la raíz y logueate con el admin.

El plan gratis de Render se duerme tras unos 15 minutos sin uso y tarda cerca de un minuto en despertar.

## Borrar los datos de prueba

El plan gratis de Render no tiene shell. El script se corre desde la PC, contra Neon. Antes, creá un branch de respaldo de la base en Neon.

Desde `server/`, en PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require'
npm run purge:test
```

Eso es un simulacro: muestra la base (el host, sin usuario ni contraseña) y cuántos registros borraría. No toca usuarios, datos maestros ni tarifas de viaje. Si los números cierran:

```powershell
npm run purge:test -- --confirm
```

Para borrar solo lo anterior a un día, en hora de Buenos Aires:

```powershell
npm run purge:test -- --before=2026-10-20
```

Un registro sin fecha no entra en ese corte. Si un pedido se borra y una fila de picking sigue apuntándolo, esa fila queda y el script lo avisa. No hay cascada.
