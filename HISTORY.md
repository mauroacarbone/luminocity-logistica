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

El Brief 13 mueve el login y el registro a Express: JWT, bcrypt y usuarios en `server/data/users.json`.

El Brief 14 guarda los pedidos en `server/data/orders.json`; el navegador los usa por la API y los datos maestros siguen en localStorage.

El Brief 15 filtra menú y API por rol. El registro crea vendedor. El encargado autoriza cargas a nombre de otro y confirma ediciones de un preparado. Los avisos de la app ya se guardan; el WhatsApp queda pendiente de envío.

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 16 | Vista Chofer: orden por cercanía, filtro por transportista, asignado / en viaje, GPS en vivo para el seguimiento del cliente, WhatsApp "en camino", marcar entregado. Avisar al vendedor por WhatsApp cuando se carga su pedido y seguirlo hasta la entrega, con aviso de entregado. Primero con un link `wa.me`; después con WhatsApp Business Cloud API si la empresa lo aprueba. Hay que enviar los avisos con `channel` `whatsapp` y `status` `pendiente`. | **Pendiente** |
| 17 | Pulido visual. Confirmaciones con SweetAlert2 para las acciones que cambian datos: cambiar estado, asignar transportista, marcar entregado y borrar. | **Pendiente** |
| 18 | Reclamos (`R-`) a la API. | **Pendiente** |
| 19 | Sacar los adjuntos del listado de pedidos y que el PATCH mande solo lo que cambia. | **Pendiente** |

## Decisiones

- Los pedidos se guardan en el server (`server/data/orders.json`). Los datos maestros siguen en el navegador. La auth ya está en el server.
- La contraseña se hashea con bcrypt en el server. El navegador solo guarda el JWT.
- El rol filtra el menú y la API. El registro público crea `vendedor` y rechaza un nombre o email que ya use otra cuenta. No carga `sellerName`.
- El vendedor ve y edita por `sellerName`, no por el nombre de la cuenta. Sin vínculo no puede cargar pedidos. Solo admin lo elige en Usuarios, desde los vendedores de datos maestros. Al editar no puede cambiar el vendedor del pedido.
- Una carga a nombre de otro vendedor exige una autorización aprobada y sin usar. Se marca usada en la misma escritura que guarda el pedido. Al pedirla se avisa al encargado.
- La edición de un preparado por el vendedor no cambia el pedido hasta que el encargado la aprueba o la rechaza. Si el pedido ya avanzó, aprobar responde 409. El vendedor recibe el aviso de aprobado o rechazado.
- No se le puede sacar el rol al último administrador.
- A `preparado` se pasa solo con una cantidad de bultos.
- Entrega propia y correo tienen listas de transportistas distintas, editables en Datos maestros.
- El QR de la carátula busca el pedido o confirma la entrega.
- Despacho ya filtra por transportista y agrupa `asignado` con `en-viaje`. El Brief 16 los pide en la vista del chofer.
- La vista Chofer (Brief 16) va después del backend, porque necesita ubicación en vivo.
- El backend va con Express + JWT, en línea con RendiYa (otro proyecto del mismo autor).
- Se trabaja en `main` para no perder avances en ramas sueltas; primero que funcione, después el pulido visual.
