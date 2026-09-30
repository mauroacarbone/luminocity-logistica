# Roadmap

Hecho es lo que ya está en `main`. El orden 1–6 entró junto en un merge; el tema sale de lo que hace el código, no de un título guardado en el commit.

## Hechos

| Brief | Tema | Estado |
| --- | --- | --- |
| 1 | Panel operativo y menú | Hecho |
| 2 | Nuevo pedido | Hecho |
| 3 | Preparación, despacho, planificador de rutas y pendientes de entrega | Hecho |
| 4 | Post venta: alta y seguimiento de reclamos | Hecho |
| 5 | Persistencia de pedidos y picking en el navegador | Hecho |
| 6 | Marcar preparado con cantidad de bultos | Hecho |
| 7 | Zona de reparto según la dirección, y estado Asignado en el panel | Hecho |
| 8 | Adjunto del pedido | Hecho |
| 9 | Reclamos persistidos, con fotos y archivo | Hecho |
| 10 | Datos maestros editables | Hecho |
| 11 | Carátula con QR, y despacho propio o correo | Hecho |
| 12 | Login local: email, contraseña hasheada y sesión | Hecho |

## Pendientes

En este orden. No adelantar el siguiente.

| Brief | Tema | Estado |
| --- | --- | --- |
| 13 | Auth con Express + JWT. Bcrypt en el server, en lugar del hash del navegador. | **Pendiente** |
| 14 | API de pedidos. Salen de `localStorage`. | **Pendiente** |
| 15 | Roles y menús. Incluye `encargado_deposito`, que hoy no existe. | **Pendiente** |
| 16 | Vista Chofer: orden por cercanía, GPS en vivo para el seguimiento del cliente, WhatsApp "en camino", marcar entregado. | **Pendiente** |
| 17 | Pulido visual. | **Pendiente** |

El Brief 16 no reemplaza Despacho ni el planificador actuales: suma la vista del chofer. Marcar entregado hoy ya existe en Despacho (menú de estado y QR); la vista propia del chofer es lo que falta.
