import { useState } from 'react'
import type { Claim } from '../data/claims'
import { namesMatch } from '../lib/access'
import type { Session } from '../lib/authStore'
import { phoneKindAR } from '../lib/phone'
import { repairReadyText, repairRejectedText, repairReminderText, whatsappLink } from '../lib/whatsapp'
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

function canAnswer(user: Session, claim: Claim) {
  const step = claim.repair?.step
  if (step !== 'presupuesto-enviado' && step !== 'presupuesto-vencido') return false
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role === 'tecnico' && claim.repair?.technician?.id === user.id) return true
  if (user.role !== 'vendedor') return false
  if (claim.createdBy === user.id) return true
  return namesMatch(user.sellerName, claim.seller)
}

export function RepairFollowUp({
  claim,
  user,
  primaryKind,
}: {
  claim: Claim
  user: Session
  primaryKind?: 'reenvio' | 'listo' | 'rechazo'
}) {
  const { answerRepair, recordRepairContact } = useClaims()
  const repair = claim.repair
  const [busy, setBusy] = useState(false)
  const [callResult, setCallResult] = useState('')
  if (!repair) return null
  const kind = claim.phoneKind ?? (claim.phone.trim() ? phoneKindAR(claim.phone) : 'desconocido')
  const showWhatsapp = kind === 'movil' || kind === 'desconocido'
  const showCall = kind === 'fijo' || kind === 'desconocido'
  const quote = repair.quote
  const expired = repair.step === 'presupuesto-vencido'
  const waiting = repair.step === 'presupuesto-enviado' || expired

  async function answer(to: 'aceptado' | 'rechazado') {
    setBusy(true)
    const result = await answerRepair(claim.id, to)
    setBusy(false)
    if (!result.ok) await error(result.message)
  }

  async function contact(channel: 'whatsapp' | 'llamada', contactKind: 'reenvio' | 'listo' | 'rechazo', text: string) {
    if (channel === 'llamada' && !callResult) return
    setBusy(true)
    const result = await recordRepairContact(claim.id, {
      channel,
      kind: contactKind,
      result: channel === 'llamada' ? callResult : undefined,
      phoneKind: claim.phoneKind,
    })
    setBusy(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    if (channel === 'whatsapp') {
      const link = whatsappLink(claim.phone, text)
      if (link) window.open(link, '_blank', 'noopener')
      return
    }
    if (claim.phone.trim()) window.open(`tel:${claim.phone.trim()}`, '_self')
  }

  function messageButtons(contactKind: 'reenvio' | 'listo' | 'rechazo', text: string) {
    if (!claim.phone.trim()) return <p className="text-sm text-subtle">Sin teléfono</p>
    const primary = primaryKind === contactKind
    return (
      <div className="flex flex-col gap-2">
        {showCall && (
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
        )}
        <div className="flex flex-wrap gap-2">
          {showWhatsapp && (
            <Button
              variant={primary ? 'primary' : 'secondary'}
              size="lg"
              disabled={busy}
              onClick={() => void contact('whatsapp', contactKind, text)}
            >
              {contactKind === 'reenvio' ? 'Reenviar presupuesto' : 'Avisar por WhatsApp'}
            </Button>
          )}
          {showCall && (
            <Button
              variant={primary && !showWhatsapp ? 'primary' : 'secondary'}
              size="lg"
              disabled={busy || !callResult}
              onClick={() => void contact('llamada', contactKind, text)}
            >
              Llamar
            </Button>
          )}
        </div>
        {showCall && (
          <p className="whitespace-pre-wrap text-sm text-subtle">{text}</p>
        )}
      </div>
    )
  }

  const reminder =
    quote.amount != null && quote.etaDate && quote.expiresAt
      ? repairReminderText({
          client: claim.client,
          product: repair.product,
          claimId: claim.id,
          amount: quote.amount,
          diagnosis: repair.diagnosis,
          etaDate: quote.etaDate,
          expiredAt: quote.expiresAt,
          expiresAt: new Date(Date.parse(quote.expiresAt) + 48 * 60 * 60 * 1000).toISOString(),
        })
      : ''

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
      {expired && reminder && (user.role === 'tecnico' || user.role === 'encargado_deposito' || user.role === 'admin') && (
        <div className="mt-3">{messageButtons('reenvio', reminder)}</div>
      )}
      {repair.step === 'rechazado' && (
        <div className="mt-3">
          {messageButtons(
            'rechazo',
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
          {messageButtons(
            'listo',
            repairReadyText({ client: claim.client, product: repair.product, claimId: claim.id }),
          )}
        </div>
      )}
    </div>
  )
}
