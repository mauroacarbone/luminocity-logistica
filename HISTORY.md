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
| 19.2 | Arreglos de producción: login, errores y usuarios | Hecho |
| 19.3 | Sesión estable al cambiar de pestaña y alta de usuarios | Hecho |
| 19.4 | Permisos en Usuarios, activos e inactivos y edición | Hecho |
| 19.5 | Chofer inactivo, sesiones y fechas del planificador | Hecho |
| 20 | Hoja de ruta por chofer y seguimiento de la entrega | Hecho |
| 20.1 | Hoja de ruta consistente y ubicación por chofer | Hecho |
| 20.2 | Tres arreglos chicos de la hoja de ruta | Hecho |
| 21a | Máquina de estados del pedido e historial | Hecho |
| 21a.1 | Cerrar agujeros de la máquina de estados | Hecho |
| 21a.2 | Tipo de despacho y correo sin atajos | Hecho |
| 21a.3 | Pedidos viejos sin despacho y detalles | Hecho |
| 21a.4 | Una sola regla para el despacho de pedidos viejos | Hecho |
| 21b | Pasos del pedido y página de detalle | Hecho |
| 21c | Botón de siguiente paso por rol | Hecho |
| 21c.1 | Asignar chofer desde el detalle | Hecho |
| 21d | Claridad en Planificador y filtro en Choferes en ruta | Hecho |
| 21e | Stepper verde al entregar y aviso al chofer | Hecho |
| 21f | Mostrar preparados en Pedidos y Preparación | Hecho |
| 21g | Página de Seguimiento de pedidos | Hecho |
| 21g.1 | Nombre del chofer en el listado de pedidos | Hecho |
| 21h | Hojas futuras en Mis entregas | Hecho |
| 21h.1 | Botones de Mis entregas sin repetir | Hecho |
| 22a | API de picking (Pendientes de Entregas) | Hecho |
| 22a.1 | Topes y alta en lote para picking | Hecho |
| 22a.2 | Merge seguro y repetidos en el lote de picking | Hecho |
| 22a.3 | Comparar raw sin importar el orden | Hecho |
| 22b | Pendientes de Entregas conectado a la API con importación previa | Hecho |
| 22b.1 | Migración de picking sin repetidos | Hecho |
| 22c | Buscar, filtrar y ver todos los datos de picking | Hecho |
| 22c.1 | CSV de picking listo para Excel | Hecho |
| 22c.2 | Loguear errores del servidor en orders, hojas y picking | Hecho |
| 22c.3 | Aceptar routeSheets como colección en Postgres | Hecho |
| 22d | Cruzar picking con pedidos y cargar lo pickeado | Hecho |
| 22d.1 | Correcciones de cantidad pickeada y cruce por comprobante | Hecho |
| 22e | Marcar preparado desde picking | Hecho |
| 22e.1 | Estado final del botón de picking | Hecho |
| 24a | Post Venta: estado destacado + texto de Mis entregas | Hecho |
| 24 | API de reclamos (Post Venta) en el servidor | Hecho |
| 24.1 | Ajustes de la API de reclamos | Hecho |
| 24b | Post Venta contra la API de reclamos | Hecho |
| 24b.1 | Que recargar reclamos no pise cambios ni fotos | Hecho |
| 24b.2 | Post Venta: un solo stepper por tarjeta | Hecho |
| 25 | Notificaciones que se cierran solas y aviso emergente | Hecho |
| 25.1 | Avisos que se limpian al leer y pedidos entregados sin editar | Hecho |
| 25.1.1 | Ajustes del aviso emergente y del mensaje de edición | Hecho |
| 24c | Reclamos: autor del cambio y aviso al vendedor | Hecho |
| 26a | Avanzar pedidos desde el Panel operativo | Hecho |
| 26a.1 | Hojas de ruta del Panel solo para quien puede verlas | Hecho |
| 26b | Panel operativo con filtro por fecha y lista para celular | Hecho |
| 26b.1 | Panel sin parpadeo en celular y hojas de pedidos atrasados | Hecho |
| 27a | Tipo de despacho Retiro por el local | Hecho |
| 27a.1 | Pedidos viejos sin despacho y dirección al pasar a propia | Hecho |
| 27a.2 | Retiro sin datos de dirección y aviso de campos faltantes | Hecho |
| 27c | Sacar los retiros de chofer, franja y planificador | Hecho |
| 27b | Página de Retiros por el local | Hecho |
| 27b.1 | Abrir WhatsApp al avisar y volver a avisar | Hecho |
| 28a | Menú lateral agrupado y sin barra de scroll | Hecho |
| 28a.1 | Logo de Luminocity en el login | Hecho |
| 28b | Menú hamburguesa en celular y tablet | Hecho |
| 28b.1 | Menú hamburguesa cerrado fuera del foco | Hecho |
| 28c | Menú ⋯ de pedidos sin cortarse en celular | Hecho |
| 29b | Borrador de Nuevo pedido que sobrevive a recargar | Hecho |
| 29c | Búsqueda de dirección con 3 intentos y confirmar Cancelar | Hecho |
| 29c.1 | Ubicar compatible con iPhone viejos | Hecho |
| 29c.2 | Confirmaciones que se cierran con Escape como antes | Hecho |
| 30 | Prioridad de pedidos | Hecho |
| 30.1 | Orden de prioridad consistente | Hecho |
| 31 | Pendientes de Entregas con pedidos, filtros y CSV | Hecho |
| 31.1 | Ajustes en Pendientes | Hecho |
| 32a | Tokens de diseño y marca configurable | Hecho |
| 32b | Nueva paleta clara y sidebar clara | Hecho |
| 32b.1 | Colores de JS desde los tokens | Hecho |
| 32c | Componentes base de UI | Hecho |
| 32e | Navegación superior y paleta de comandos | Hecho |
| 32e.1 | Accesibilidad de la paleta y los menús | Hecho |
| 32e.2 | Menús de la barra superior visibles | Hecho |
| 32e.3 | Diálogos sobre la barra superior | Hecho |
| 32f.1 | Ajustes del contenedor, búsqueda, migas y planificador | Hecho |
| 32f.2 | Ajustes del planificador y de los filtros de fecha | Hecho |
| 32g | Tabla de Pedidos con detalle lateral y Panel con KPIs | Hecho |
| 32g.1 | Ajustes del panel lateral y del KPI Atrasados | Hecho |
| 33 | Chofer, atrasos, planificador, hoja de ruta y Nuevo pedido | Hecho |
| 33.6 | Paleta estilo GitHub, Primer claro | Hecho |
| 33.6.1 | Tema oscuro de GitHub en toda la app | Hecho |
| 33.6.2 | Layout y acciones estilo GitHub | Hecho |
| 33.6.1.1 | Contraste al imprimir y en el hover de los botones | Hecho |
| 33.6.2.1 | Contadores del Panel y detalles de accesibilidad | Hecho |
| 32h | Páginas de logística con el layout nuevo | Hecho |
| 32g.2 | Filtros y vista del Panel operativo | Hecho |
| 32j | Pendientes de Mis entregas, Planificador, Pendientes, Despacho y Panel | Hecho |
| 32j.1 | Primario verde, hoy del Panel y refresco sin F5 | Hecho |
| 32j.2 | Refresco más seguro | Hecho |
| 32i | Formularios, pantallas de admin y limpieza de CSS | Hecho |
| 32i.1 | Últimas acciones azules y fin de .btn-primary | Hecho |
| 32i.2 | Radio del tema en el motivo de edición y el aviso | Hecho |
| 32l | Chofer trabado en hoja de ruta y entrega por el encargado | Hecho |
| 32l.1 | Atrasados, segundo viaje y avisos de hoja | Hecho |
| 32l.3 | Prioridad del detalle, transportista y motivo al finalizar | Hecho |
| 32l.4 | Buscador de Seguimiento con un solo borde | Hecho |
| 32l.2 | Planificador más holgado y buscador accesible | Hecho |
| 32l.5 | Mapa debajo del encabezado y filas con aire | Hecho |
| 35 | Reportes de entregas, choferes, reclamos y retiros | Hecho |
| 35.1 | PDF de viajes y pestañas de Mis viajes | Hecho |
| 35.2 | Porcentajes de puntualidad, no entregas y filas de Atrasados | Hecho |
| 35.3 | Exportación de Reportes y del Panel, y totales | Hecho |
| 35.4 | Sin gráficos en Reportes | Hecho |
| 34 | Operarios de depósito: Mi preparación | Hecho |
| 34.2 | Ajustes al armado y al alta de pedidos | Hecho |
| 34.3 | Mi preparación completa y armado solo desde ahí | Hecho |
| 34.5 | Vínculo de artículos y excepción de retiros viejos | Hecho |
| 34.6 | Artículos manuales en el armado | Hecho |
| 34.7 | Estado de la fila al cambiar la cantidad | Hecho |
| 36 | Post Venta: rol Técnico y reparaciones | Hecho |
| 36.1 | Integridad del circuito de reparación | Hecho |
| 36.2 | Llamar y reasignar en la reparación | Hecho |

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

