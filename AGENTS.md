# Luminocity Logística

Luminocity vende artefactos lumínicos. Esta app es la operación de logística: cargar pedidos, prepararlos, despacharlos y seguir reclamos.
Los pedidos y la auth están en `server/`. Sin `DATABASE_URL` se guardan en JSON; con `DATABASE_URL`, en Postgres. Los datos maestros siguen en el navegador. Qué brief está hecho y cuál sigue: `HISTORY.md`.

## Stack y carpetas

React 19, Vite, TypeScript, React Router. Estilos en `src/index.css` (Tailwind 4).

| Carpeta | Qué hay |
| --- | --- |
| `src/pages/` | Una pantalla por ruta |
| `src/state/` | Contextos: auth, pedidos, picking, reclamos, catálogo |
| `server/` | Auth, pedidos, autorizaciones, avisos, hojas de ruta y ubicación del chofer: Express y JWT. JSON o Postgres |
| `src/lib/` | Persistencia, token de sesión, zona, geocodificación, rutas, adjuntos, Excel de picking, `access.ts`, `whatsapp.ts` y las API (`api.ts`, `authApi.ts`, `ordersApi.ts`, `authorizationsApi.ts`, `notificationsApi.ts`, `usersApi.ts`, `driversApi.ts`, `routeSheetsApi.ts`) |
| `src/data/` | Tipos y semillas: pedido, reclamo, catálogo |
| `src/layout/` | Sidebar, shell y tarjeta de login |
| `src/components/` | Diálogos de QR, carátula, link del adjunto, `NotificationBell`, `EditReasonDialog` y `NoAccess` |

Rutas: `src/App.tsx`. Menú: `src/layout/Sidebar.tsx`.

## Datos

Sin `DATABASE_URL`, cada colección es un JSON en `server/data/` (`orders`, `users`, `authorizations`, `notifications`, `locations`, `routeSheets`). Con `DATABASE_URL` (Neon, con ssl) es Postgres: una tabla por colección, `id text` primary key, `data jsonb` y `updated_at timestamptz`. El objeto se guarda igual, sin otro modelo.

La lectura y la escritura pasan por `server/src/db/store.js`. Las rutas no eligen el modo. `lock.js` sigue siendo una sola cola. En Postgres, además, cada vuelta de esa cola es una transacción: si una operación toca varios archivos (aprobar una edición y crear un aviso, usar una autorización al crear el pedido), se confirman juntas o no se guarda nada. Dentro de esa transacción la lectura guarda una foto y la escritura manda solo las filas que cambiaron. Las tablas se crean al arrancar si no existen (`server/src/db/schema.js`). Un host remoto usa SSL con el certificado verificado. Sin SSL quedan solo `localhost`, `127.0.0.1` y `::1`, mirando el hostname de la URL.

Los adjuntos del pedido ya van en el JSON como data URL (tope 2 MB) y viajan dentro de `data`. No hay archivos sueltos en disco. Datos maestros y reclamos siguen en el navegador.

`npm run migrate:json` carga los JSON en Postgres con upsert por id. `npm run create-admin` crea el primer admin en la base. En producción hacen falta `DATABASE_URL` y `JWT_SECRET` de 32 caracteres o más; si falta alguno, el server no arranca y no se crea el usuario demo. El registro público responde 403 y el login admite 10 intentos fallidos cada 15 minutos. Los usuarios nuevos guardan `createdAt`. Al volver a la pestaña se vuelve a pedir `/api/auth/me`. Express sirve `dist/` y la API en `/api`.

## Cómo trabajar

- Un brief a la vez, en `main`. Primero que funcione, después el pulido.
- Al terminar cada brief, actualizar `HISTORY.md`.
- No agregar features fuera del brief. No dejar código muerto.
- No inventar pantallas, datos ni integraciones. Lo que no está en el código es **Pendiente**.
- El login acepta `vendedor`, `deposito`, `encargado_deposito`, `chofer` o `admin`. El menú y la API filtran por rol. En desarrollo el registro público crea `vendedor`; en producción está cerrado. El admin cambia cualquier rol. El encargado cambia roles de cuentas que no son admin, y no puede asignar admin.

