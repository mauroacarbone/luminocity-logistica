import type { Order } from '../data/orders'

/** Misma lógica que server/src/invoiceKey.js. Mantenerlas iguales.
 * Compara comprobantes: minúsculas, letras y números por grupo,
 * sin ceros a la izquierda en cada número, unidos con "-".
 */
export function normalizeInvoiceKey(value: string) {
  const parts = value.trim().toLocaleLowerCase('es').match(/\p{L}+|\d+/gu) ?? []
  return parts
    .map((part) => {
      if (!/^\d+$/.test(part)) return part
      const stripped = part.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    })
    .join('-')
}

export type InvoiceMatch =
  | { kind: 'one'; order: Order }
  | { kind: 'many' }
  | { kind: 'none' }

/** Pedidos cuyo `invoices` incluye el comprobante (normalizado). */
export function matchOrdersByInvoice(orders: Order[], comprobante: string): InvoiceMatch {
  const key = normalizeInvoiceKey(comprobante)
  if (!key) return { kind: 'none' }
  const matches = orders.filter((order) =>
    (order.invoices ?? []).some((invoice) => normalizeInvoiceKey(invoice) === key),
  )
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'many' }
  return { kind: 'one', order: matches[0]! }
}
