const DATA_FIELDS = [
  'client',
  'seller',
  'phone',
  'address',
  'propertyType',
  'loadedAt',
  'deliveryDate',
  'zone',
  'amount',
  'timeWindow',
  'notes',
  'attachmentName',
  'attachmentDataUrl',
  'receiverName',
  'receiverDni',
  'betweenStreet1',
  'betweenStreet2',
  'invoices',
  'collectOnDelivery',
  'requiresPickup',
  'dispatchType',
]

const TRACKED = [...DATA_FIELDS, 'transporter', 'driverId', 'status', 'packages']

export function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function ownsOrder(user, order) {
  if (order.createdBy === user.id) return true
  const seller = normalizeName(order.seller)
  return seller.length > 0 && seller === normalizeName(user.sellerName)
}

export function businessToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function nearbyDelivery(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const today = businessToday()
  return iso === shiftIso(today, -1) || iso === today || iso === shiftIso(today, 1)
}

export function canSeeOrder(user, order) {
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role === 'vendedor') return ownsOrder(user, order)
  if (user.role === 'deposito') return order.status === 'pendiente' || order.status === 'preparado'
  if (user.role === 'chofer') return driverSees(user, order)
  return false
}

export function canCreate(user) {
  return user.role === 'vendedor' || user.role === 'admin'
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : []
    const b = Array.isArray(right) ? right : []
    return a.length === b.length && a.every((item, index) => item === b[index])
  }
  return left === right
}

export function diffOrder(current, next) {
  const changes = {}
  for (const key of TRACKED) {
    if (sameValue(current[key], next[key])) continue
    changes[key] = next[key] === undefined ? null : next[key]
  }
  return changes
}

export function commercialKeys(changes) {
  return Object.keys(changes).filter((key) => DATA_FIELDS.includes(key))
}

function driverSees(user, order) {
  const carrier = normalizeName(user.carrierName)
  if (!carrier) return false
  return normalizeName(order.transporter) === carrier && nearbyDelivery(order.deliveryDate)
}

function deny(error) {
  return { error, status: 403 }
}

export function assertPatch(user, current, changes) {
  const keys = Object.keys(changes)

  if (user.role === 'admin') return { ok: true }

  if (user.role === 'deposito') {
    const extra = keys.filter((key) => key !== 'status' && key !== 'packages')
    if (extra.length > 0) {
      return deny('Solo podés marcar el pedido como preparado y cargar los bultos.')
    }
    if (
      Object.prototype.hasOwnProperty.call(changes, 'status') &&
      !(current.status === 'pendiente' && changes.status === 'preparado')
    ) {
      return deny('Solo podés pasar un pendiente a preparado.')
    }
    return { ok: true }
  }

  if (user.role === 'vendedor') {
    if (!ownsOrder(user, current)) return deny('No tenés permiso para modificar este pedido.')
    if (Object.prototype.hasOwnProperty.call(changes, 'seller') && changes.seller !== current.seller) {
      return deny('No podés cambiar el vendedor del pedido.')
    }
    if (current.status !== 'pendiente' && current.status !== 'preparado') {
      return deny('No podés editar un pedido que ya salió de preparación.')
    }
    const blocked = keys.filter((key) => key === 'status' || key === 'packages' || key === 'driverId')
    if (blocked.length > 0) return deny('No podés cambiar el estado, los bultos ni el chofer.')
    const unknown = keys.filter((key) => !DATA_FIELDS.includes(key) && key !== 'transporter')
    if (unknown.length > 0) return deny('No podés cambiar esos datos del pedido.')
    return { ok: true }
  }

  if (user.role === 'chofer') {
    if (!driverSees(user, current)) {
      return deny('No tenés permiso para modificar este pedido.')
    }
    if (keys.length !== 1 || keys[0] !== 'status') {
      return deny('Solo podés pasar a en viaje o marcar entregado.')
    }
    const next = changes.status
    const from = current.status
    const allowed =
      (from === 'asignado' && (next === 'en-viaje' || next === 'entregado')) ||
      (from === 'en-viaje' && next === 'entregado')
    if (!allowed) return deny('Solo podés pasar a en viaje o marcar entregado.')
    return { ok: true }
  }

  if (user.role === 'encargado_deposito') {
    if (changes.status === 'en-viaje' || changes.status === 'entregado') {
      return deny('No podés marcar en viaje ni entregado.')
    }
    return { ok: true }
  }

  return deny('No tenés permiso para modificar este pedido.')
}