## Roles

Pantallas reales de `src/App.tsx`. `/login` y `/registro` son públicas.

### Vendedor

Carga pedidos con su usuario y ve solo los suyos (`createdBy` o `seller` igual a `sellerName`). Sin `sellerName` no puede cargar.

- Pantallas: Panel (ver), Nuevo Pedido (editar), Pedidos y Preparación (editar los suyos), Despacho (ver), Post Venta (editar).
- Puede cargar a nombre de otro vendedor solo si un encargado lo autorizó antes. La autorización se usa una sola vez.
- Edita sus pedidos con motivo. En `pendiente` el cambio se aplica y se avisa al encargado. En `preparado` queda esperando confirmación. Después de `preparado` no edita.
- No puede: pasar a `preparado`, asignar chofer, picking, estados de despacho, planificar la ruta, datos maestros, usuarios. Tampoco puede pasar el límite de 3 pedidos por chofer y franja.

### Depósito

Deja listo lo que se entrega hoy. Ve pendientes y preparados.

- Pantallas: Panel (ver), Pedidos y Preparación (editar), Despacho (ver), Pendientes de Entregas (editar).
- Puede: `pendiente` → `preparado` con cantidad de bultos. Cargar el Excel de picking y tildar líneas.
- No puede: alta comercial, editar datos del pedido, asignar transportista, cancelar, confirmar entrega, reclamos, datos maestros.

### Encargado de depósito

Panel completo. Supervisa, asigna y confirma lo que el vendedor no puede cerrar solo.

- Pantallas: las de depósito, más Despacho (editar), Choferes en ruta (ver), Planificador de Rutas (editar), Post Venta (editar), Bandeja (editar) y Usuarios (editar).
- Puede: asignar transportista y chofer, armar rutas, autorizar una carga a nombre de otro, aprobar o rechazar ediciones, cargar reclamos y editar pedidos que no salieron. Al asignar un chofer puede abrir el planificador con ese chofer y esa fecha, o dejarlo para después. Puede pasar el límite de 3 pedidos por chofer y franja si lo confirma. En Usuarios ve a todos y puede crear y modificar cuentas que no sean admin.
- Si edita un pedido, se avisa al vendedor de ese pedido.
- No puede: eliminar un pedido, marcar `en-viaje` o `entregado`, datos maestros. Tampoco puede modificar, desactivar ni cambiar la contraseña de un admin, ni asignar el rol admin.

### Chofer

Entrega y deja constancia. Al entrar ve solo Mis entregas. El server le manda los pedidos con su `driverId` en `preparado`, `asignado` o `en-viaje`, aunque la fecha ya haya pasado. Si el pedido no tiene `driverId`, sigue viéndolo por el `carrierName`. Sin `driverId` en el pedido y sin `carrierName` no ve nada. Los de una fecha anterior a hoy se marcan Atrasado y van primero.

- Pantalla: Mis entregas (editar).
- Puede: pasar de `asignado` a `en-viaje` y de `en-viaje` a `entregado`. Desde en viaje avisa al cliente con un link `wa.me`. Con al menos un pedido en viaje, la pantalla pide el GPS y manda la última posición. Para salir hace falta una hoja calculada de esa fecha y franja que incluya todos sus pedidos asignados y no esté desactualizada. Si falta, ve «Esperando hoja de ruta del encargado» y el botón queda deshabilitado. Si la hoja está planificada, tiene que usar Iniciar recorrido (no sale a `en-viaje` solo). Puede iniciar la de hoy o una atrasada; una fecha futura no.
- No puede: crear ni editar el pedido, preparar, asignar, picking, reclamos, datos maestros, el resto de las pantallas.
- Con la ubicación activa, Mis entregas muestra la distancia en línea recta. El orden es atrasados, después prioridad y después el inicio de la franja.

