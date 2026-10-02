# Luminocity Logística

Luminocity vende artefactos lumínicos. Esta app es la operación de logística: cargar pedidos, prepararlos, despacharlos y seguir reclamos.
Los pedidos y la auth están en `server/`. Los datos maestros siguen en el navegador. Qué brief está hecho y cuál sigue: `HISTORY.md`.

## Stack y carpetas

React 19, Vite, TypeScript, React Router. Estilos en `src/index.css` (Tailwind 4).

| Carpeta | Qué hay |
| --- | --- |
| `src/pages/` | Una pantalla por ruta |
| `src/state/` | Contextos: auth, pedidos, picking, reclamos, catálogo |
| `server/` | Auth, pedidos, autorizaciones y avisos: Express, JWT y JSON |
| `src/lib/` | Persistencia, token de sesión, zona, geocodificación, rutas, adjuntos, Excel de picking, `access.ts`, `whatsapp.ts` y las API (`api.ts`, `authApi.ts`, `ordersApi.ts`, `authorizationsApi.ts`, `notificationsApi.ts`, `usersApi.ts`) |
| `src/data/` | Tipos y semillas: pedido, reclamo, catálogo |
| `src/layout/` | Sidebar, shell y tarjeta de login |
| `src/components/` | Diálogos de QR, carátula, link del adjunto, `NotificationBell`, `EditReasonDialog` y `NoAccess` |

Rutas: `src/App.tsx`. Menú: `src/layout/Sidebar.tsx`.

## Cómo trabajar

- Un brief a la vez, en `main`. Primero que funcione, después el pulido.
- Al terminar cada brief, actualizar `HISTORY.md`.
- No agregar features fuera del brief. No dejar código muerto.
- No inventar pantallas, datos ni integraciones. Lo que no está en el código es **Pendiente**.
- No adelantar el Brief 16b (GPS en vivo y orden por cercanía).
- El login acepta `vendedor`, `deposito`, `encargado_deposito`, `chofer` o `admin`. El menú y la API filtran por rol. El registro público siempre crea `vendedor`; solo admin cambia roles.

## Roles

Pantallas reales de `src/App.tsx`. `/login` y `/registro` son públicas.

### Vendedor

Carga pedidos con su usuario y ve solo los suyos (`createdBy` o `seller` igual a `sellerName`). Sin `sellerName` no puede cargar.

- Pantallas: Panel (ver), Nuevo Pedido (editar), Pedidos y Preparación (editar los suyos), Despacho (ver), Post Venta (editar).
- Puede cargar a nombre de otro vendedor solo si un encargado lo autorizó antes. La autorización se usa una sola vez.
- Edita sus pedidos con motivo. En `pendiente` el cambio se aplica y se avisa al encargado. En `preparado` queda esperando confirmación. Después de `preparado` no edita.
- No puede: pasar a `preparado`, asignar chofer, picking, estados de despacho, planificar la ruta, datos maestros, usuarios.

### Depósito

Deja listo lo que se entrega hoy. Ve pendientes y preparados.

- Pantallas: Panel (ver), Pedidos y Preparación (editar), Despacho (ver), Pendientes de Entregas (editar).
- Puede: `pendiente` → `preparado` con cantidad de bultos. Cargar el Excel de picking y tildar líneas.
- No puede: alta comercial, editar datos del pedido, asignar transportista, cancelar, confirmar entrega, reclamos, datos maestros.

### Encargado de depósito

Panel completo. Supervisa, asigna y confirma lo que el vendedor no puede cerrar solo.

- Pantallas: las de depósito, más Despacho (editar), Planificador de Rutas (editar), Post Venta (editar) y Bandeja (editar).
- Puede: asignar transportista y chofer, armar rutas, autorizar una carga a nombre de otro, aprobar o rechazar ediciones, cargar reclamos, editar y cancelar pedidos que no salieron.
- Si edita un pedido, se avisa al vendedor de ese pedido.
- No puede: marcar `en-viaje` o `entregado`, datos maestros, usuarios.

### Chofer

Entrega y deja constancia. Al entrar ve solo Mis entregas. El server le manda los pedidos de su transportista (`carrierName`) en `preparado`, `asignado` o `en-viaje`, con fecha de ayer, hoy o mañana. Sin `carrierName` no ve pedidos.

