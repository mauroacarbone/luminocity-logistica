export type DriverChoice = {
  id: string
  name: string
  phone?: string
  email?: string
  trialDriver?: boolean
}

function nameKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** El admin de prueba va primero y se destaca en el selector. */
export function driverOptionClass(trial?: boolean, full?: boolean) {
  const parts: string[] = []
  if (trial) parts.push('bg-accent-soft', 'font-semibold')
  if (full) parts.push('text-danger')
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** Si hay dos choferes con el mismo nombre, suma el celular o el email. */
export function labelDrivers(drivers: DriverChoice[]) {
  const counts = new Map<string, number>()
  for (const driver of drivers) {
    const key = nameKey(driver.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return drivers.map((driver) => {
    const repeated = (counts.get(nameKey(driver.name)) ?? 0) > 1
    const extra = driver.phone?.trim() || driver.email?.trim() || ''
    const label = repeated && extra ? `${driver.name} · ${extra}` : driver.name
    return { ...driver, label }
  })
}