### Admin

Mauro, desarrollador. Todo, más usuarios, roles y datos maestros.

- Pantallas: todas, Datos maestros y Usuarios incluidos (editar).
- Puede: cualquier estado del pedido y del reclamo, salvo pasar a `en-viaje`: eso es solo del chofer. Elimina un pedido en cualquier estado: sale de la hoja y libera el cupo. En Usuarios ve, crea y modifica a todos, incluidos otros admins: rol, datos, activo y contraseña. Carga el celular corporativo, vincula cada vendedor con su cuenta y vincula cada chofer con su transportista. Al asignar un chofer puede abrir el planificador con ese chofer y esa fecha, o dejarlo para después.
- Primero: el Panel, Datos maestros y Usuarios.

### Rol × pantalla

| Pantalla | Ruta | Vendedor | Depósito | Encargado | Chofer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Panel Operativo | `/` | ver | ver | ver | sin acceso | ver |
| Mis entregas | `/mis-entregas` | sin acceso | sin acceso | sin acceso | editar | sin acceso |
| Nuevo Pedido | `/nuevo-pedido` | editar | sin acceso | editar uno existente | sin acceso | editar |
| Pedidos y Preparación | `/pedidos` | editar los suyos | editar | editar | sin acceso | editar |
| Despacho | `/despacho` | ver | ver | editar | sin acceso | editar |
| Choferes en ruta | `/choferes` | sin acceso | sin acceso | ver | sin acceso | ver |
| Planificador de Rutas | `/rutas` | sin acceso | sin acceso | editar | sin acceso | editar |
| Pendientes de Entregas | `/pendientes` | sin acceso | editar | editar | sin acceso | editar |
| Post Venta | `/post-venta` | editar | sin acceso | editar | sin acceso | editar |
| Bandeja | `/bandeja` | sin acceso | sin acceso | editar | sin acceso | editar |
| Datos maestros | `/datos-maestros` | sin acceso | sin acceso | sin acceso | sin acceso | editar |
| Usuarios | `/usuarios` | sin acceso | sin acceso | editar | sin acceso | editar |

`ver` es consulta. `editar` incluye las acciones de esa pantalla. `sin acceso` no muestra el ítem y la ruta dice que no hay acceso. Una URL ajena no alcanza: la API responde 403.

### Usuarios (`/api/users`)