El Brief 19.2 afina lo que se nota en producción. El límite del login cuenta solo los intentos fallidos, así el depósito puede entrar entero desde la misma IP. El 404 de `/api` responde `{ message }`, igual que el resto. La base local se decide por el hostname (`localhost`, `127.0.0.1` o `::1`), no por el texto de la URL. Los usuarios nuevos guardan `createdAt`; los viejos, sin esa fecha, muestran "—". Al volver a la pestaña el front pide `/api/auth/me` y, si el admin se edita a sí mismo, la sesión se actualiza en el momento. Cerrar sesión con el token vencido limpia el navegador y no muestra error si la ubicación del chofer no se pudo borrar.

El Brief 19.3 deja quieta la sesión al volver a la pestaña: si `/api/auth/me` no cambió, el objeto de usuario sigue siendo el mismo y no se vuelven a bajar pedidos ni usuarios. En Usuarios, una recarga no pisa un cambio sin guardar. El admin da de alta cuentas desde esa pantalla (`POST /api/users`): email único, contraseña de 8 caracteres y rol. `create-admin` queda solo para el primer admin. El 404 de una ruta de la API dice "No existe esa ruta de la API".

El Brief 19.4 abre Usuarios al encargado, con la regla en el server. El admin crea y modifica a todos. El encargado también, menos a un admin y menos asignar ese rol. Cada usuario tiene `active` (si falta, está activo). Un inactivo no entra y el token que ya tenía recibe 401. Nadie se desactiva a sí mismo y tiene que quedar un admin activo. El nombre, el email y la contraseña se editan desde la misma pantalla. El nombre y el email son únicos.

El Brief 19.5 no deja asignar un chofer desactivado, salvo que el pedido ya lo tuviera. En Despacho ese chofer aparece como "(inactivo)" y el resto de la lista son solo activos. Al desactivarlo se borra su ubicación y deja de figurar en el mapa. Si el rol se guarda y el resto del usuario falla, la tarjeta muestra el rol nuevo y no se pierde el nombre ni el email que todavía no se guardó. El permiso se lee dentro de la misma escritura. La contraseña se mide en bytes (tope 72). Cada usuario tiene `tokenVersion`: resetear la contraseña o desactivarlo invalida las sesiones, también en el mismo segundo. Si se cambia la propia, el server devuelve un token nuevo y la pantalla sigue adentro. Un usuario desactivado ve en el login "Tu usuario está desactivado. Hablá con el encargado.". Una sesión vencida ve "Tu sesión venció. Volvé a entrar.". Activar y desactivar piden confirmación, y Escape no cierra el modal mientras guarda. En el planificador, el celular muestra el día corto y el número en dos líneas. La semana, si no es la actual, muestra el rango corto.

El Brief 20 guarda `assignedAt`, `departedAt` y `deliveredAt` en el server, y los borra si el pedido vuelve atrás. El chofer ve los pedidos con su `driverId`; si el pedido no tiene chofer, sigue por el transportista. La hoja de ruta (`routeSheets`) es una por chofer, fecha y franja. El planificador elige fecha, chofer activo y franja, muestra el cupo y confirma el orden. Si la franja se llena, el encargado puede autorizar. El chofer ve la hoja de hoy, inicia el recorrido y abre el camino en Google Maps. Al entregar el último, la hoja se cierra. Despacho separa "Esperando salida" y "En viaje", con el tiempo de salida, el avance de la hoja y "Atrasado" si se pasó el fin de la franja. Choferes en ruta muestra la hoja en curso y la próxima parada.

El Brief 20.1 mantiene la hoja alineada con el despacho: si cambia el chofer, la fecha o la franja, o se baja de asignado, el pedido sale de una hoja planificada y se renumeran las paradas; si la hoja queda vacía, se borra. Con la hoja en curso ese cambio responde 409, salvo entregar. Solo se inicia la hoja del día y solo con pedidos que siguen en ella. El chofer no pasa a en viaje un pedido de una hoja planificada sin Iniciar recorrido. La ubicación y Choferes en ruta cuentan por `driverId` (transportista solo si el pedido no tiene chofer). Al volver de en viaje a asignado se conserva el `assignedAt`. El planificador pone el cupo en rojo al llegar a 3, calcula la ruta al confirmar y refresca una hoja en curso. Mis entregas muestra una hoja de ayer aún en curso, cuenta paradas reales y limita "Cómo llegar" a 3. Despacho marca "Atrasado" solo en asignado y en viaje, y pide las hojas del día buscado.

El Brief 20.2 cierra una hoja en curso si al sacar un pedido queda vacía. Bajar de en viaje a pendiente o preparado también cuenta como salida de la hoja (409 si está en curso). En Mis entregas, "Parada X de N" usa `routeSeq` y el largo de la hoja, no el índice de la lista visible.

El Brief 21a deja la máquina de estados en el server (`orderFlow.js` y `POST /api/orders/:id/transition`). Solo se avanza o se vuelve un paso, con roles y requisitos (bultos, chofer, franja, cupo). `PATCH` ya no acepta `status`. Cada cambio queda en `history` con `via`. Al volver atrás no se borran `assignedAt`, `departedAt` ni `deliveredAt`. La hoja confirma e inicia por `orderFlow`.

El Brief 21a.1 cierra agujeros: `via: "hoja"` solo interno; el chofer se cambia por la máquina (o reasignación en `asignado`); el correo va preparado → despachado → entregado sin en-viaje; pedidos viejos sin `driverId` siguen por transportista; el menú Estado sale de `src/lib/orderFlow.ts`.

