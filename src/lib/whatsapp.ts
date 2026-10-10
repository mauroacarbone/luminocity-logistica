/** Arma un link wa.me. El número queda en 549 más 10 dígitos de área y número. */
export function whatsappLink(phone: string, text: string) {
  const number = normalizeArWhatsapp(phone)
  if (!number) return ''
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function normalizeArWhatsapp(raw: string) {
  if (rejectedPhone(raw)) return ''
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length >= 11) digits = digits.slice(1)
  while (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.startsWith('15')) return ''
  digits = stripFifteen(digits)
  if (digits.length !== 10) return ''
  return `549${digits}`
}

function rejectedPhone(raw: string) {
  if (/[#\p{L}]/u.test(raw)) return true
  return /\b(?:int|ext|interno)\b/i.test(raw)
}

function stripFifteen(digits: string) {
  if (digits.length !== 12) return digits
  for (const length of [2, 3, 4]) {
    if (digits.slice(length, length + 2) !== '15') continue
    const rest = digits.slice(length + 2)
    if (length + rest.length === 10) return digits.slice(0, length) + rest
  }
  return digits
}

export function mapsLink(address: string) {
  const query = address.trim()
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function onTheWayText(client: string, orderId: string) {
  return `Hola ${client}, soy el chofer de Luminocity. Tu pedido ${orderId} va en camino.`
}

export function pickupReadyText(client: string, orderId: string) {
  return `Hola ${client}, tu pedido ${orderId} de Luminocity ya está listo para retirar por el local.`
}