El admin ve, crea y modifica a todos, incluidos otros admins. El encargado ve a todos y puede crear y modificar, salvo una cuenta cuyo rol actual es admin: eso responde 403 `{ message: "No podés modificar a un administrador" }`. Tampoco puede asignar el rol admin, ni al crear ni al editar: 403 `{ message: "No podés asignar el rol administrador" }`. Vendedor, depósito y chofer no entran. La regla está en `canManageUser`.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/users` | Lista. Admin y encargado. |
| POST | `/api/users` | Alta: `name`, `email`, `password` (8 a 72), `role` y, según el rol, `sellerName` o `carrierName`. |
| PATCH | `/api/users/:id` | `name`, `email`, `phone`, `sellerName`, `carrierName`. |
| PATCH | `/api/users/:id/role` | Cambia el rol. |
| PATCH | `/api/users/:id/active` | `{ active: boolean }`. |
| PATCH | `/api/users/:id/password` | `{ password }` de 8 a 72 caracteres, con bcrypt. |

Sin `active`, o con `active: true`, el usuario está activo. El login de uno inactivo responde 403 `{ message: "Tu usuario está desactivado. Hablá con el encargado." }`. Un token ya emitido recibe 401 en la request siguiente y el front cierra la sesión. Nadie se desactiva a sí mismo: 409 `{ message: "No podés desactivar tu propio usuario" }`. Tiene que quedar al menos un admin activo: desactivarlo o quitarle el rol responde 409 `{ message: "Tiene que quedar al menos un administrador activo" }`. El nombre y el email son únicos sin distinguir mayúsculas; el nombre tampoco distingue espacios de más. Si se repiten, 409.

## Negocio

Estados del pedido: `pendiente` → `preparado` → `asignado` → `en-viaje` → `entregado`.

El server obliga ese orden con `POST /api/orders/:id/transition` (`orderFlow.js`). `PATCH /api/orders/:id` ya no acepta `status` (400). Cada cambio queda en `order.history[]` (`at`, `by: { id, name }`, `from`, `to`, `reason?`, `via`). `via` por HTTP es `pedidos`, `despacho`, `mis-entregas` o `qr`; `hoja` solo lo usan confirmar/iniciar hoja por dentro (`fromSheet`). Pedidos viejos sin historial se leen con una entrada `Creado`. `assignedAt` / `departedAt` / `deliveredAt` se setean al avanzar y no se borran al volver atrás. El menú Estado del front sale de la misma tabla (`src/lib/orderFlow.ts`).

| De | A | Quién | Condiciones |
| --- | --- | --- | --- |
| `pendiente` | `preparado` | Depósito, encargado, admin | `packages` ≥ 1 |
| `preparado` | `asignado` | Encargado, admin | Entrega propia: chofer activo, franja y cupo. Correo: sin chofer ni cupo, `trackingNumber` opcional. En UI el correo muestra "Despachado". Asignar a un pendiente responde 409 |
| `asignado` | `en-viaje` | Solo el chofer del pedido | Solo entrega propia. Hoja calculada de esa fecha y franja, con todos los asignados y sin estar desactualizada. Otro rol: 403. Si está `planificada`, solo con Iniciar recorrido |
| `en-viaje` | `entregado` | Chofer del pedido (o por transportista), o admin (QR) | Solo entrega propia |
| `asignado` | `entregado` | Encargado, admin | Solo correo / courier |
| `preparado` | `pendiente` | Encargado, admin | `reason` ≥ 5 caracteres |
| `asignado` | `preparado` | Encargado, admin | `reason` ≥ 5. Quita el chofer y saca de la hoja (regla 20.1). Quitar chofer = esta transición |
| `en-viaje` | `asignado` | Solo admin | `reason` ≥ 5 |
| `entregado` | `en-viaje` | Solo admin | `reason` ≥ 5 |

Cualquier otra transición: 409 `{ message: "No se puede pasar de X a Y", code: "TRANSICION_INVALIDA" }`. Reasignar chofer en `asignado` sigue por `PATCH` y queda en `history`. En otro estado, cambiar `driverId` responde 409.

1. Carga en Nuevo Pedido (`P-` y siete dígitos). Queda en `pendiente`. El tipo de despacho es el primer campo. En un retiro se ocultan y se vacían transportista, franja, dirección, entrecalles y tipo de inmueble; siguen el teléfono y la fecha de retiro (hoy si está vacía). En una entrega pide vendedor, cliente, teléfono, dirección, al menos una entrecalle, tipo de propiedad y fecha. La zona sale de la dirección o se elige a mano.
2. Depósito lo marca `preparado` e indica bultos. El encargado asigna transportista y chofer (`driverId`). El chofer ve los pedidos con su `driverId`. Los viejos, sin chofer, siguen por `carrierName`. Puede editar antes de que salga. El admin puede eliminar el pedido en cualquier estado. El vendedor, si edita un preparado, deja el cambio en espera.
3. Despacho lo sigue por día. `asignado` y `en-viaje` van en la solapa de viaje. La carátula lleva QR: buscar el pedido o confirmar `entregado`.
4. Post venta es un reclamo aparte (`R-`), no un estado del pedido.

Un chofer (`driverId`) puede tener como máximo 3 pedidos por franja y por día de entrega. Las franjas (`09:00-13:00`, `10:00-15:00`, `15:00-19:00`) se cuentan por separado, aunque se superpongan. Se guardan sin espacios (`09:00-13:00`); `09:00 - 13:00` cuenta igual. Eliminar el pedido lo borra y libera el lugar; solo el admin, con `DELETE /api/orders/:id`. Los `entregado` sí ocupan la franja. El cupo se controla al asignar el chofer y al cambiar la fecha o la franja de un pedido que ya tiene uno. La edición que el vendedor deja en espera se controla recién al aprobarla. Si quedaría en 4 o más, el server responde 409 con `code: FRANJA_LLENA` y un mensaje neutro con la cantidad. El encargado o el admin pueden pasarse mandando `override: true`; el pedido guarda quién lo autorizó y cuándo en `slotOverrides`. Otro rol recibe el rechazo. El texto que pide esa autorización lo arma el front según el rol. La autorización de un solo uso para cargar a nombre de otro vendedor no cubre este caso. No se puede asignar chofer si el pedido no tiene franja: el server responde 400 `FRANJA_REQUERIDA`, también si se intenta borrar la franja de un pedido que ya tiene chofer. Para sacarla, primero hay que pasarlo a Sin chofer. No hay override para esa regla.

`dispatchType` es `propia` (entrega propia) o `correo` (correo / courier). Cada tipo tiene su lista, editable en Datos maestros.

- Propia: Entrego ya!, Oscar, Via cargo, Eventual, Dario, Expreso, Hormiga.
- Correo: Andreani, Correo Argentino, Via Cargo, Entrego ya!, Oca.

El transportista se elige al cargar. Despacho filtra por esa lista.

| Zona | Días |
| --- | --- |
| CABA | Lun a Sáb |
| GBA Norte | Lun · Jue |
| GBA Oeste | Mar · Vie |
| GBA Sur | Jue |
| Provincia | Sin días |

Datos maestros puede cambiar zonas, franjas (`10:00-15:00`, `09:00-13:00`, `15:00-19:00`) y tipos de propiedad (casa, departamento, obra, local, edificio, oficina). El domicilio puede guardar `floor` (piso), `unit` (depto / unidad) y `doorbell` (timbre): opcionales, hasta 20 caracteres. Departamento, edificio y oficina usan los tres. Casa y local, solo el timbre. Obra y el resto no guardan ninguno. El server los limpia según el tipo cuando el PATCH trae `propertyType` o alguno de esos campos; un cambio de estado no los toca. No entran en la dirección que va a Nominatim. El planificador arma la recorrida de lo que no está `entregado`. Origen por defecto: Warnes 986, Buenos Aires. Choferes en ruta muestra la última posición de cada chofer con pedidos en viaje.

### Hojas de ruta (`/api/route-sheets`)

Una hoja es por chofer, fecha y franja (`planificada` → `en_curso` → `cerrada`). Vive en `routeSheets`. Al confirmar, los preparados pasan a `asignado` y guardan `routeId` / `routeSeq`. Al iniciar (solo el chofer, la de hoy o una atrasada), pasan a `en-viaje`. Si falta algún pedido asignado de esa fecha y franja, la hoja queda `stale` y el inicio responde 409 «Esperando hoja de ruta del encargado» hasta recalcularla. Cuando todos los pedidos de la hoja están `entregado` o ya no existen (eliminar borra el pedido), la hoja se cierra. Si en Despacho se cambia chofer, fecha o franja, o se baja de `asignado` a `pendiente`/`preparado`, y la hoja sigue `planificada`, el pedido sale de la hoja y se renumeran los que quedan; si la hoja queda vacía, se borra. Si la hoja está `en_curso`, ese cambio responde 409, salvo pasar a `entregado`.

| Método | Ruta | Quién | Qué hace |
| --- | --- | --- | --- |
| GET | `/api/route-sheets?date=` | Encargado, admin, chofer | Lista del día. El chofer solo ve las suyas. |
| POST | `/api/route-sheets` | Encargado, admin | Crea o reemplaza una hoja `planificada` (`driverId`, `date`, `slot`, `origin`, `orderIds`, `km`, `minutes`, `override`). |
| DELETE | `/api/route-sheets/:id` | Encargado, admin | Borra una hoja `planificada` y limpia `routeId` / `routeSeq`. |
| POST | `/api/route-sheets/:id/start` | Chofer | Pasa la hoja a `en_curso` y sus pedidos a `en-viaje`. Hoy o una fecha atrasada, si la hoja incluye todos los asignados. |

Cada pedido guarda `edits`: `{ by, at, reason, changes, status }` con `aplicada`, `pendiente` o `rechazada`. Una edición pendiente no toca los datos hasta que el encargado la aprueba. Si la dirección no trae coordenadas, el server la geocodifica con Nominatim (una consulta por segundo, User-Agent propio) y guarda `lat` y `lng` en el pedido. Los avisos viven en `server/data/notifications.json` (`id`, `to`, `text`, `orderId`, `read`, `createdAt`, `channel`). `channel` es `app` y, cuando hay que avisar por celular, también `whatsapp` con `status` `pendiente`. El encargado lo manda con un link `wa.me` y el aviso pasa a `enviado`. La última ubicación del chofer vive en `server/data/locations.json` (fuera de git): una sola posición por usuario (`lat`, `lng`, `accuracy`, `timestamp`, `updatedAt`), sin historial. `POST /api/drivers/location` la guarda y solo la llama el chofer, como máximo cada 30 segundos, mientras tiene pedidos en viaje contados por `driverId` (y por transportista solo si el pedido no tiene chofer). `DELETE /api/drivers/location` la borra al terminar el último en viaje o al cerrar sesión. `GET /api/drivers/locations` la ven el encargado y el admin: choferes con pedidos en viaje, transportista y cantidad. Si la posición tiene más de 10 minutos, el mapa la marca sin señal. Ningún otro rol ve ubicaciones. El link de seguimiento para el cliente y la API de WhatsApp Business quedan **Pendiente**.

| Término | Qué es |
| --- | --- |
| Bulto | Paquete del pedido. Depósito carga cuántos hay al marcarlo preparado. |
| Carátula | Hoja con QR, impresa en Despacho, para la entrega. |
| Zona | Área de reparto y los días en que se visita. |
| Transportista | Quién lo lleva: flota propia o correo. |
| Despacho | Asignar, mandar y confirmar. También la pantalla `/despacho`. |
| Hoja de ruta | Recorrido de un chofer para una fecha y franja (`routeSheets`). |
| Reclamo | Caso de post venta, separado del estado del pedido. |

## Commits

- Escribir como un dev del equipo: corto, en español, en imperativo/infinitivo y sin punto final. Ejemplos: `Agregar tipo de despacho en Nuevo Pedido`, `Corregir zona en GBA Sur`.
- Una línea de hasta ~60 caracteres, que diga para qué. Cuerpo solo si hace falta explicar el porqué, en 1 o 2 líneas.
- Sin emojis ni prefijos tipo `feat:` / `fix:`.
- Sin frases armadas o de IA ("se implementó exitosamente", "mejora robusta", "para una mejor experiencia").
- Sin `Co-authored-by` ni otros trailers. Sin menciones a Cursor o IA en el mensaje.
- Un commit por brief o por cambio lógico, no un commit gigante.
- En `main`. Un brief a la vez.
- Al terminar cada brief, actualizar `HISTORY.md`.
- Antes de commitear código, `npm run build` y `npm run lint` tienen que pasar.
- No commitear `.env` ni secretos.
- No hacer push salvo que el brief lo pida.
- Primero que funcione, después el pulido: no mezclar un rediseño con el brief.
