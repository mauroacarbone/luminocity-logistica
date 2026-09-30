# Roles

Hoy cualquier usuario logueado ve y puede usar todas las pantallas. El rol se guarda en el login (`vendedor | deposito | chofer | admin`) y se muestra en el sidebar, pero no filtra el menú ni las acciones. Eso es **Pendiente**, Brief 15.

`encargado_deposito` todavía no está en `ROLES` (`src/lib/authStore.ts`). Se agrega en el Brief 15. Abajo figura la regla de negocio prevista, no un permiso que el código ya aplique.

Las pantallas son las rutas de `src/App.tsx`. `/login` y `/registro` son públicas.

## Vendedor

Cargar el pedido del cliente y saber si logística ya lo preparó o lo mandó.

- Ve: Panel Operativo, Nuevo Pedido, Pedidos y Preparación (solo lectura), Despacho (solo lectura), Post Venta.
- Puede: crear y editar el pedido (queda en `pendiente`), adjuntar un archivo, abrir un reclamo y mover sus estados.
- No puede: pasar a `preparado`, armar picking, cambiar estados de despacho, planificar la ruta ni tocar datos maestros.
- Estados: solo crea en `pendiente`. No mueve la cadena operativa.
- Primero le sirve: el Panel, para ver los suyos, y Nuevo Pedido para cargar.

## Depósito

Dejar listo lo que se entrega hoy.

- Ve: Panel Operativo, Pedidos y Preparación, Despacho (solo lectura), Pendientes de Entregas.
- Puede: marcar `pendiente` → `preparado` indicando la cantidad de bultos. Cargar el Excel de picking y tildar líneas.
- No puede: dar de alta el pedido comercial, pasar de `preparado`, confirmar la entrega, abrir reclamos ni editar datos maestros.
- Estados: `pendiente` → `preparado`.
- Primero le sirve: Pedidos y Preparación del día, y el picking de Pendientes de Entregas.

## Encargado de depósito

**Pendiente** (Brief 15). Supervisar la preparación y corregir si hay que rearmar.

- Ve las mismas pantallas que depósito, más el Planificador de Rutas en solo lectura.
- Puede lo mismo que depósito y, además, volver `preparado` → `pendiente` y cancelar un pedido que todavía no salió.
- No puede: despachar, confirmar entrega ni editar datos maestros.
- Estados: `pendiente` ↔ `preparado`, y cancelar antes del despacho.
- Primero le sirve: qué sigue en `pendiente` y qué volvió a preparación.

## Chofer

Entregar y dejar constancia.

- Ve: Panel Operativo (solo lectura), Despacho, Planificador de Rutas (solo lectura).
- Puede: pasar `preparado` → `asignado` → `en-viaje` → `entregado`. Confirmar entrega con el QR de la carátula.
- No puede: crear ni editar el pedido, preparar, hacer picking, abrir reclamos ni tocar datos maestros.
- Estados: de `preparado` en adelante, hasta `entregado`.
- Primero le sirve: Despacho del día (dirección, bultos, franja, transportista).
- GPS en vivo, orden por cercanía y WhatsApp de "en camino" son **Pendiente**, Brief 16. Hoy el planificador ordena paradas en el mapa, sin seguimiento del cliente.

Hoy el menú Estado de Despacho deja elegir cualquier estado, también a quien no es chofer. El límite de arriba se aplica recién en el Brief 15.

## Admin

Que la operación no se trabe y los listados estén bien.

- Ve y edita todas las pantallas, incluidos Datos maestros.
- Puede mover cualquier estado del pedido y del reclamo.
- Primero le sirve: el Panel y Datos maestros (vendedores, transportistas, zonas, franjas, tipos de propiedad).

## Rol × pantalla

Valores previstos para el Brief 15. Hoy, en el código, todas las celdas de un usuario logueado son **editar**.

| Pantalla | Ruta | Vendedor | Depósito | Encargado de depósito | Chofer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Panel Operativo | `/` | ver | ver | ver | ver | ver |
| Nuevo Pedido | `/nuevo-pedido` | editar | sin acceso | sin acceso | sin acceso | editar |
| Pedidos y Preparación | `/pedidos` | ver | editar | editar | sin acceso | editar |
| Despacho | `/despacho` | ver | ver | ver | editar | editar |
| Planificador de Rutas | `/rutas` | sin acceso | sin acceso | ver | ver | editar |
| Pendientes de Entregas | `/pendientes` | sin acceso | editar | editar | sin acceso | editar |
| Post Venta | `/post-venta` | editar | sin acceso | sin acceso | sin acceso | editar |
| Datos maestros | `/datos-maestros` | sin acceso | sin acceso | sin acceso | sin acceso | editar |

`ver` es consulta. `editar` incluye las acciones de esa pantalla. `sin acceso` no muestra el ítem del menú.