El Brief 21a.2 fija el despacho: `dispatchType` solo se cambia en pendiente o preparado; el correo no entra en hojas ni en Mis entregas; el tracking lo editan encargado y admin; Panel y Pedidos muestran "Despachado".

El Brief 21a.3 cierra detalles: un pedido viejo sin `dispatchType` se trata como entrega propia al editar, y el PATCH solo manda ese campo si cambió. Reasignar chofer acepta `via` `despacho` o `pedidos` (por defecto `pedidos`); `via: "hoja"` en `/transition` responde 400. El tracking deja de pedir motivo ni avisar al vendedor. El planificador no lista correo ni transporte tercero.

El Brief 21a.4 unifica la regla: sin `dispatchType` es entrega propia. No se deduce por transportista. El formulario de edición y el planificador usan el valor guardado (faltante = propia), igual que el server.

El Brief 21b muestra los pasos del pedido (`OrderStepper`) según el despacho, compacto en Despacho y Mis entregas, y la página de detalle `/pedidos/:id` con datos e historial. Sin `dispatchType` se trata como propia.

El Brief 21c pone un botón de siguiente paso por rol (`nextAction` / `backActions`) en Despacho y en el detalle del pedido, con menú ⋯ para volver atrás. El GET del pedido incluye `driverName`.

El Brief 21c.1 deja asignar chofer y franja desde el detalle con un diálogo. Si el pedido está en una hoja planificada, no ofrece Iniciar viaje (`sheetPlanned`).

El Brief 21d aclara el Planificador: el cupo dice "en la franja", lista los no seleccionables con motivo y avisa los preparados sin franja. En Choferes en ruta hay buscador y select; el mapa se centra en los visibles.

El Brief 21e deja el stepper todo en verde con ✓ al entregar (sin `aria-current`) y el aviso del chofer dice que se avisó al vendedor.

El Brief 21f muestra en Pedidos y Preparación los pedidos pendientes y preparados del día (antes solo pendientes). Primero los pendientes; "Marcar preparado" solo en esos. Los preparados quedan con pastilla, bultos y link al detalle.

El Brief 21g agrega la página Seguimiento (`/seguimiento`) para buscar pedidos por número, cliente o factura y filtrar por estado y fecha de entrega. Usa los pedidos de `useOrders()` (el server ya filtra por rol). Está en el menú de vendedor, depósito, encargado y admin; el chofer no entra.

El Brief 21g.1 manda `driverName` en el GET de pedidos (una sola lectura de usuarios) y en Seguimiento ordena primero hoy en adelante y después los pasados. Si falla la carga, muestra el error.

El Brief 21h carga en Mis entregas las hojas planificadas de otros días (además de hoy y ayer en curso). La tarjeta muestra la fecha; "Iniciar recorrido" solo el día de la hoja. Un pedido en hoja planificada ya no ofrece "Salir a reparto". El server incluye la fecha en el rechazo.

El Brief 21h.1 renombra el recorrido de la hoja a "Ver recorrido completo" y lo muestra solo con 2 o más paradas pendientes. Los contadores de Asignados y En viaje incluyen también los pedidos que están dentro de una hoja.

El Brief 22a guarda el picking en el server (`/api/picking`, JSON o Postgres). La pantalla Pendientes de Entregas sigue en localStorage.

El Brief 22a.1 pone topes a `raw` y al body, deja el DELETE solo a encargado/admin, y suma `POST /api/picking/batch` (replace o merge).

El Brief 22a.2 hace el merge sin borrar filas, rechaza repetidos en el lote y el replace vacío, y cuenta `updated` solo si algo cambió.

El Brief 22a.3 compara `raw` por claves (sin importar el orden) y arma una sola vez el índice de la fila más vieja en el merge.

El Brief 22b conecta Pendientes de Entregas a `/api/picking`, migra el localStorage y agrega vista previa de importación con replace/merge por lotes.

El Brief 22b.1 agrupa el picking legacy por clave antes del batch, borra la clave al descartar y vuelve a ofrecer el aviso al cambiar de usuario.

El Brief 22c agrega en Pendientes de Entregas un buscador (Buscar, Enter y limpiar) sobre cliente, comprobante, artículo, vendedor y valores de `raw`, chips por status del server y el contador de filas. "Ver todos los datos" abre la tabla con las columnas de `raw` más los campos fijos, con selector de columnas y exportación CSV de lo filtrado.

El Brief 22c.1 deja el CSV listo para Excel en español: BOM UTF-8, separador `;`, CRLF y escape de fórmulas. El modal muestra como máximo 500 filas (el CSV exporta todas), el selector de columnas hace scroll y Escape cierra.

El Brief 22c.2 loguea en consola el método, la ruta y el error completo cuando falla `send()` en orders, hojas de ruta y picking, sin cambiar la respuesta al cliente.

El Brief 22c.3 deja pasar mayúsculas en el nombre de colección de Postgres (`IDENT`), así `routeSheets` deja de fallar. `ensureTables` valida cada nombre al arrancar.

El Brief 22d agrupa el picking por comprobante, lo cruza con `order.invoices` (normalizado) y guarda `orderId` por PATCH. Se carga `pickedQty`, el status pasa a `en_preparacion` y el grupo muestra faltantes o "Listo para preparar".

El Brief 22d.1 no baja filas `preparado` desde el input, exige enteros en `pickedQty`, normaliza comprobantes por grupos letra/número y limita el auto-vínculo a encargado/admin (máx. 50). El server valida entero, ≥ 0 y ≤ cantidad.

El Brief 22e marca preparado desde Pendientes de Entregas cuando el comprobante está vinculado a un pedido pendiente o preparado y están completas todas las filas de todos sus comprobantes. Usa la vía `picking` en el historial, pide bultos si hace falta, y después deja las filas en `preparado`. Si baja la cantidad del artículo, el server recorta `pickedQty`. El Planificador usa singular con un solo pedido sin franja y Choferes en ruta deja de repetir avisos vacíos.

El Brief 22e.1 deja el botón de picking según el estado real: chip "Preparado" si el pedido y todas sus filas ya lo están; "Marcar filas preparadas" si faltan filas; saltea las ya marcadas. Indexa las filas por comprobante con `useMemo` para planillas grandes.

El Brief 24a destaca el estado en cada tarjeta de Post Venta: pastilla grande, stepper de avance (o Cancelado), botón "Pasar a…" y "Volver a…" con confirmación, y el menú de salto como "Cambiar a otro estado" (sin Cancelado). En Mis entregas, si la pestaña tiene pedidos pero están todos en la hoja, el vacío dice que están arriba.

El Brief 24 guarda los reclamos en el server (`/api/claims`, JSON o Postgres). Alta, listado sin dataUrl, detalle con archivos, cambio de estado, notas e importación de hasta 200. El vendedor solo ve los suyos; encargado y admin ven todos. El cliente sigue en localStorage hasta el 24b.

El Brief 24.1 sube el tope del body de `/api/claims` a 12 MB (para que 8 MB de archivos en base64 no den 413) y, al importar, descarta el `by` de los eventos: quedan sin autor y el reclamo guarda `importedBy`.

El Brief 24b saca los reclamos de localStorage: Post Venta usa `/api/claims` (alta, listado, estado, notas y fotos a demanda). Si el server está vacío y quedan reclamos en el navegador, ofrece subirlos en lotes (máx. 200 y bajo 10 MB) o descartarlos.

