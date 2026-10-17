import { useState } from 'react'
import type { Claim } from '../data/claims'
import { namesMatch } from '../lib/access'
import type { Session } from '../lib/authStore'
import { phoneKindAR } from '../lib/phone'
import {
  REPAIR_SIGNATURE,
  repairQuoteText,
  repairReadyText,
  repairRejectedText,
  repairReminderText,
  whatsappLink,
} from '../lib/whatsapp'
import { error } from '../lib/alerts'
import { useClaims } from '../state/ClaimsContext'
import { Badge, Button, Field, Select } from './ui'

const CALL_RESULTS = [
  { value: 'atendió', label: 'Atendió' },
  { value: 'no atendió', label: 'No atendió' },
  { value: 'dejó mensaje', label: 'Dejó mensaje' },
]

function money(amount: number) {
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(amount)}`
}

function stamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}

function day(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

function canSendQuote(user: Session, claim: Claim) {
  const repair = claim.repair
  if (!repair || repair.step !== 'diagnostico' || repair.coverage !== 'cobro') return false
  if (!repair.diagnosis.trim() || repair.quote.amount == null || !repair.quote.etaDate) return false
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  return user.role === 'tecnico' && repair.technician?.id === user.id
}

function canAnswer(user: Session, claim: Claim) {
  const step = claim.repair?.step
  if (step !== 'presupuesto-enviado' && step !== 'presupuesto-vencido') return false
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role === 'tecnico' && claim.repair?.technician?.id === user.id) return true
  if (user.role !== 'vendedor') return false
  if (claim.createdBy === user.id) return true
  return namesMatch(user.sellerName, claim.seller)
}

function quotePreview(claim: Claim) {
  const repair = claim.repair
  if (!repair || repair.quote.amount == null || !repair.quote.etaDate) return ''
  return [
    `Estimado/a ${claim.client}:`,
    `Le escribimos de ${REPAIR_SIGNATURE} por su ${repair.product} (reclamo ${claim.id}, factura ${claim.invoices[0] ?? ''}).`,
    `Diagnóstico: ${repair.diagnosis}.`,
    `Importe de la reparación: ${money(repair.quote.amount)}.`,
    `Fecha aproximada de entrega: ${day(repair.quote.etaDate)}, contada desde su aprobación.`,
    'Este presupuesto tiene una validez de 48 horas.',
    'Para avanzar con la reparación, le pedimos que nos confirme su aprobación respondiendo este mensaje.',
    'Quedamos a su disposición.',
    REPAIR_SIGNATURE,
  ].join('\n')
}

function reminderPreview(claim: Claim) {
  const repair = claim.repair
  const quote = repair?.quote
  if (!repair || quote?.amount == null || !quote.etaDate || !quote.expiresAt) return ''
  return [
    `Estimado/a ${claim.client}:`,
    `Le recordamos que el presupuesto de reparación de su ${repair.product} (reclamo ${claim.id}) por ${money(quote.amount)} venció el ${day(quote.expiresAt)}.`,
    `Le reenviamos el detalle: ${repair.diagnosis}. Fecha aproximada de entrega: ${day(quote.etaDate)}, contada desde su aprobación.`,
    'Si desea avanzar, respóndanos este mensaje y renovamos la validez por 48 horas más.',
    'Quedamos a su disposición.',
    REPAIR_SIGNATURE,
  ].join('\n')
}

function quoteExpiry() {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
}

function RepairReach({
  phone,
  phoneKind,
  primary,
  busy,
  whatsappLabel,
  preview,
  buildText,
  onWhatsapp,
  onLogged,
}: {
  phone: string
  phoneKind: 'movil' | 'fijo' | 'desconocido'
  primary: boolean
  busy: boolean
  whatsappLabel: string
  preview: string
  buildText: (expiresAt: string) => string
  onWhatsapp: (text: string) => Promise<void>
  onLogged: (result: string) => Promise<void>
}) {
  const [calling, setCalling] = useState(false)
  const [callResult, setCallResult] = useState('')
  const [script, setScript] = useState('')
  if (!phone.trim()) return <p className="text-sm text-subtle">Sin teléfono</p>
  const showWhatsapp = phoneKind === 'movil' || phoneKind === 'desconocido'
  const showCall = phoneKind === 'fijo' || phoneKind === 'desconocido'

  function startCall() {
    setScript(buildText(quoteExpiry()))
    setCalling(true)
    window.open(`tel:${phone.trim()}`, '_self')
  }

  async function register() {
    if (!callResult) return
    setScript(buildText(quoteExpiry()))
    await onLogged(callResult)
  }

  return (
    <div className="flex flex-col gap-2">
      {calling && (
        <>
          <Field label="Resultado de la llamada">
            <Select value={callResult} onChange={(event) => setCallResult(event.target.value)}>
              <option value="">Elegí el resultado</option>
              {CALL_RESULTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" size="lg" disabled={busy || !callResult} onClick={() => void register()}>
            Registrar llamada
          </Button>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {showWhatsapp && (
          <Button
            variant={primary ? 'primary' : 'secondary'}
            size="lg"
            disabled={busy}
            onClick={() => void onWhatsapp(buildText(quoteExpiry()))}
          >
            {whatsappLabel}
          </Button>
        )}
        {showCall && (
          <Button
            variant={primary && !showWhatsapp ? 'primary' : 'secondary'}
            size="lg"
            disabled={busy}
            onClick={startCall}
          >
            Llamar
          </Button>
        )}
      </div>
      {showCall && <p className="whitespace-pre-wrap text-sm text-subtle">{script || preview}</p>}
    </div>
  )
}

export function RepairFollowUp({
  claim,
  user,
  primaryKind,
}: {
  claim: Claim
  user: Session
  primaryKind?: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo'
}) {
  const { answerRepair, recordRepairContact } = useClaims()
  const repair = claim.repair
  const [busy, setBusy] = useState(false)
  if (!repair) return null
  const kind = claim.phoneKind ?? (claim.phone.trim() ? phoneKindAR(claim.phone) : 'desconocido')
  const quote = repair.quote
  const expired = repair.step === 'presupuesto-vencido'
  const waiting = repair.step === 'presupuesto-enviado' || expired

  async function answer(to: 'aceptado' | 'rechazado') {
    setBusy(true)
    const result = await answerRepair(claim.id, to)
    setBusy(false)
    if (!result.ok) await error(result.message)
  }

  async function sendWhatsapp(
    contactKind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo',
    text: string,
  ) {
    setBusy(true)
    const result = await recordRepairContact(claim.id, {
      channel: 'whatsapp',
      kind: contactKind,
      phoneKind: claim.phoneKind,
    })
    setBusy(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    const link = whatsappLink(claim.phone, text)
    if (link) window.open(link, '_blank', 'noopener')
  }

  async function logCall(contactKind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo', result: string) {
    setBusy(true)
    const saved = await recordRepairContact(claim.id, {
      channel: 'llamada',
      kind: contactKind,
      result,
      phoneKind: claim.phoneKind,
    })
    setBusy(false)
    if (!saved.ok) await error(saved.message)
  }

  function reach(
    contactKind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo',
    label: string,
    preview: string,
    buildText: (expiresAt: string) => string,
  ) {
    return (
      <RepairReach
        phone={claim.phone}
        phoneKind={kind}
        primary={primaryKind === contactKind}
        busy={busy}
        whatsappLabel={label}
        preview={preview}
        buildText={buildText}
        onWhatsapp={(text) => sendWhatsapp(contactKind, text)}
        onLogged={(result) => logCall(contactKind, result)}
      />
    )
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      {repair.coverage === 'cobro' && quote.amount != null && (
        <p className="text-sm">
          Presupuesto {money(quote.amount)}
          {quote.etaDate ? ` · entrega aprox. ${day(quote.etaDate)}` : ''}
        </p>
      )}
      {waiting && quote.expiresAt && !expired && (
        <p className="mt-1 text-xs text-subtle">Vence el {stamp(quote.expiresAt)}</p>
      )}
      {expired && (
        <Badge tone="warning" className="mt-2">
          Presupuesto vencido
        </Badge>
      )}
      {canSendQuote(user, claim) && quote.amount != null && quote.etaDate && (
        <div className="mt-3">
          {reach(
            'presupuesto',
            'Avisar por WhatsApp',
            quotePreview(claim),
            (expiresAt) =>
              repairQuoteText({
                client: claim.client,
                product: repair.product,
                claimId: claim.id,
                invoice: claim.invoices[0] ?? '',
                diagnosis: repair.diagnosis,
                amount: quote.amount!,
                etaDate: quote.etaDate!,
                expiresAt,
              }),
          )}
        </div>
      )}
      {canAnswer(user, claim) && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Respuesta del cliente</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Respuesta del cliente">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => void answer('aceptado')}>
              Acepta
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => void answer('rechazado')}>
              Rechaza
            </Button>
          </div>
        </div>
      )}
      {expired &&
        quote.amount != null &&
        quote.etaDate &&
        quote.expiresAt &&
        (user.role === 'tecnico' || user.role === 'encargado_deposito' || user.role === 'admin') && (
          <div className="mt-3">
            {reach(
              'reenvio',
              'Reenviar presupuesto',
              reminderPreview(claim),
              (expiresAt) =>
                repairReminderText({
                  client: claim.client,
                  product: repair.product,
                  claimId: claim.id,
                  amount: quote.amount!,
                  diagnosis: repair.diagnosis,
                  etaDate: quote.etaDate!,
                  expiredAt: quote.expiresAt!,
                  expiresAt,
                }),
            )}
          </div>
        )}
      {repair.step === 'rechazado' && (
        <div className="mt-3">
          {reach(
            'rechazo',
            'Avisar por WhatsApp',
            repairRejectedText({
              client: claim.client,
              product: repair.product,
              claimId: claim.id,
              seller: claim.seller,
            }),
            () =>
              repairRejectedText({
                client: claim.client,
                product: repair.product,
                claimId: claim.id,
                seller: claim.seller,
              }),
          )}
        </div>
      )}
      {repair.step === 'listo' && (
        <div className="mt-3">
          {reach(
            'listo',
            'Avisar por WhatsApp',
            repairReadyText({ client: claim.client, product: repair.product, claimId: claim.id }),
            () => repairReadyText({ client: claim.client, product: repair.product, claimId: claim.id }),
          )}
        </div>
      )}
    </div>
  )
}
