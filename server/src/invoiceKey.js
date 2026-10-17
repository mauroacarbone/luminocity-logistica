/**
 * Misma lógica que src/lib/invoiceKey.ts. Mantenerlas iguales.
 * Compara comprobantes: minúsculas, letras y números por grupo,
 * sin ceros a la izquierda en cada número, unidos con "-".
 */
export function normalizeInvoiceKey(value) {
  const source = typeof value === 'string' ? value : ''
  const parts = source.trim().toLocaleLowerCase('es').match(/\p{L}+|\d+/gu) ?? []
  return parts
    .map((part) => {
      if (!/^\d+$/.test(part)) return part
      const stripped = part.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    })
    .join('-')
}

/** Pedidos cuyo `invoices` incluye el comprobante (normalizado). */
export function matchOrdersByInvoice(orders, comprobante) {
  const key = normalizeInvoiceKey(comprobante)
  if (!key) return { kind: 'none' }
  const list = Array.isArray(orders) ? orders : []
  const matches = list.filter((order) =>
    (Array.isArray(order?.invoices) ? order.invoices : []).some(
      (invoice) => normalizeInvoiceKey(invoice) === key,
    ),
  )
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'many' }
  return { kind: 'one', order: matches[0] }
}

/** Asigna `orderId` solo a filas que no tienen uno, cuando el comprobante coincide con un único pedido. */
export function linkUniquePickingRows(rows, orders, onlyOrderId) {
  let changed = false
  if (!Array.isArray(rows)) return changed
  for (const row of rows) {
    if (!row || (typeof row.orderId === 'string' && row.orderId)) continue
    const match = matchOrdersByInvoice(orders, row.comprobante)
    if (match.kind !== 'one') continue
    if (onlyOrderId && match.order.id !== onlyOrderId) continue
    row.orderId = match.order.id
    changed = true
  }
  return changed
}