El Brief 24b.1 fusiona el listado con lo que ya hay en pantalla: conserva fotos y adjuntos ya cargados, y si hubo un alta, cambio de estado o nota mientras llegaba la respuesta, no aplica ese listado y vuelve a pedirlo una vez.

El Brief 24b.2 deja un solo indicador de avance en cada tarjeta de Post Venta: stepper grande en compu y la versión compacta en celular.

El Brief 25 cierra el panel de avisos al tocar uno (y navega al pedido si hay `orderId`), al clic afuera o con Escape. En celular el panel queda fijo bajo la campana. Un aviso emergente muestra las notificaciones app nuevas una sola vez (ids en `luminocity.notifSeen.<userId>`).

El Brief 25.1 deja el punto rojo solo con avisos app sin leer; los WhatsApp pendientes van en su sección y con un punto gris. Marcar leído (y todos) es optimista. Todo el toast es clickeable. No se edita un pedido entregado en el front ni con PATCH (409), salvo tracking de correo por encargado/admin.

El Brief 25.1.1 reordena el toast: la X es botón hermano y cierra con teclado sin abrir el aviso; el cuerpo es un botón real. En Nuevo Pedido, el mensaje de bloqueo distingue entregado de falta de permiso.

El Brief 24c deja al vendedor ver los reclamos cargados a su `sellerName`, no solo los que creó él. Cuando el encargado o el admin cambia el estado o agrega una nota, el vendedor dueño recibe un aviso in-app con `claimId`; al tocarlo abre Post Venta con el reclamo resaltado. Cada cambio y cada nota muestran quién lo hizo si el evento trae `by.userName`.

El Brief 26a pone en el Panel operativo el stepper y el botón de siguiente paso (`OrderFlowButtons`, `via=panel`) en cada tarjeta y en la tabla. Carga las hojas de ruta de las fechas visibles para `sheetPlanned` y muestra el chip de hoja o el link al Planificador; si fallan las hojas, el Panel sigue igual con un aviso chico.

El Brief 26a.1 pide las hojas de ruta del Panel solo si el rol puede abrir `/rutas` (encargado y admin). Depósito y vendedor no llaman al endpoint, no ven el aviso ni los chips/links de hoja, y `sheetPlanned` queda en false. Un 403 tampoco dispara el aviso; solo errores reales (red, 500).

El Brief 26b filtra el Panel por fecha de entrega (Atrasados, Hoy, Mañana, Esta semana, Todos) en la URL, con atrasados visibles también en Hoy y Esta semana. En celular, Tablero sin filtro de estado pasa a la lista "Para avanzar" y un desplegable de en viaje y entregados.

El Brief 26b.1 pide las hojas de todas las fechas visibles (también las atrasadas en Hoy y Esta semana) y arranca `narrow` con matchMedia para no parpadear las columnas en celular.

El Brief 27a suma el tipo de despacho `retiro` (Retiro por el local). En Nuevo Pedido aparece como tercera opción: sin transportista, chofer ni franja, y sin exigir dirección, entrecalles ni zona; siguen cliente, teléfono y fecha de retiro (por defecto hoy). El flujo es pendiente → preparado (con bultos) → entregado; depósito, encargado o admin marcan retirado con "Retirado por" (nombre obligatorio, DNI opcional). Un retiro no pasa a asignado. El vendedor recibe el aviso "Pedido P-x retirado por {nombre}". Las pantallas de Retiros y las exclusiones del planificador quedan para 27b y 27c.

El Brief 27a.1 trata un pedido sin `dispatchType` como entrega propia (`isOwnDelivery`), así el chofer puede pasar a en viaje y a entregado. Al cambiar un retiro a propia por PATCH sin dirección responde 400. Volver un retirado a preparado (solo admin) borra `receiverName` y `receiverDni`.

El Brief 27a.2 oculta la tarjeta de dirección en un retiro y no exige ni manda tipo de propiedad, piso, depto, timbre ni zona. Al guardar con campos vacíos muestra "Faltan datos" con la lista, hace scroll al primero y lo enfoca. Un 400 del server abre "No se pudo guardar".

El Brief 27c saca los retiros del cupo de franja, del selector de chofer, del Planificador y de las hojas de ruta. En Despacho y el Panel muestran el chip "Retiro por el local". Agregar un retiro a una hoja responde 409. Seguimiento usa "Listo para retirar" y "Retirado".

El Brief 27b agrega `/retiros` para pedidos de retiro por el local: chips Pendiente · Listo para retirar · Retirado, búsqueda y fechas como Seguimiento, y aviso opcional al cliente por `wa.me` (`POST /api/orders/:id/pickup-notice`) que queda en el historial.

El Brief 27b.1 abre WhatsApp en el mismo toque al avisar (popup `about:blank` como la campanita), permite volver a avisar y muestra "Sin teléfono" si el pedido no tiene número.

El Brief 28a agrupa el menú lateral en Operación, Seguimiento, Post Venta y Administración (plegables, con el grupo activo siempre abierto) y deja la barra de scroll fina, solo al pasar el mouse.

El Brief 28a.1 pone el logo de Luminocity en el login, el menú lateral y el favicon (`public/logo-luminocity.png`).

El Brief 28b muestra una barra superior con menú hamburguesa hasta 1024 px: el Sidebar entra como drawer, se cierra con fondo, Escape, X o al navegar, y el contenido no queda tapado por la barra.

El Brief 28b.1 deja el drawer cerrado con `inert` (fuera del Tab y del lector de pantalla) y, abierto, como `dialog` modal con el foco atrapado y la lista de focos recalculada en cada Tab.

El Brief 28c ubica el menú ⋯ de `OrderFlowButtons` con posición fija para que no se corte en celular, alineado al botón y por encima de las tarjetas.

El Brief 29b guarda un borrador de Nuevo pedido en `localStorage` (por usuario y modo alta/edición), ofrece recuperarlo al volver, avisa si hay que readjuntar un archivo grande y pide confirmación con `beforeunload` si hay cambios sin guardar.

El Brief 29c reintenta Ubicar hasta 3 veces con variantes de búsqueda, ofrece seguir buscando o ingresar a mano con "Ubicación pendiente", y pide confirmación al Cancelar si hay cambios sin guardar.

El Brief 29c.1 hace el timeout de Ubicar sin depender de `AbortSignal.any` (iPhone viejos) y evita que Escape o tocar afuera activen "Ingresar a mano".

El Brief 29c.2 pasa `allowOutsideClick` y `allowEscapeKey` en `confirm()` solo cuando vienen definidos, para que el resto de las confirmaciones sigan cerrándose con Escape o tocando afuera.

El Brief 30 agrega la prioridad del pedido (normal, alta, inmediata). El vendedor la elige al cargar y el encargado o el admin la cambian después; el cambio queda en el historial. Las listas ordenan inmediata, después alta, después normal, con chip naranja o rojo. Una inmediata avisa en la app al depósito y al encargado.

El Brief 30.1 trata un pedido entregado como prioridad normal al ordenar, para que no rompa listas mixtas ni las columnas del Panel.

El Brief 31 muestra en Pendientes de Entregas los pedidos abiertos unidos al picking, con filtros por vendedor, estado y fecha (en la URL), acceso de lectura para el vendedor y exportación CSV de lo filtrado.

El Brief 31.1 usa `downloadCsvFile` para el CSV, oculta los botones de flujo al vendedor en “Sin picking” y muestra “Sin vendedor asignado” si no tiene `sellerName`.

