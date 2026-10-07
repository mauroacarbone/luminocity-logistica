import type { Order } from '../data/orders'

/** Compara comprobantes: trim, minúsculas, sin espacios/guiones ni ceros a la izquierda. */
export function normalizeInvoiceKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .replace(/[\s-]+/g, '')
    .replace(/(^|[^0-9])0+(?=\d)/g, '$1')
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
