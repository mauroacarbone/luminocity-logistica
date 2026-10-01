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

El Brief 13 mueve el login y el registro a Express: JWT, bcrypt y usuarios en `server/data/users.json`. Los pedidos siguen en el navegador.

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 14 | API de pedidos. Salen de `localStorage`. | **Pendiente** |
| 15 | Roles y menús. `encargado_deposito` ya se puede guardar; el menú todavía no filtra. | **Pendiente** |
| 16 | Vista Chofer: orden por cercanía, filtro por transportista, asignado / en viaje, GPS en vivo para el seguimiento del cliente, WhatsApp "en camino", marcar entregado. | **Pendiente** |
| 17 | Pulido visual. | **Pendiente** |

## Decisiones

- Los pedidos quedan en el navegador hasta el Brief 14. La auth ya está en el server.
- La contraseña se hashea con bcrypt en el server. El navegador solo guarda el JWT.
- El rol se guarda en el usuario y no cambia el menú. `encargado_deposito` ya es un rol válido de auth; el filtro del menú es el Brief 15.
- A `preparado` se pasa solo con una cantidad de bultos.
- Entrega propia y correo tienen listas de transportistas distintas, editables en Datos maestros.
- El QR de la carátula busca el pedido o confirma la entrega.
- Despacho ya filtra por transportista y agrupa `asignado` con `en-viaje`. El Brief 16 los pide en la vista del chofer.
- La vista Chofer (Brief 16) va después del backend, porque necesita ubicación en vivo.
- El backend va con Express + JWT, en línea con RendiYa (otro proyecto del mismo autor).
- Se trabaja en `main` para no perder avances en ramas sueltas; primero que funcione, después el pulido visual.