El Brief 32a unifica la paleta en tokens semánticos de `:root` / `@theme inline` (sin cambio visual) y centraliza nombre y logo en `src/config/brand.ts`, aplicables con variables `VITE_BRAND_*`.

El Brief 32b aplica la paleta clara (neutros slate, amarillo de marca) y pasa la sidebar, el drawer y el topbar a fondo claro, con estados y radios nuevos.

El Brief 32b.1 lee los colores de alerts, Leaflet y accentos desde los tokens CSS con `cssVar`.

El Brief 32c agrega los componentes base en `src/components/ui/` (Button, Card, Badge, Field, Input, Select, Textarea, PageHeader, EmptyState) con tokens y foco accesible. Como prueba, PriorityChip usa Badge y Pendientes de Entregas muestra el estado y los vacíos con Badge y EmptyState.

El Brief 32e reemplaza la sidebar por una barra superior con menús por teclado, deja el drawer móvil con la misma accesibilidad y agrega una paleta de comandos (Ctrl/Cmd+K) para ir a páginas y pedidos.

El Brief 32e.1 ajusta la accesibilidad de la paleta (aria-expanded y tabIndex) y evita dos menús abiertos a la vez, devolviendo el foco al disparador con Tab.

Los menús de la barra superior quedaban recortados o detrás de los mapas; ahora se abren en un portal con posición fija, el contenido queda aislado y las capas usan tokens --z-*.

El Brief 32e.3 saca los diálogos a un portal en `document.body` con `--z-modal` (1350, entre el drawer y la paleta). SweetAlert queda en esa capa, por encima de la barra y por debajo del toast. Los menús de la barra tienen altura máxima y scroll propio.

El Brief 33 muestra al chofer los pedidos atrasados, con prioridad y puntualidad. El planificador entra en una pantalla: selector, lista, acciones y mapa. Solo el chofer pasa a en viaje, y hace falta una hoja calculada que incluya sus asignados. La hoja se ve en Mis entregas, con recorrido en GPS y PDF opcional. En Nuevo pedido el tipo de despacho va primero y un retiro no guarda datos de entrega.

El Brief 33.1 muestra al chofer las hojas planificadas de hoy o anteriores que no estén cerradas, para que pueda iniciar el recorrido. Un pedido entregado no muestra la etiqueta de puntualidad. El GPS del recorrido usa solo las paradas pendientes, en orden, y no aparece si no queda ninguna. Las tarjetas de Mis entregas y del planificador usan el token de superficie, y `--text-muted` llega a contraste AA sobre el fondo y la superficie.

El Brief 33.2 guarda al cerrar la hoja la hora, los pedidos entregados y sin entregar, la zona de cada parada y los km (los de la ruta calculada, o una estimación haversine × 1,3 marcada como estimada). `GET /api/route-sheets/trips` lista los viajes del chofer logueado, o de cualquier chofer si entra el encargado o el admin, con filtro de fechas. Mis viajes separa pendientes y finalizados, resume el período y, desde Choferes o Usuarios, se exporta el CSV.

Las tarifas de viaje las cargan el encargado y el admin en Tarifas de viaje: un monto por viaje y, si hace falta, uno por km, con fecha de vigencia. Un viaje cobra la tarifa de esa fecha; si pasa por varias zonas, la que da el monto más alto. Sin tarifa se ven solo las cantidades. El CSV del encargado y del admin incluye el monto.

El Brief 33.3 guarda en la hoja en curso las paradas que se reprograman o se borran, con zona y sin entregar. Un pedido que ya no existe no cuenta como entregado, y el viaje se cobra si hubo al menos una entrega. El chofer, el encargado o el admin pueden finalizar el viaje a mano: las paradas pendientes quedan no entregadas y el pedido no cambia de estado. Al cerrar se congela el monto y la tarifa. El CSV manda km y monto como números con coma decimal, más estimado y no entregados. En Nuevo pedido, tipo de despacho y prioridad van en dos filas, cada una en un solo renglón.

El Brief 33.4, si un pedido sale de una hoja en curso y estaba en viaje, vuelve a asignado con el motivo de la hoja y el chofer deja de figurar en ruta cuando ya no tiene pedidos en viaje. Al finalizar a mano, esos pedidos pasan a asignado con "Viaje finalizado sin entregar"; los entregados no cambian y se apaga el seguimiento. En Mis viajes, realizados, km y lejanía cuentan solo hojas cerradas con alguna entrega. Las cerradas sin entregas siguen en Finalizados con el chip "Sin entregas" y en el CSV con el monto vacío. En Nuevo pedido, los botones de despacho pueden usar dos renglones centrados, en una sola fila y con letra de al menos 14px.

La paleta pasa a azul y grises suaves. El fondo, las tarjetas y el texto salen de tokens; el botón principal es el azul de acento y el amarillo queda en el logo. Los estados de pedido y de puntualidad usan fondo suave con texto y borde oscuros. El texto secundario da más de 4,5:1 sobre el fondo y las tarjetas. Mis entregas vuelve a ser solo del chofer: el encargado y el admin entran al Panel y, si abren esa ruta, vuelven ahí. Finalizan el viaje desde la tarjeta del chofer en Choferes en ruta.

El Brief 32g.2 muestra el período del Panel como un control segmentado: Atrasados, Hoy, Mañana, Esta semana y Todos. Tablero o Tabla queda en esa misma fila. En el Planificador, los pedidos de la fecha elegida que no están en una hoja aparecen arriba, agrupados por franja, y se suman al recorrido del chofer elegido. Si la hoja ya está confirmada y el orden no cambió, el botón queda en «Hoja de ruta confirmada».

El Brief 32j muestra en Mis entregas las hojas de los días siguientes, ordenadas por fecha y franja, y avisa «En hoja de ruta planificada» cuando el pedido ya tiene hoja. Las hojas del chofer se vuelven a pedir cada minuto y al volver a la pestaña. En Por planificar solo se eligen preparados, o asignados del chofer elegido; los pendientes se ven atenuados. El planificador se acomoda al ancho, titula el día y la franja, y Despacho usa los selects del kit. Las semanas de Pendientes y del Panel salen de la fecha de Buenos Aires. Los selectores del Panel se mueven con el teclado. En Pendientes de Entregas la barra va en tres filas (contadores, filtros y acciones) y el único primario, si falta el Excel, es «Cargar Excel al Sheet» del vacío. El buscador y el vendedor comparten la primera fila de filtros; Estado y Fecha quedan debajo.

El Brief 32j.1 usa el botón primario del kit en el siguiente paso del pedido. Hoy y mañana del Panel salen de la hora de Buenos Aires. Los pedidos se vuelven a pedir cada 30 segundos con la pestaña visible, y también al volver o al enfocar la ventana; el Panel hace lo mismo con las hojas, sin vaciarlas ni cerrar el pedido abierto.

El Brief 32j.2 no borra las hojas del Panel si el refresco falla por completo: deja las anteriores y marca el error. Un refresco silencioso de pedidos que salió antes de guardar, pasar de estado, borrar o importar se descarta si esa escritura ocurrió mientras la lista estaba en vuelo.

