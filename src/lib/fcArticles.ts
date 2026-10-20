import { namesMatch } from './access'

export function fcClientNotice(orderClient: string, fcClient: string | null) {
  if (!fcClient?.trim() || !orderClient.trim()) return ''
  if (namesMatch(orderClient, fcClient)) return ''
  return `El cliente de la factura / nota de pedido (${fcClient}) no coincide con el del pedido.`
}

export function fcInvoiceNotice(invoices: string[], factura: string | null) {
  if (!factura) return ''
  const filled = invoices.map((value) => value.trim()).filter(Boolean)
  if (filled.length === 0) return ''
  if (filled.some((value) => value.replace(/\s+/g, '').includes(factura))) return ''
  return `El N° de factura ya está cargado. No se cambia por el de la factura / nota de pedido (${factura}).`
}
