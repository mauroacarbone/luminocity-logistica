# Negocio

Luminocity entrega artefactos lumínicos. Logística entra el pedido, lo prepara en depósito, lo despacha y, si el cliente reclama, lo sigue en post venta.

## Ciclo del pedido

Estados reales (`src/data/orders.ts`): `pendiente` → `preparado` → `asignado` → `en-viaje` → `entregado`.

1. **Carga.** Nuevo Pedido crea el pedido en `pendiente`. Id `P-` más siete dígitos. Pide vendedor, cliente, teléfono, dirección, al menos una entrecalle, tipo de propiedad y fecha de entrega. La zona sale de la dirección, o se elige a mano.
2. **Preparado.** En Pedidos y Preparación, depósito marca preparado y carga cuántos bultos son. Recién ahí el pedido deja `pendiente`. Desde esa pantalla también se edita o se cancela.
3. **Despacho.** Despacho agrupa por día. `asignado` y `en-viaje` comparten la solapa de viaje. Se imprime la carátula con QR. Escanear ese QR puede buscar el pedido o confirmar la entrega (`entregado`).
4. **Post venta.** No es un estado del pedido. Es un reclamo aparte, con su propio ciclo. Se puede buscar un pedido existente para copiar cliente y facturas; no es obligatorio.

El Panel Operativo muestra los cinco estados en tablero o tabla. No cambia el estado: sirve para mirar y entrar a editar.

## Tipo de despacho

En el pedido, `dispatchType` es `propia` (entrega propia) o `correo` (correo / courier).

Cada tipo tiene su lista de transportistas, editable en Datos maestros:

- Propia: Entrego ya!, Oscar, Via cargo, Eventual, Dario, Expreso, Hormiga. Más los que se agreguen.
- Correo: Andreani, Correo Argentino, Via Cargo, Entrego ya!, Oca. Más los que se agreguen.

El transportista se elige al cargar el pedido y queda para cuando llegue a Despacho. Despacho filtra por esa lista.

## Zonas y días

La zona es el área de reparto, con los días en los que se entrega. Semilla:

| Zona | Días |
| --- | --- |
| CABA | Lun a Sáb |
| GBA Norte | Lun · Jue |
| GBA Oeste | Mar · Vie |
| GBA Sur | Jue |
| Provincia | Sin días |

Datos maestros puede agregar, renombrar o borrar zonas. La dirección también guarda entrecalle, tipo de propiedad (casa, departamento, obra, local, edificio, oficina) y franja horaria (`10:00-15:00`, `09:00-13:00`, `15:00-19:00`, o las que se carguen).

El planificador arma la recorrida del día con los pedidos que no están `entregado`. El origen por defecto es Warnes 986, Buenos Aires. Ordena paradas y muestra el mapa. No hay GPS del chofer en vivo: eso es **Pendiente**, Brief 16.

## Reclamos de post venta

Se abren cuando hay un problema después de la venta, no como paso obligatorio del pedido. Motivos:

- Falla técnica / garantía
- Error de despacho (producto equivocado)
- Faltante de accesorios
- Arrepentimiento (producto apto para volver a la venta)
- Faltante de mercadería

Id `R-` más siete dígitos. Arranca en `nuevo`. Estados: recepción de producto, pendiente de retiro del cliente, enviado al proveedor, reparación, entregado al cliente, cancelado. Cada cambio queda en el historial, con nota opcional.

Se pueden adjuntar hasta 5 fotos y un archivo. Hay listado de abiertos, finalizados, cancelados y un tablero.

## Glosario

| Término | Qué es |
| --- | --- |
| Bulto | Caja o paquete físico del pedido. Depósito carga cuántos son al marcarlo preparado. |
| Carátula | Hoja del pedido con QR, impresa desde Despacho, para identificarlo en la entrega. |
| Zona | Área de reparto y los días en los que se visita. |
| Transportista | Quién lleva el pedido: flota propia o correo, según el tipo de despacho. |
| Despacho | Salida del pedido: asignarlo, mandarlo y confirmar que llegó. También es la pantalla `/despacho`. |
| Reclamo | Caso de post venta, separado del estado del pedido. |