El Brief 32i deja un solo primario en Usuarios («Nuevo usuario») y pasa Guardar, resetear y activar a botones del kit. Tarifas de viaje y Datos maestros usan Field, Input y botones secundarios. Nuevo pedido usa el selector segmentado del Panel, con flechas, y los campos del kit; «Crear pedido» sigue siendo el único primario. Las fechas de alta de usuarios salen en hora de Buenos Aires. El detalle del pedido va en Card. Se borran `.dispatch-type`, `.text-button` y `.btn-ghost`. `.btn-primary` queda porque lo usan el login, el registro, la importación y el reintento. El hover de `bg-accent` queda porque otras pantallas todavía pintan acciones de azul.

El Brief 32i.1 pasa la Bandeja, Post venta, los diálogos de QR, el login, el registro, Reintentar y la importación de pedidos al botón del kit. En la Bandeja y en cada reclamo no hay primario: el de Post venta queda en «Guardar reclamo». Se borran `.btn-primary`, `.auth-submit` y el hover de `bg-accent`. El aviso de WhatsApp, el motivo de edición y el atajo de fecha dejan de pintarse de azul. Las tarjetas de Usuarios usan Card.

El Brief 32i.2 deja el motivo de edición y el aviso con `rounded-lg`, el radio del tema.

El Brief 32l suelta de la hoja cerrada los pedidos que no se entregaron, permite planificar los atrasados en la hoja de hoy y valida la salida por la hoja del pedido. El chofer inicia el viaje desde Mis entregas. El encargado puede marcar entregado con motivo, a su nombre. No se repiten choferes activos con el mismo nombre, y si una edición saca un pedido de su hoja se avisa para volver a planificarlo.

El Brief 32l.1 muestra en la franja de hoy los atrasados elegibles, con la marca Atrasado, y los suma al cupo cuando se tildan. El aviso de salir de la hoja queda solo para una edición del pedido; un cambio de estado deja el historial sin avisar. Una hoja cerrada no bloquea un segundo viaje de la misma franja: en el Planificador queda como historial, y sus paradas dicen Entregado o No entregado según el viaje.

El Brief 32l.3 deja en el detalle solo la prioridad actual del pedido. En una entrega propia el transportista queda con el nombre del chofer. Al finalizar un viaje con paradas sin entregar hace falta un motivo por cada una, queda en el historial y se avisa a encargados y admins.

El Brief 32l.4 deja el buscador de Seguimiento, Retiros y Post venta con el Input del kit: la lupa adentro, un solo borde y el foco en ese borde.

El Brief 32l.2 ensancha la columna izquierda del Planificador, deja el mapa más bajo y fijo al bajar, y no repite en Atrasados un pedido que ya está en la franja. El buscador del kit tiene nombre accesible. Al quitar el chofer de una entrega propia también se borran el transportista y el nombre del chofer.

El Brief 32l.5 deja el mapa del Planificador fijo debajo del encabezado y las pestañas, y vuelve el padding de 12px a las filas.

El Brief 32h lleva el layout de caja de lista a Despacho, Pendientes de Entregas, el Planificador, Choferes en ruta, Mis entregas y Mis viajes. En el escritorio la lista es una tabla y en el celular son filas; el detalle de un pedido se abre al costado. El día de hoy se calcula en hora de Buenos Aires. En el celular el logo queda visible y el buscador pasa a ser una lupa.

El Brief 33.6.2.1 deja el contador Abiertos solo con pedidos que no están entregados, y sin marcar si el filtro viene de un KPI. La barra lateral indica si está contraída, el cajón separa las áreas y el ítem activo es el único con página actual. Iniciar recorrido o Finalizar viaje pasan al título de Mis entregas. El encabezado y las pestañas crecen, y la barra queda en 220px, pegada a todo el alto de la pantalla. El alto del encabezado sale de `--header-top-h` y `--tabs-h`, y el subrayado de la pestaña activa es una línea de 2px con puntas redondeadas.

El Brief 33.6.1.1 deja los estados en colores claros al imprimir, para que se lean sobre el fondo blanco. El hover del botón primario pasa a `#1F7A32` y el de peligro a `#B62324`. En el Panel, Atrasados cuenta solo pedidos vigentes: pendiente, preparado, asignado o en viaje.

El Brief 33.6.2 arma el escritorio como una página de repositorio. El encabezado tiene dos filas: migas y buscador arriba, y una pestaña por área abajo. La barra lateral lista las páginas de esa área y se puede contraer. El título queda a la izquierda y la acción primaria a la derecha. La lista va en una caja con contadores y, si no hay pedidos, un estado vacío.

El Brief 33.6.1 pasa toda la app al tema oscuro de GitHub. El fondo y la barra son `#0D1117`, las tarjetas `#151B23` y el botón primario es verde. Los links y lo activo van en azul. El amarillo queda en el logo y la marca. La impresión y el QR siguen en claro para que se lean.

El Brief 33.6 cambia solo los tokens de color a la paleta clara de GitHub: fondo `#F6F8FA`, superficie `#FBFCFD` y acento `#0969DA`. El texto y la marca usan `#1F2328`. Los estados quedan con fondo suave y texto oscuro. El amarillo sigue en el logo y la marca.

El Brief 33.5 lista arriba en Choferes en ruta los viajes en curso, de cualquier fecha, aunque el chofer no tenga ubicación. Cada fila muestra chofer, fecha, franja y paradas pendientes, y Finalizar viaje abre el mismo modal. El botón sale de la tarjeta de ubicación. `GET /api/route-sheets` acepta `status=en_curso` sin fecha, solo para encargado y admin. La carga depende de las fechas unidas, así el intervalo no se reinicia en cada refresco. En cada pantalla queda un solo botón primario: en Choferes es el de confirmar el modal, y en Mis entregas es Iniciar recorrido o Finalizar viaje. Maps, los tramos del GPS y el resto van con borde; las acciones destructivas usan `#B91C1C`. El amarillo queda en el logo, el nombre de la marca y el auth-logo. El chip de prioridad usa el badge grande, el borde del badge es opcional y el botón ghost vuelve a ser transparente.

El Brief 32d deja los botones con jerarquía: primario azul, secundario con borde, ghost transparente, peligro relleno y peligro con borde. Los tamaños son 36, 44 y 52 px; en chofer y depósito se usa el grande. Input y Select acompañan esas alturas. La tabla tiene encabezado sticky, hover y scroll con sombra. KpiCard muestra valor, variación e ícono, y puede ser botón o link. Spinner y LoadState unifican cargando, error con Reintentar y vacío. SweetAlert usa la fuente, el radio y la superficie de la app: confirmar en azul, destructivo en rojo y cancelar con borde, en la capa del modal. En Post Venta los reclamos abiertos, en curso, resueltos y el tiempo promedio van en KpiCard, y la página usa LoadState. En viajes en curso no se cuentan pedidos borrados y, si no hay otro nombre, se muestra el del usuario chofer.

El Brief 32d.1 fija el encabezado de la tabla: con `maxHeight` queda dentro del recuadro, y sin ese alto queda fijo respecto de la página. La sombra del scroll horizontal se mantiene. En Despacho las acciones pasan a tamaño grande y el único primario es escanear el QR de entrega. La variación del KPI puede pedir tono éxito, error o neutro, aparte de la flecha. La carga de usuarios en Choferes en ruta no actualiza el estado si la pantalla ya se cerró.

