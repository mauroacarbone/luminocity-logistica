# History

## Hechos

Los briefs 1–6 entraron juntos por el PR #1.

| Brief | Tema | Estado |
| --- | --- | --- |
| 1 | Persistencia en localStorage | Hecho |
| 2 | Preparado y bultos | Hecho |
| 3 | Panel operativo | Hecho |
| 4 | Zona automática | Hecho |
| 5 | Dirección: detectar y autocompletar | Hecho |
| 6 | Adjuntos reales | Hecho |
| 7 | QR real: carátula y escaneo (`7ac10a3`) | Hecho |
| 8 | Post venta: reclamos, fotos y filtros | Hecho |
| 9 | Datos maestros (`018012a`) | Hecho |
| 10 | Limpieza (`306477d`) | Hecho |
| 11 | Tipo de despacho (`ff33bc5`) | Hecho |
| 12 | Login local (`894b6aa`) | Hecho |
| 13 | Auth con Express + JWT y bcrypt en el server | Hecho |
| 14 | API de pedidos. Salen de `localStorage` | Hecho |
| 15 | Roles, menús y permisos | Hecho |
| 16 | Vista Chofer y avisos por WhatsApp (`wa.me`) | Hecho |
| 16.1 | Ajustes del chofer y avisos de WhatsApp | Hecho |
| 16b | GPS en vivo del chofer y orden por cercanía | Hecho |
| 16b.1 | La lista del chofer no espera a Nominatim | Hecho |
| 16b.2 | Recarga silenciosa de Mis entregas y reintento de Nominatim | Hecho |
| 17 | Pulido visual y confirmaciones con SweetAlert2 | Hecho |
| 17.1 | Envío de WhatsApp desde la campanita | Hecho |
| 18 | Límite de 3 pedidos por chofer y franja | Hecho |
| 18.1 | Franja obligatoria para el chofer y cupo | Hecho |
| 18.2 | Pedidos viejos con chofer y sin franja | Hecho |
| 18.3 | Piso, depto y timbre según el domicilio | Hecho |
| 18.4 | El server limpia piso, depto y timbre según el tipo | Hecho |
| 19 | Postgres (Neon) y deploy en Render | Hecho |
| 19.1 | Build de Render y escrituras en Postgres | Hecho |

El Brief 13 mueve el login y el registro a Express: JWT, bcrypt y usuarios en `server/data/users.json`.

El Brief 14 guarda los pedidos en `server/data/orders.json`; el navegador los usa por la API y los datos maestros siguen en localStorage.

El Brief 15 filtra menú y API por rol. El registro crea vendedor. El encargado autoriza cargas a nombre de otro y confirma ediciones de un preparado. Los avisos de la app ya se guardan.

El Brief 16 deja al chofer en Mis entregas: el server filtra por su transportista y por la fecha de ayer, hoy o mañana. Sale a reparto, marca entregado y avisa al cliente con `wa.me`. El encargado manda los avisos de WhatsApp pendientes desde la campanita. Al entregar, el vendedor recibe el aviso in-app y queda un solo WhatsApp pendiente para la campanita de los encargados.

El Brief 16.1 obliga a pasar por `en-viaje` antes de `entregado`. El listado del chofer trae solo `preparado`, `asignado` o `en-viaje`. Un preparado sin asignar espera al encargado, sin botones. Al entregar queda un solo WhatsApp pendiente para la campanita de los encargados, y el celular tiene que quedar en 10 dígitos.

El Brief 17 confirma con SweetAlert2 antes de cancelar, borrar, preparar, asignar transportista, salir a reparto, entregar, aprobar o rechazar una edición, cambiar un rol y marcar un WhatsApp. Al guardar muestra un toast y, si falla, el mensaje del server. La carga usa un spinner y, si no hay server, se puede reintentar.

El Brief 17.1 abre WhatsApp recién al confirmar, en el mismo click. El aviso pasa a `enviado` si el server responde bien; si responde 400, se cierra la ventana y avisa que otro encargado ya lo envió. Si el navegador bloquea la ventana, el chat se abre en la misma pestaña. Un teléfono con letras, `#`, interno, extensión o un 15 sin característica no arma link. Aprobar o rechazar una autorización, y elegir chofer en Despacho, también piden confirmación.

