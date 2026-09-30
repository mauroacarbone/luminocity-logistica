# Arquitectura

Todo persiste en `localStorage` del navegador. No hay servidor. La contraseña no se guarda en texto plano: es SHA-256 con salt por usuario (`sha256$<salt>$<hash>`). El Brief 13 lo reemplaza por bcrypt en el server.

## Providers

Árbol de `src/main.tsx`, de afuera hacia adentro:

| Provider | Maneja |
| --- | --- |
| `AuthProvider` | Usuarios, sesión, login, registro y salir. |
| `CatalogProvider` | Vendedores, transportistas, zonas, tipos de propiedad y franjas. |
| `OrdersProvider` | Alta, edición y baja de pedidos. |
| `PickingProvider` | Líneas del Excel de picking y si cada una está lista. |
| `ClaimsProvider` | Reclamos, su estado y las notas. |

`BrowserRouter` envuelve a los cinco. Sin sesión, `App` manda a `/login`. Con sesión, `AppShell` muestra el sidebar y la ruta.

## localStorage

| Clave | Forma |
| --- | --- |
| `luminocity.users.v1` | `StoredUser[]` |
| `luminocity.session.v1` | `Session` (un objeto, no una lista) |
| `luminocity.orders.v1` | `Order[]` |
| `luminocity.picking.v1` | `PickingLine[]` |
| `luminocity.claims.v1` | `Claim[]` |
| `luminocity.catalog.v1` | Objeto de catálogo, no una lista |

Si una lista no pasa la validación, se borra la clave y se vuelve a la semilla o a vacío. Un catálogo viejo que solo tenía `transporters` se parte en entrega propia y correo.

### Catálogo

`sellers`, `ownTransporters`, `courierTransporters`, `propertyTypes` y `timeWindows` son `string[]`. `zones` es `{ name, days }[]`.

### Picking

`{ id, invoice, client, seller, product, quantity, ready, date? }`. El Excel pide columnas de factura, cliente y producto. No es el mismo registro que el pedido `P-`.

## Modelos

### Usuario y sesión

`StoredUser`: `id`, `name`, `email`, `passwordHash`, `role`.

`role` hoy: `vendedor | deposito | chofer | admin`.

`Session`: `userId`, `email`, `name`, `role`. No incluye el hash.

El demo `mauro@luminocity.local` / `demo1234` se crea solo si no hay usuarios. Ver `README.md`.

### Pedido

`Order` en `src/data/orders.ts`.

Obligatorios en el tipo: `id`, `client`, `loadedAt`, `deliveryDate`, `status`.

Opcionales: `zone`, `address`, `packages`, `seller`, `phone`, `invoices`, `collectOnDelivery`, `amount`, `betweenStreet1`, `betweenStreet2`, `propertyType`, `timeWindow`, `requiresPickup`, `dispatchType` (`propia | correo`), `transporter`, `notes`, `attachmentName`, `attachmentDataUrl`, `receiverName`, `receiverDni`.

`status`: `pendiente | preparado | asignado | en-viaje | entregado`.

### Reclamo

`Claim` en `src/data/claims.ts`.

`id`, `client`, `invoices`, `phone`, `email`, `seller`, `motive`, `description`, `products` (`{ name, quantity }[]`), `photoNames`, `photos?` (hasta 5, `{ name, dataUrl }`), `attachmentName`, `attachment?`, `status`, `createdAt`, `resolvedAt?`, `events` (`{ at, status, note? }[]`).

`status`: `nuevo | recepcion | pendiente-retiro | enviado-proveedor | reparacion | entregado | cancelado`.

## Hacia el backend

**Pendiente.** El camino, en línea con RendiYa, es Express + JWT: la contraseña se hashea en el server y el cliente guarda un token, no el usuario.

- Brief 13: auth. Reemplaza `luminocity.users.v1`, `luminocity.session.v1` y el SHA-256 del cliente.
- Brief 14: API de pedidos. Reemplaza `luminocity.orders.v1`.

En este repo no hay código de RendiYa ni rutas de API. No inventar endpoints hasta que el brief los escriba. Picking, reclamos y catálogo siguen en el navegador hasta un brief que los nombre.