El Brief 32d.2 deja la tabla en un solo elemento: `caption`, `thead` y `tbody`, con alto máximo `70vh` y encabezado fijo adentro. Cada columna puede pedir su ancho; si ninguna lo hace, el ancho es automático. Sin filas y sin `empty`, se muestra «Sin datos».

El Brief 32f sube la tipografía base a 16px. Las pantallas van en un contenedor de 1280px (768 en formularios, ancho completo en el planificador y el mapa) y el encabezado muestra migas: Inicio, grupo y página. Los filtros de Pendientes, Despacho, Post Venta, Retiros, Seguimiento, el Panel, Mis viajes y Choferes en ruta usan la misma barra; en el celular la búsqueda queda afuera y el resto se abre en una hoja.

El Brief 32f.1 deja 16px arriba en el celular y 24px desde escritorio, sin sumarlos al alto de la barra fija. Los títulos pasan a 24px y 28px; el del planificador sigue en 22px. En Pendientes la búsqueda se aplica con Enter o con Buscar. La pantalla de inicio del rol no muestra migas. Desde y Hasta de Retiros y Seguimiento entran en la barra, en grande en Mis viajes, Despacho y Retiros. En Post Venta, la pestaña Nuevo solo busca. El planificador, desde 1024px, deja la semana y los filtros arriba y el mapa a la derecha; en 1366×768 solo scrollea la columna de pedidos.

El Brief 32f.2 deja Borrar hoja con borde de peligro y el planificador entra en la ventana de escritorio: sin padding inferior del main y descontando los 24px de arriba. En Retiros y Seguimiento, ver todas las fechas es un botón secundario y Limpiar filtros vuelve a la semana actual. El botón Buscar usa el tamaño de la barra.

El Brief 32g.1 cierra el panel con Atrás hacia la página anterior cuando el pedido se abrió desde la lista. En el celular, el número del pedido es un botón con foco. En el Panel, el detalle se cierra si el pedido deja de verse, y Atrasados cuenta todos los pedidos abiertos, sin el filtro de fecha.

El Brief 32g abre el detalle del pedido en un panel lateral, sin salir de la lista. En escritorio, Pedidos y Preparación y la tabla del Panel usan Table; en el celular siguen las tarjetas. El id queda en `?pedido=`. El Panel muestra los contadores en KpiCard, con Atrasados, y un solo primario en el panel de detalle.

El Brief 36.2 abre el teléfono al tocar Llamar y deja el guion a la vista. El resultado se anota después: hasta entonces no se graba nada, no cambia el paso y no empieza la ventana de 48 h. Esa fecha se calcula al enviar el WhatsApp o al registrar la llamada, y es la misma que usa el servidor. El encargado y el admin pueden reasignar la reparación a otro técnico activo sin cambiar el paso, y ese técnico recibe el aviso.

El Brief 36.1 deja el circuito de reparación en el paso en que está. Levantar solo abre un ingreso nuevo; si el mismo técnico vuelve a tocarlo, no pasa nada, y el admin reasigna sin volver a diagnóstico. Una reparación entregada o rechazada no se levanta. El presupuesto llega a «enviado» solo con el aviso al cliente, y ese envío abre siempre una ventana nueva de 48 h. Volver a diagnóstico o a por levantar borra el vencimiento anterior. El reenvío solo se acepta mientras el presupuesto está enviado o vencido. En un teléfono fijo, el aviso es una llamada con el texto a la vista; el resultado abre la misma ventana que WhatsApp.

El Brief 36 suma el rol Técnico, que crean el admin o el encargado de depósito. Ve todos los reclamos en lectura y actúa solo sobre las reparaciones; el resto de la API responde 403. El depósito recibe el producto y abre la reparación: todos los técnicos reciben el aviso y uno la levanta. Garantía va de diagnóstico a reparación, lista y entregada. Cobro pasa por presupuesto, respuesta del cliente y, si acepta, la reparación. Los mensajes salen firmados «Luminocity — Servicio Técnico», por WhatsApp si el teléfono es celular o como guion de llamada si es fijo; la detección es conservadora y se puede corregir a mano. El presupuesto vence a las 48 h: se avisa al técnico y al encargado, el reenvío es manual y abre otra ventana de 48 h. Si el cliente rechaza, se avisa al vendedor. Nuevo reclamo es una entrada propia del menú. Reportes suma la sección de reparaciones.

El Brief 34.7, al editar la cantidad de un artículo manual, recalcula el estado de la fila. Si la cantidad sube, las unidades ya contadas se conservan y la fila deja de figurar completa cuando todavía faltan.

El Brief 34.6 deja cargar artículos a mano, con código y cantidad, mientras no haya CRM. En Mi preparación se agregan, editan y quitan si el pedido está pendiente: el encargado y el admin siempre, y depósito solo si lo tomó y la toma sigue activa. En el alta de Nuevo pedido el bloque es opcional y empieza cerrado. Cada fila guarda `source` excel, manual o crm; sin origen cuenta como excel. Reimportar el Excel no pisa las manuales ni las de CRM. `fetchCrmItems` queda listo para el día en que el CRM mande los artículos con source crm.

El Brief 34.5 vincula en el servidor las filas de picking sin pedido cuando el comprobante coincide con uno solo, al contar, al tomar y al armar. Mi preparación cuenta por comprobante solo esas filas, así cliente y servidor ven las mismas. Un retiro viejo sin PDF se puede editar; el PDF se vuelve a exigir si el pedido pasa a retiro, si cambia el adjunto o si es un alta. El cajón sigue mostrando «Sin PDF adjunto».

El Brief 34.3 muestra en Mi preparación la FC o nota de pedido, el PDF y los artículos, con código si el Excel lo trae y un contador por fila. Al importar el picking, o al crear o editar un pedido, el servidor vincula las filas sin pedido cuando el comprobante coincide con uno solo. En un retiro, el alta exige ese PDF y al menos un número de factura; `requiresInvoicePdf` es el gancho para el día en que el CRM los mande y el PDF deje de ser obligatorio. De pendiente a preparado solo se pasa desde Mi preparación: el resto de las pantallas abre esa cola.

El Brief 34.2, al tomar un pedido, pasa a en preparación solo las filas de picking que estaban pendientes: una ya preparada no pierde el avance. Al marcar armado el servidor recalcula el checklist y no frena el armado si el conteo que mandó el cliente quedó desactualizado. Nuevo pedido usa el ancho de la página. Desde 900px del formulario, tipo de despacho, prioridad y transportista van a la izquierda, y vendedor, cliente y dirección a la derecha; notas, adjuntos y el envío siguen a ancho completo. Tipo de despacho y Prioridad quedan separados en la tarjeta. En el celular el formulario sigue en una sola columna, en el mismo orden.

El Brief 34 le da al operario de depósito la pantalla Mi preparación, que pasa a ser su inicio. Tomar un pedido pendiente muestra la etiqueta «En preparación» con su nombre; el estado sigue siendo pendiente. Puede armarlo directo o después de tomarlo: quedan el autor, los bultos y la duración, que es la suma de las sesiones (una toma vencida se cierra a las 4 h). Si faltan artículos, queda armado incompleto y el checklist se puede completar después. Al armar se avisa al encargado; si el encargado deshace el armado o libera la toma de otro, se avisa al operario. En Pedidos y Preparación el encargado ve quién arma, cuánto tardó y los incompletos, y puede liberar. Reportes suma la preparación por operario. El alta de Nuevo pedido guarda el borrador en la sesión y lo recupera al recargar.

