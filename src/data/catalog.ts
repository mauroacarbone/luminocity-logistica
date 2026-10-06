export type DeliveryZone = {
  name: string
  days: string
}

export const SELLERS = [
  'Agustina Peluso',
  'Andrea Gariboldi',
  'Bianca Lebon',
  'Cristian Ciuffo',
  'Fernanda Casas',
  'German Rago',
  'Jose Favaccio',
  'Leandro Cuba',
  'Martin Mijael Goldstein',
  'Mauro Carbone',
  'Maximiliano Cordoba',
  'Milagro Sanchez',
  'Yisshell Guzmán',
  'Yoel Goldstein',
]

export const PROPERTY_TYPES = [
  'Casa',
  'Departamento',
  'Obra',
  'Local',
  'Edificio',
  'Oficina',
]

export const TIME_WINDOWS = ['10:00-15:00', '09:00-13:00', '15:00-19:00']

export type DispatchType = 'propia' | 'correo'

export const DISPATCH_LABEL: Record<DispatchType, string> = {
  propia: 'Entrega propia',
  correo: 'Correo / Courier',
}

export const OWN_TRANSPORTERS = [
  'Entrego ya!',
  'Oscar',
  'Via cargo',
  'Eventual',
  'Dario',
  'Expreso',
  'Hormiga',
]

export const COURIER_TRANSPORTERS = [
  'Andreani',
  'Correo Argentino',
  'Via Cargo',
  'Entrego ya!',
  'Oca',
]

export function isDispatchType(value: unknown): value is DispatchType {
  return value === 'propia' || value === 'correo'
}

export function listForDispatch(
  type: DispatchType,
  lists: { ownTransporters: readonly string[]; courierTransporters: readonly string[] },
) {
  return type === 'correo' ? lists.courierTransporters : lists.ownTransporters
}

export const DELIVERY_ZONES: DeliveryZone[] = [
  { name: 'CABA', days: 'Lun · Mar · Mié · Jue · Vie · Sáb' },
  { name: 'GBA Norte', days: 'Lun · Jue' },
  { name: 'GBA Oeste', days: 'Mar · Vie' },
  { name: 'GBA Sur', days: 'Jue' },
  { name: 'Provincia', days: 'Sin días' },
]

export function withCurrent(options: readonly string[], current: string | undefined) {
  if (!current || options.includes(current)) return [...options]
  return [current, ...options]
}

export function withExtras(options: readonly string[], extras: readonly (string | undefined)[]) {
  const seen = new Set(options)
  const next = [...options]
  for (const extra of extras) {
    if (!extra || seen.has(extra)) continue
    seen.add(extra)
    next.push(extra)
  }
  return next
}