- Pantalla: Mis entregas (editar).
- Puede: pasar de `asignado` a `en-viaje` y de `en-viaje` a `entregado`. Desde en viaje avisa al cliente con un link `wa.me`.
- No puede: crear ni editar el pedido, preparar, asignar, picking, reclamos, datos maestros, el resto de las pantallas.
- El orden de la recorrida es por zona y dirección. GPS en vivo y cercanía real son **Pendiente**, Brief 16b.

### Admin

Mauro, desarrollador. Todo, más usuarios, roles y datos maestros.

- Pantallas: todas, Datos maestros y Usuarios incluidos (editar).
- Puede: cualquier estado del pedido y del reclamo. Carga el celular corporativo, vincula cada vendedor con su cuenta, vincula cada chofer con su transportista y cambia roles.
- Primero: el Panel, Datos maestros y Usuarios.

### Rol × pantalla

| Pantalla | Ruta | Vendedor | Depósito | Encargado | Chofer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Panel Operativo | `/` | ver | ver | ver | sin acceso | ver |
| Mis entregas | `/mis-entregas` | sin acceso | sin acceso | sin acceso | editar | sin acceso |
| Nuevo Pedido | `/nuevo-pedido` | editar | sin acceso | editar uno existente | sin acceso | editar |
| Pedidos y Preparación | `/pedidos` | editar los suyos | editar | editar | sin acceso | editar |
| Despacho | `/despacho` | ver | ver | editar | sin acceso | editar |
| Planificador de Rutas | `/rutas` | sin acceso | sin acceso | editar | sin acceso | editar |
| Pendientes de Entregas | `/pendientes` | sin acceso | editar | editar | sin acceso | editar |
| Post Venta | `/post-venta` | editar | sin acceso | editar | sin acceso | editar |
| Bandeja | `/bandeja` | sin acceso | sin acceso | editar | sin acceso | editar |
| Datos maestros | `/datos-maestros` | sin acceso | sin acceso | sin acceso | sin acceso | editar |
| Usuarios | `/usuarios` | sin acceso | sin acceso | sin acceso | sin acceso | editar |

`ver` es consulta. `editar` incluye las acciones de esa pantalla. `sin acceso` no muestra el ítem y la ruta dice que no hay acceso. Una URL ajena no alcanza: la API responde 403.

## Negocio

Estados del pedido: `pendiente` → `preparado` → `asignado` → `en-viaje` → `entregado`.

1. Carga en Nuevo Pedido (`P-` y siete dígitos). Queda en `pendiente`. Pide vendedor, cliente, teléfono, dirección, al menos una entrecalle, tipo de propiedad y fecha. La zona sale de la dirección o se elige a mano.
2. Depósito lo marca `preparado` e indica bultos. El encargado asigna transportista y chofer (`driverId`). El chofer ve los pedidos por el `carrierName` de su usuario, no por `driverId`. Puede editar o cancelar antes de que salga. El vendedor, si edita un preparado, deja el cambio en espera.
3. Despacho lo sigue por día. `asignado` y `en-viaje` van en la solapa de viaje. La carátula lleva QR: buscar el pedido o confirmar `entregado`.
4. Post venta es un reclamo aparte (`R-`), no un estado del pedido.

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

Datos maestros puede cambiar zonas, franjas (`10:00-15:00`, `09:00-13:00`, `15:00-19:00`) y tipos de propiedad (casa, departamento, obra, local, edificio, oficina). El planificador arma la recorrida de lo que no está `entregado`. Origen por defecto: Warnes 986, Buenos Aires. Sin GPS del chofer: **Pendiente**, Brief 16b.

Cada pedido guarda `edits`: `{ by, at, reason, changes, status }` con `aplicada`, `pendiente` o `rechazada`. Una edición pendiente no toca los datos hasta que el encargado la aprueba. Los avisos viven en `server/data/notifications.json` (`id`, `to`, `text`, `orderId`, `read`, `createdAt`, `channel`). `channel` es `app` y, cuando hay que avisar por celular, también `whatsapp` con `status` `pendiente`. El encargado lo manda con un link `wa.me` y el aviso pasa a `enviado`. La API de WhatsApp Business queda **Pendiente**, Brief 16b.

| Término | Qué es |
| --- | --- |
| Bulto | Paquete del pedido. Depósito carga cuántos hay al marcarlo preparado. |
| Carátula | Hoja con QR, impresa en Despacho, para la entrega. |
| Zona | Área de reparto y los días en que se visita. |
| Transportista | Quién lo lleva: flota propia o correo. |
| Despacho | Asignar, mandar y confirmar. También la pantalla `/despacho`. |
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