El Brief 35.4 quita los gráficos de Reportes y el interruptor Tabla / Gráfico. Cada sección vuelve a mostrar su tabla con la fila Total, y el PDF queda con los KPIs y las tablas.

El Brief 35.3 deja las columnas de Reportes en un modelo compartido para la pantalla, el CSV, el Excel y el PDF. Las tablas numéricas cierran con una fila Total; Atrasados, reclamos abiertos y retiros vencidos cierran con la cantidad. Encargado, admin y Gerencia exportan desde un menú secundario: CSV por sección, Excel con una hoja por sección y PDF en A4 horizontal. Excel y PDF se cargan recién al exportar y quedan en chunks aparte del resto de las pantallas. El layout usa container queries de 360px a escritorio. En Viajes del chofer, Exportar CSV pasa a secundario. El Panel operativo, para encargado y admin, exporta a Excel o PDF los pedidos visibles según el filtro de fecha y de estado.

El Brief 35.2 agrega en Por vendedor, Por zona y Por prioridad las columnas «% antes», «% con demora» y «Sin franja», también en el celular y en el CSV. El total del reporte de choferes suma las no entregas. En el celular, la fila de un atrasado es un botón de ancho completo: se enfoca y se abre con Enter. Gerencia sigue viendo esa fila como texto.

El Brief 35.1 mueve Descargar PDF de la hoja en Mis entregas al encabezado de Mis viajes, como botón secundario. Imprime el período y la pestaña elegida (Pendientes o Finalizados) junto con el resumen. Si no hay viajes en el período, queda deshabilitado. Pendientes y Finalizados, y Asignados y En viaje, usan el control segmentado: la opción activa se ve con borde y fondo, y el contador va en un badge.

El Brief 35 suma la pantalla Reportes para encargado, admin y el rol Gerencia. El período se elige en hora de Buenos Aires (si no se manda, son los últimos 30 días y no puede pasar de 366) y queda en `?desde=&hasta=`. Los datos salen de `GET /api/reports/deliveries`, `/drivers`, `/claims` y `/pickups`, con JWT y uno de esos tres roles. Con Postgres cada reporte agrega sobre jsonb; sin base, el mismo resultado se arma en JavaScript. Un entregado queda «Entregado antes», «En horario» (hasta 30 minutos después del fin de la franja) o «Entregado con demora»; entregar antes no baja el porcentaje. El monto a pagar es solo el sellado al cerrar el viaje. Los viajes en curso van aparte, sin sumarse, y si hay cotización se rotula «Estimado». Gerencia entra directo a Reportes, en lectura: no abre el pedido, no carga pedidos ni avisos, y el resto de la API responde 403. Cada tabla se exporta a CSV. La pantalla no tiene botón primario.

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 16c | Link de seguimiento para el cliente | **Pendiente** |
| 16d | WhatsApp Cloud API | **Pendiente** |
| 21 | Reclamos (`R-`) a la API. | **Pendiente** |
| — | Sacar los adjuntos del listado de pedidos y que el PATCH mande solo lo que cambia. | **Pendiente** |
| — | Datos maestros siguen en localStorage. Este brief no los pasa a Postgres. | **Pendiente** |
| — | Los tiles de OpenStreetMap y el OSRM demo no son para producción. Revisar más adelante. | **Pendiente** |
| — | Autorizar un cuarto pedido en la franja con el permiso de un solo uso del Brief 15. Esa autorización es para cargar a nombre de otro vendedor y no encaja acá: hoy solo el encargado o el admin lo confirman en el momento. | **Pendiente** |
| — | Sincronización de stock en tiempo real con el CRM de la empresa, por API key. | **Pendiente** |

## Decisiones

- Los pedidos se guardan en el server. Sin `DATABASE_URL` van a JSON en `server/data`. Con `DATABASE_URL` van a Postgres, una tabla por colección. Los datos maestros siguen en el navegador. La auth ya está en el server.
- En producción hacen falta `DATABASE_URL` y `JWT_SECRET`. No se crea el usuario demo. El front y la API salen del mismo proceso. `create-admin` crea solo el primer admin. El resto de las cuentas las da de alta el admin desde Usuarios.
- La contraseña se hashea con bcrypt en el server. El navegador solo guarda el JWT.
- El rol filtra el menú y la API. En desarrollo el registro público crea `vendedor` y rechaza un nombre o email que ya use otra cuenta. En producción el registro responde 403. No carga `sellerName`.
- El vendedor ve y edita por `sellerName`, no por el nombre de la cuenta. Sin vínculo no puede cargar pedidos. El admin o el encargado lo elige en Usuarios, desde los vendedores de datos maestros. Una cuenta admin solo la edita un admin. Al editar no puede cambiar el vendedor del pedido.
- El chofer ve los pedidos con su `driverId`. Si el pedido no tiene chofer, los ve por su `carrierName`. Sin `driverId` en el pedido y sin vínculo no ve nada. El admin o el encargado elige el transportista en Usuarios. Una cuenta admin solo la edita un admin.
- La hoja de ruta es una por chofer, fecha y franja. Se guarda en `routeSheets`. Al confirmar, los preparados pasan a asignado. Al iniciar, pasan a en viaje. Cuando todos quedan entregados o ya no existen (cancelar borra el pedido), la hoja se cierra. Si cambia el despacho de un pedido en una hoja planificada, sale de la hoja; en una en curso, el cambio se rechaza salvo entregar.
- El estado del pedido solo cambia por `POST /api/orders/:id/transition`. El `PATCH` no acepta `status`. Las transiciones válidas y los roles están en `orderFlow.js`. Cada cambio se anota en `history`.
- Una carga a nombre de otro vendedor exige una autorización aprobada y sin usar. Se marca usada en la misma escritura que guarda el pedido. Al pedirla se avisa al encargado.
- Un chofer tiene como máximo 3 pedidos por `timeWindow` y `deliveryDate`. El cuarto responde 409 `FRANJA_LLENA`, salvo que encargado o admin manden `override: true`. Eso queda en `slotOverrides` del pedido.
- La edición de un preparado por el vendedor no cambia el pedido hasta que el encargado la aprueba o la rechaza. Si el pedido ya avanzó, aprobar responde 409. El vendedor recibe el aviso de aprobado o rechazado.
- No se puede desactivar ni sacar el rol al último administrador activo. Nadie se desactiva a sí mismo. Un usuario inactivo no entra y el token que ya tenía deja de servir.
- A `preparado` se pasa solo con una cantidad de bultos.
- Entrega propia y correo tienen listas de transportistas distintas, editables en Datos maestros.
- El QR de la carátula busca el pedido o confirma la entrega.
- Despacho ya filtra por transportista y agrupa `asignado` con `en-viaje`. Mis entregas separa asignados (preparado y asignado) de en viaje.
- El aviso de WhatsApp se abre con `wa.me` y queda `enviado`. El link de seguimiento para el cliente y la API de WhatsApp Cloud siguen pendientes.
- La ubicación del chofer es solo la última posición, contada por `driverId` (y por transportista solo si el pedido no tiene chofer). Se borra al cerrar el último en viaje o la sesión. La ven el encargado y el admin.
- El backend va con Express + JWT, en línea con RendiYa (otro proyecto del mismo autor).
- Se trabaja en `main` para no perder avances en ramas sueltas; primero que funcione, después el pulido visual.
