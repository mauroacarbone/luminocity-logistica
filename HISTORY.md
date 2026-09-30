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

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 13 | Auth con Express + JWT. Bcrypt en el server, en lugar del hash del navegador. | **Pendiente** |
| 14 | API de pedidos. Salen de `localStorage`. | **Pendiente** |
| 15 | Roles y menús. Incluye `encargado_deposito`, que hoy no existe. | **Pendiente** |
| 16 | Vista Chofer: orden por cercanía, filtro por transportista, asignado / en viaje, GPS en vivo para el seguimiento del cliente, WhatsApp "en camino", marcar entregado. | **Pendiente** |
| 17 | Pulido visual. | **Pendiente** |

## Decisiones

- Los datos quedan en el navegador hasta el Brief 13 (auth) y el 14 (pedidos).
- La contraseña no se guarda en claro: SHA-256 con salt por usuario. El Brief 13 lo reemplaza por bcrypt en el server.
- El rol se guarda en la sesión y no cambia el menú. El filtro, y el rol `encargado_deposito`, son el Brief 15.
- A `preparado` se pasa solo con una cantidad de bultos.
- Entrega propia y correo tienen listas de transportistas distintas, editables en Datos maestros.
- El QR de la carátula busca el pedido o confirma la entrega.
- Despacho ya filtra por transportista y agrupa `asignado` con `en-viaje`. El Brief 16 los pide en la vista del chofer.
