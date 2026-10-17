import { BRAND } from '../config/brand'
import { rejectedPhone, stripFifteen } from './phone'

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

export function mapsLink(address: string) {
  const query = address.trim()
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function onTheWayText(client: string, orderId: string) {
  return `Hola ${client}, soy el chofer de ${BRAND.name}. Tu pedido ${orderId} va en camino.`
}

export function pickupReadyText(client: string, orderId: string) {
  return `Hola ${client}, tu pedido ${orderId} de ${BRAND.name} ya está listo para retirar por el local.`
}

export const REPAIR_SIGNATURE = 'Luminocity — Servicio Técnico'

const repairMoney = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

export type RepairQuoteInput = {
  client: string
  product: string
  claimId: string
  invoice: string
  diagnosis: string
  amount: number
  etaDate: string
  expiresAt: string
}

function repairMoneyText(amount: number) {
  return `$ ${repairMoney.format(amount)}`
}

function repairDay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

function repairClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function repairQuoteText(input: RepairQuoteInput) {
  return [
    `Estimado/a ${input.client}:`,
    `Le escribimos de ${REPAIR_SIGNATURE} por su ${input.product} (reclamo ${input.claimId}, factura ${input.invoice}).`,
    `Diagnóstico: ${input.diagnosis}.`,
    `Importe de la reparación: ${repairMoneyText(input.amount)}.`,
    `Fecha aproximada de entrega: ${repairDay(input.etaDate)}, contada desde su aprobación.`,
    `Este presupuesto tiene una validez de 48 horas, hasta el ${repairDay(input.expiresAt)} a las ${repairClock(input.expiresAt)}.`,
    'Para avanzar con la reparación, le pedimos que nos confirme su aprobación respondiendo este mensaje.',
    'Quedamos a su disposición.',
    REPAIR_SIGNATURE,
  ].join('\n')
}

export function repairReminderText(input: {
  client: string
  product: string
  claimId: string
  amount: number
  diagnosis: string
  etaDate: string
  expiredAt: string
  expiresAt: string
}) {
  return [
    `Estimado/a ${input.client}:`,
    `Le recordamos que el presupuesto de reparación de su ${input.product} (reclamo ${input.claimId}) por ${repairMoneyText(input.amount)} venció el ${repairDay(input.expiredAt)}.`,
    `Le reenviamos el detalle: ${input.diagnosis}. Fecha aproximada de entrega: ${repairDay(input.etaDate)}, contada desde su aprobación.`,
    `Si desea avanzar, respóndanos este mensaje y renovamos la validez por 48 horas más, hasta el ${repairDay(input.expiresAt)} a las ${repairClock(input.expiresAt)}.`,
    'Quedamos a su disposición.',
    REPAIR_SIGNATURE,
  ].join('\n')
}

export function repairRejectedText(input: {
  client: string
  product: string
  claimId: string
  seller: string
}) {
  const seller = input.seller.trim()
  const line = seller
    ? `Lo invitamos a acercarse a nuestro local o a comunicarse con su vendedor, ${seller}, para evaluar otras alternativas y coordinar la devolución del producto.`
    : 'Lo invitamos a acercarse a nuestro local o a comunicarse con uno de nuestros vendedores para evaluar otras alternativas y coordinar la devolución del producto.'
  return [
    `Estimado/a ${input.client}:`,
    `Tomamos nota de que no desea avanzar con la reparación de su ${input.product} (reclamo ${input.claimId}).`,
    line,
    'Muchas gracias por su confianza.',
    REPAIR_SIGNATURE,
  ].join('\n')
}

export function repairReadyText(input: { client: string; product: string; claimId: string }) {
  return [
    `Estimado/a ${input.client}:`,
    `Le informamos que la reparación de su ${input.product} (reclamo ${input.claimId}) está finalizada y lista para retirar en nuestro local.`,
    'Quedamos a su disposición.',
    REPAIR_SIGNATURE,
  ].join('\n')
}