El Brief 16b guarda la última ubicación del chofer mientras tiene pedidos en viaje. Mis entregas la pide con el GPS, la manda como máximo cada 30 segundos y ordena las tarjetas por cercanía. Si no hay ubicación o el pedido no tiene coordenadas, el orden sigue por zona y dirección. El encargado y el admin ven esos choferes en el mapa. La ubicación se borra al terminar el último en viaje o al cerrar sesión.

El Brief 16b.1 no espera a Nominatim para devolver el listado: la geocodificación sigue en segundo plano y Mis entregas recarga una vez. Si Nominatim limita o no responde, el pedido espera una hora antes de reintentar. El mapa no vuelve a centrarse en cada refresco.

El Brief 16b.2 recarga Mis entregas sin el spinner, una sola vez por usuario en la sesión. No vuelve a pedir coordenadas si el pedido tiene `geoMiss` o un `geoRetryAt` en el futuro. Un corte de red, un JSON roto, un 5xx o un timeout dejan el reintento para dentro de una hora, sin error en cada consulta. Un 429 corta la tanda.

El Brief 18 limita a 3 los pedidos de un chofer por franja y por día. Las franjas no se suman entre sí. Al asignar el chofer, o al cambiar la fecha o la franja de uno que ya tiene chofer, el server responde 409 `FRANJA_LLENA` si se pasa. El encargado o el admin pueden confirmarlo y queda anotado en el pedido. Cancelar libera el lugar; entregar no. En Despacho, cada chofer muestra el cupo de esa franja y los que ya tienen 3 van en rojo. Reasignar un chofer pide confirmación.

El Brief 18.1 no deja asignar chofer si el pedido no tiene franja: el server responde 400 `FRANJA_REQUERIDA`, también si se intenta borrar la franja de uno que ya tiene chofer. No hay override. En Despacho ese selector queda deshabilitado. La franja se guarda como `09:00-13:00` y los espacios no cambian el cupo. La edición en espera del vendedor no se rechaza por cupo: se controla al aprobarla. El 409 dice cuántos pedidos tiene el chofer, y el pedido de autorización lo arma el front según el rol. El cupo se ve también fuera del selector. Quitar el chofer pide confirmación.

El Brief 18.2 no frena un pedido que ya tiene chofer y no tiene franja: cambiar estado o bultos sigue. La franja se exige al asignar o cambiar el chofer, o al borrarla si el chofer queda. Pasar a Sin chofer se permite con o sin franja. En Despacho ese pedido deja el chofer actual y Sin chofer, con el aviso de asignar franja; otro chofer no. El guion largo también separa la franja. Quien no es encargado ni admin ve "Asigná una franja primero" o "Pedile autorización al encargado".

El Brief 18.3 suma piso, depto y timbre al domicilio. Son opcionales, de hasta 20 caracteres. Departamento o edificio muestran los tres; casa, solo el timbre. Al cambiar el tipo se limpian los que no corresponden. El chofer los ve bajo la dirección, y también el detalle del pedido, Despacho y Pedidos. Nominatim sigue recibiendo solo la calle. Un pedido viejo sin esos campos abre y se edita igual. Si el vendedor los cambia, pide motivo y, en un preparado, espera la aprobación del encargado.

El Brief 18.4 limpia esos campos en el server según el tipo: departamento, edificio y oficina guardan los tres; casa y local, solo el timbre; obra y el resto, ninguno. Corre cuando el PATCH trae el tipo o alguno de los campos. Un cambio de estado no los toca, así un pedido viejo no le devuelve 403 al chofer. Oficina muestra los tres en el formulario y local solo el timbre. Si el encargado edita solo piso, depto o timbre, queda en `edits`. La carátula los muestra bajo la dirección. El aviso de franja en Despacho queda al lado del selector.

El Brief 19 pasa pedidos, usuarios, autorizaciones, avisos y ubicaciones a Postgres cuando hay `DATABASE_URL`. Sin esa variable siguen los JSON de `server/data`. Cada colección es una tabla (`id`, `data` jsonb, `updated_at`) y el objeto no cambia de forma. La cola de `lock.js` sigue igual; en Postgres cada vuelta es una transacción, así aprobar una edición y crear el aviso se confirman juntos. Las tablas se crean al arrancar. Los adjuntos siguen dentro del pedido (data URL), no en disco. `npm run migrate:json` hace upsert por id. En producción Express sirve `dist/` y `/api`, escucha `PORT`, responde `/api/health` y no arranca si faltan `DATABASE_URL` o `JWT_SECRET`. No crea el usuario `demo1234`: el primero sale de `npm run create-admin`. El plan gratis de Render se duerme tras unos 15 minutos.

