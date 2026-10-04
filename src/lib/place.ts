type PlaceOrder = {
  floor?: string
  unit?: string
  doorbell?: string
}

export function placeKind(propertyType: string) {
  const bare = propertyType
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (bare === 'departamento' || bare === 'edificio') return 'building' as const
  if (bare === 'casa') return 'house' as const
  return 'other' as const
}

export function placeLine(order: PlaceOrder) {
  const parts: string[] = []
  const floor = order.floor?.trim()
  const unit = order.unit?.trim()
  const doorbell = order.doorbell?.trim()
  if (floor) parts.push(`Piso ${floor}`)
  if (unit) parts.push(`Depto ${unit}`)
  if (doorbell) parts.push(`Timbre ${doorbell}`)
  return parts.join(' · ')
}
