# Luminocity Logística

Luminocity vende artefactos lumínicos. Esta app es la operación de logística: cargar pedidos, prepararlos, despacharlos y seguir reclamos.
Los pedidos viven en el navegador hasta el Brief 14. La auth está en `server/`. Qué brief está hecho y cuál sigue: `HISTORY.md`.

## Stack y carpetas

React 19, Vite, TypeScript, React Router. Estilos en `src/index.css` (Tailwind 4).

| Carpeta | Qué hay |
| --- | --- |
| `src/pages/` | Una pantalla por ruta |
| `src/state/` | Contextos: auth, pedidos, picking, reclamos, catálogo |
| `server/` | Auth: Express, JWT y usuarios en JSON |
| `src/lib/` | Persistencia, token de sesión, zona, geocodificación, rutas, adjuntos, Excel de picking |
| `src/data/` | Tipos y semillas: pedido, reclamo, catálogo |
| `src/layout/` | Sidebar, shell y tarjeta de login |
| `src/components/` | Diálogos de QR, carátula y link del adjunto |

Rutas: `src/App.tsx`. Menú: `src/layout/Sidebar.tsx`.

## Cómo trabajar

- Un brief a la vez, en `main`. Primero que funcione, después el pulido.
- Al terminar cada brief, actualizar `HISTORY.md`.
- No agregar features fuera del brief. No dejar código muerto.
- No inventar pantallas, datos ni integraciones. Lo que no está en el código es **Pendiente**.
- No adelantar los briefs 14 (API de pedidos) ni 15 (menú por rol).
- El login acepta `vendedor`, `deposito`, `encargado_deposito`, `chofer` o `admin`. Cualquier usuario logueado ve todo el menú. El filtro por rol es el Brief 15. La matriz de abajo es la regla prevista, no un permiso que el código ya aplique.

## Roles

Pantallas reales de `src/App.tsx`. `/login` y `/registro` son públicas.

### Vendedor

Cargar el pedido y saber si ya se preparó o salió.

- Pantallas: Panel (ver), Nuevo Pedido (editar), Pedidos y Preparación (ver), Despacho (ver), Post Venta (editar).
- Puede: crear y editar el pedido en `pendiente`, adjuntar un archivo, abrir un reclamo.
- No puede: pasar a `preparado`, picking, estados de despacho, planificar la ruta, datos maestros.
- Estados: crea en `pendiente`. No mueve la cadena operativa.
- Primero: el Panel y Nuevo Pedido.

### Depósito

Dejar listo lo que se entrega hoy.

- Pantallas: Panel (ver), Pedidos y Preparación (editar), Despacho (ver), Pendientes de Entregas (editar).
- Puede: `pendiente` → `preparado` con cantidad de bultos. Cargar el Excel de picking y tildar líneas.
- No puede: alta comercial, pasar de `preparado`, confirmar entrega, reclamos, datos maestros.
- Estados: `pendiente` → `preparado`.
- Primero: Pedidos y Preparación del día, y el picking.

### Encargado de depósito

**Pendiente** (Brief 15). Supervisar la preparación y corregir si hay que rearmar.

- Pantallas: las de depósito, más Planificador de Rutas (ver).
- Puede: lo de depósito, volver `preparado` → `pendiente` y cancelar un pedido que no salió.
- No puede: despachar, confirmar entrega, datos maestros.
- Estados: `pendiente` ↔ `preparado`, y cancelar antes del despacho.
- Primero: qué sigue en `pendiente` y qué volvió a preparación.

### Chofer

Entregar y dejar constancia.

- Pantallas: Panel (ver), Despacho (editar), Planificador de Rutas (ver).
- Puede: `preparado` → `asignado` → `en-viaje` → `entregado`. Confirmar con el QR de la carátula.
- No puede: crear ni editar el pedido, preparar, picking, reclamos, datos maestros.
- Estados: de `preparado` hasta `entregado`.
- Primero: Despacho del día (dirección, bultos, franja, transportista).
- GPS, orden por cercanía y WhatsApp "en camino" son **Pendiente**, Brief 16. Hoy el menú Estado de Despacho deja cualquier estado a cualquiera; el límite es el Brief 15.

### Admin

Que la operación no se trabe y los listados estén bien.

- Pantallas: todas, Datos maestros incluido (editar).
- Puede: cualquier estado del pedido y del reclamo.
- Primero: el Panel y Datos maestros.

### Rol × pantalla

Previsto para el Brief 15. Hoy, con sesión, todo es editar.

| Pantalla | Ruta | Vendedor | Depósito | Encargado | Chofer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Panel Operativo | `/` | ver | ver | ver | ver | ver |
| Nuevo Pedido | `/nuevo-pedido` | editar | sin acceso | sin acceso | sin acceso | editar |
| Pedidos y Preparación | `/pedidos` | ver | editar | editar | sin acceso | editar |
| Despacho | `/despacho` | ver | ver | ver | editar | editar |
| Planificador de Rutas | `/rutas` | sin acceso | sin acceso | ver | ver | editar |
| Pendientes de Entregas | `/pendientes` | sin acceso | editar | editar | sin acceso | editar |
| Post Venta | `/post-venta` | editar | sin acceso | sin acceso | sin acceso | editar |
| Datos maestros | `/datos-maestros` | sin acceso | sin acceso | sin acceso | sin acceso | editar |

`ver` es consulta. `editar` incluye las acciones de esa pantalla. `sin acceso` no muestra el ítem.

## Negocio

Estados del pedido: `pendiente` → `preparado` → `asignado` → `en-viaje` → `entregado`.

1. Carga en Nuevo Pedido (`P-` y siete dígitos). Queda en `pendiente`. Pide vendedor, cliente, teléfono, dirección, al menos una entrecalle, tipo de propiedad y fecha. La zona sale de la dirección o se elige a mano.
2. Depósito lo marca `preparado` e indica bultos. Desde ahí se edita o se cancela.
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

Datos maestros puede cambiar zonas, franjas (`10:00-15:00`, `09:00-13:00`, `15:00-19:00`) y tipos de propiedad (casa, departamento, obra, local, edificio, oficina). El planificador arma la recorrida de lo que no está `entregado`. Origen por defecto: Warnes 986, Buenos Aires. Sin GPS del chofer: **Pendiente**, Brief 16.

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