El Brief 19.1 corrige el build de Render: `npm ci` en producción se salteaba Vite y TypeScript, así que el build instala las devDependencies del front y en el server deja solo las de producción. En Postgres cada escritura compara contra la foto leída en la transacción y toca solo las filas nuevas, distintas o borradas. Un cambio de estado escribe una fila. La conexión remota verifica el certificado; la local no usa SSL. `JWT_SECRET` en producción pide 32 caracteres o más. El registro público responde 403 y el login se corta al intento 11 en 15 minutos. `create-admin` pide una contraseña de al menos 10 caracteres. La migración y el admin se corren en la PC, con el host `-pooler` de Neon, porque el plan gratis no tiene shell.

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 16c | Link de seguimiento para el cliente | **Pendiente** |
| 16d | WhatsApp Cloud API | **Pendiente** |
| 20 | Reclamos (`R-`) a la API. | **Pendiente** |
| — | Sacar los adjuntos del listado de pedidos y que el PATCH mande solo lo que cambia. | **Pendiente** |
| — | Datos maestros siguen en localStorage. Este brief no los pasa a Postgres. | **Pendiente** |
| — | Los tiles de OpenStreetMap y el OSRM demo no son para producción. Revisar más adelante. | **Pendiente** |
| — | Autorizar un cuarto pedido en la franja con el permiso de un solo uso del Brief 15. Esa autorización es para cargar a nombre de otro vendedor y no encaja acá: hoy solo el encargado o el admin lo confirman en el momento. | **Pendiente** |

## Decisiones

- Los pedidos se guardan en el server. Sin `DATABASE_URL` van a JSON en `server/data`. Con `DATABASE_URL` van a Postgres, una tabla por colección. Los datos maestros siguen en el navegador. La auth ya está en el server.
- En producción hacen falta `DATABASE_URL` y `JWT_SECRET`. No se crea el usuario demo. El front y la API salen del mismo proceso.
- La contraseña se hashea con bcrypt en el server. El navegador solo guarda el JWT.
- El rol filtra el menú y la API. En desarrollo el registro público crea `vendedor` y rechaza un nombre o email que ya use otra cuenta. En producción el registro responde 403. No carga `sellerName`.
- El vendedor ve y edita por `sellerName`, no por el nombre de la cuenta. Sin vínculo no puede cargar pedidos. Solo admin lo elige en Usuarios, desde los vendedores de datos maestros. Al editar no puede cambiar el vendedor del pedido.
- El chofer ve las entregas de su `carrierName`. Sin vínculo no ve pedidos. Solo admin lo elige en Usuarios, desde los transportistas de datos maestros.
- Una carga a nombre de otro vendedor exige una autorización aprobada y sin usar. Se marca usada en la misma escritura que guarda el pedido. Al pedirla se avisa al encargado.
- Un chofer tiene como máximo 3 pedidos por `timeWindow` y `deliveryDate`. El cuarto responde 409 `FRANJA_LLENA`, salvo que encargado o admin manden `override: true`. Eso queda en `slotOverrides` del pedido.
- La edición de un preparado por el vendedor no cambia el pedido hasta que el encargado la aprueba o la rechaza. Si el pedido ya avanzó, aprobar responde 409. El vendedor recibe el aviso de aprobado o rechazado.
- No se le puede sacar el rol al último administrador.
- A `preparado` se pasa solo con una cantidad de bultos.
- Entrega propia y correo tienen listas de transportistas distintas, editables en Datos maestros.
- El QR de la carátula busca el pedido o confirma la entrega.
- Despacho ya filtra por transportista y agrupa `asignado` con `en-viaje`. Mis entregas separa asignados (preparado y asignado) de en viaje.
- El aviso de WhatsApp se abre con `wa.me` y queda `enviado`. El link de seguimiento para el cliente y la API de WhatsApp Cloud siguen pendientes.
- La ubicación del chofer es solo la última posición. Se borra al cerrar el último en viaje o la sesión. La ven el encargado y el admin.
- El backend va con Express + JWT, en línea con RendiYa (otro proyecto del mismo autor).
- Se trabaja en `main` para no perder avances en ramas sueltas; primero que funcione, después el pulido visual.
