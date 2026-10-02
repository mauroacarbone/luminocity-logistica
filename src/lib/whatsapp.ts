/** Arma un link wa.me. El número queda en 549 más 10 dígitos de área y número. */
export function whatsappLink(phone: string, text: string) {
  const number = normalizeArWhatsapp(phone)
  if (!number) return ''
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function normalizeArWhatsapp(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length >= 11) digits = digits.slice(1)
  while (digits.startsWith('0')) digits = digits.slice(1)
  digits = stripFifteen(digits)
  if (digits.length !== 10) return ''
  return `549${digits}`
}

function stripFifteen(digits: string) {
  if (digits.startsWith('15') && digits.length >= 8 && digits.length <= 12) {
    return digits.slice(2)
  }
  for (const length of [2, 3, 4]) {
    if (digits.length <= length + 2) continue
    if (digits.slice(length, length + 2) !== '15') continue
    const rest = digits.slice(length + 2)
    if (rest.length >= 6 && rest.length <= 8) return digits.slice(0, length) + rest
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
