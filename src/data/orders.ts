export type OrderStatus =
  | 'pendiente'
  | 'preparado'
  | 'asignado'
  | 'en-viaje'
  | 'entregado'

export type Order = {
  id: string
  client: string
  zone?: string
  loadedAt: string
  deliveryDate: string
  status: OrderStatus
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendientes',
  preparado: 'Preparados',
  asignado: 'Asignados',
  'en-viaje': 'En viaje',
  entregado: 'Entregados',
}

export const STATUS_ORDER: OrderStatus[] = [
  'pendiente',
  'preparado',
  'asignado',
  'en-viaje',
  'entregado',
]

const deliveredNames = [
  ['P-0334490', 'Daniel Rinenberg', '16/09/2026, 05:25 p. m.', '2026-09-17'],
  ['P-3243777', 'ADRIANA WAISAN', '10/09/2026, 03:00 p. m.', '2026-09-12'],
  ['P-8939245', 'JULIAN AMPARICIO', '10/09/2026, 11:02 a. m.', '2026-09-10'],
  ['P-7072056', 'Joaquin Maria Benedetti', '09/09/2026, 09:31 a. m.', '2026-09-10'],
  ['P-3042926', 'Local Warnes', '08/09/2026, 04:12 p. m.', '2026-09-09'],
  ['P-5510288', 'Obra Palermo', '08/09/2026, 11:40 a. m.', '2026-09-09'],
  ['P-4401922', 'Estudio Norte', '07/09/2026, 06:05 p. m.', '2026-09-08'],
  ['P-2281740', 'Casa Belgrano', '07/09/2026, 02:18 p. m.', '2026-09-08'],
  ['P-1193044', 'Showroom Centro', '06/09/2026, 10:22 a. m.', '2026-09-07'],
  ['P-8826411', 'Deposito Oeste', '05/09/2026, 03:47 p. m.', '2026-09-06'],
  ['P-7733502', 'Obra Caballito', '05/09/2026, 09:05 a. m.', '2026-09-06'],
  ['P-6642190', 'Local Recoleta', '04/09/2026, 05:33 p. m.', '2026-09-05'],
  ['P-5501873', 'Edificio Puerto', '04/09/2026, 01:16 p. m.', '2026-09-05'],
  ['P-4410766', 'Casa San Isidro', '03/09/2026, 11:48 a. m.', '2026-09-04'],
  ['P-3309655', 'Obra Quilmes', '03/09/2026, 08:27 a. m.', '2026-09-04'],
  ['P-2208544', 'Estudio Sur', '02/09/2026, 04:55 p. m.', '2026-09-03'],
  ['P-1107433', 'Local Flores', '02/09/2026, 12:09 p. m.', '2026-09-03'],
  ['P-0096322', 'Obra Vicente Lopez', '01/09/2026, 03:36 p. m.', '2026-09-02'],
  ['P-9985211', 'Casa Nunez', '01/09/2026, 10:14 a. m.', '2026-09-02'],
  ['P-8874100', 'Deposito Sur', '31/08/2026, 05:02 p. m.', '2026-09-01'],
  ['P-7763099', 'Obra Moron', '31/08/2026, 09:41 a. m.', '2026-09-01'],
] as const

export const orders: Order[] = [
  {
    id: 'P-7611015',
    client: 'ESTEBAN PEZZANO',
    loadedAt: '23/09/2026, 03:20 p. m.',
    deliveryDate: '2026-09-26',
    status: 'pendiente',
  },
  {
    id: 'P-3687721',
    client: 'AXEL LEW',
    loadedAt: '21/09/2026, 03:01 p. m.',
    deliveryDate: '2026-09-24',
    status: 'en-viaje',
  },
  {
    id: 'P-9814753',
    client: 'Federal Med Sociedad Anonima',
    zone: 'CABA',
    loadedAt: '21/09/2026, 11:10 a. m.',
    deliveryDate: '2026-09-23',
    status: 'en-viaje',
  },
  {
    id: 'P-1027409',
    client: 'IGNACIO VIEYTFS',
    loadedAt: '16/09/2026, 12:03 p. m.',
    deliveryDate: '2026-09-18',
    status: 'en-viaje',
  },
  ...deliveredNames.map(
    ([id, client, loadedAt, deliveryDate]): Order => ({
      id,
      client,
      loadedAt,
      deliveryDate,
      status: 'entregado',
    }),
  ),
]

export function ordersByStatus(status: OrderStatus) {
  return orders.filter((order) => order.status === status)
}
