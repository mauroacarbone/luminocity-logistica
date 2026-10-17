import { PrepChip } from './PrepChip'
import { Badge, statusTone } from './ui'
import { OrderAttachmentLink } from './OrderAttachmentLink'
import { PriorityChip } from './PriorityChip'
import { DISPATCH_LABEL } from '../data/catalog'
import { type Order, type OrderHistoryEntry, type OrderStatus } from '../data/orders'
import { placeLine } from '../lib/place'
import { statusPillFor } from '../lib/orderFlow'
import { formatIsoDate } from '../lib/week'
import { cx } from './ui/cx'

const VIA_LABEL: Record<string, string> = {
  pedidos: 'Pedidos',
  despacho: 'Despacho',
  hoja: 'Hoja de ruta',
  'mis-entregas': 'Mis entregas',
  qr: 'QR',
  picking: 'desde picking',
  panel: 'Panel',
  retiros: 'Retiros',
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function historyOf(order: Order): OrderHistoryEntry[] {
  if (!Array.isArray(order.history) || order.history.length === 0) return []
  return [...order.history].sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0))
}

function statusText(order: Order, status: OrderStatus | null) {
  if (!status) return '—'
  return statusPillFor(order, status)
}

type OrderDetailProps = {
  order: Order
  compact?: boolean
}

export function OrderDetail({ order, compact = false }: OrderDetailProps) {
  const history = historyOf(order)

  return (
    <div className={cx('flex flex-col gap-4', !compact && 'mt-4')}>
      <section className={cx('rounded-2xl bg-surface shadow-sm', compact ? 'p-4' : 'p-4 sm:p-5')}>
        <h2 className="text-base font-semibold">Datos del pedido</h2>
        {compact ? (
          <div className="mt-3">
            <PriorityChip order={order} />
          </div>
        ) : null}
        <dl className="order-detail-grid mt-3">
          <div>
            <dt>Cliente</dt>
            <dd>{order.client}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{order.phone || '—'}</dd>
          </div>
          <div>
            <dt>Vendedor</dt>
            <dd>{order.seller || '—'}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>
              {order.address || '—'}
              {placeLine(order) ? <span className="block text-muted">{placeLine(order)}</span> : null}
              {order.zone ? <span className="block text-muted">{order.zone}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Despacho</dt>
            <dd>{order.dispatchType ? DISPATCH_LABEL[order.dispatchType] : 'Entrega propia'}</dd>
          </div>
          <div>
            <dt>Prioridad</dt>
            <dd>
              <PriorityChip order={order} showNormal />
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>
                <PrepChip order={order} />
              </span>
            </dd>
          </div>
          <div>
            <dt>Transportista</dt>
            <dd>{order.transporter || '—'}</dd>
          </div>
          <div>
            <dt>Chofer</dt>
            <dd>{order.driverName || (order.driverId ? 'Chofer asignado' : '—')}</dd>
          </div>
          <div>
            <dt>Franja</dt>
            <dd>{order.timeWindow || '—'}</dd>
          </div>
          <div>
            <dt>Bultos</dt>
            <dd>{order.packages != null ? order.packages : '—'}</dd>
          </div>
          <div>
            <dt>Tracking</dt>
            <dd>{order.trackingNumber || '—'}</dd>
          </div>
          <div>
            <dt>Facturas</dt>
            <dd>{order.invoices && order.invoices.length > 0 ? order.invoices.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>Adjunto</dt>
            <dd>
              {order.attachmentDataUrl ? (
                <OrderAttachmentLink name={order.attachmentName} dataUrl={order.attachmentDataUrl} />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Fecha de entrega</dt>
            <dd>{order.deliveryDate ? formatIsoDate(order.deliveryDate) : '—'}</dd>
          </div>
          <div>
            <dt>Notas</dt>
            <dd>{order.notes?.trim() ? order.notes : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className={cx('rounded-2xl bg-surface shadow-sm', compact ? 'p-4' : 'p-4 sm:p-5')}>
        <h2 className="text-base font-semibold">Historial</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Sin movimientos registrados.</p>
        ) : (
          <ol className="order-history mt-3">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="order-history-item">
                <p className="order-history-when">{formatWhen(entry.at)}</p>
                <p className="font-semibold">
                  {statusText(order, entry.from)} → {statusText(order, entry.to)}
                </p>
                <p className="text-sm text-muted">
                  {entry.by?.name || '—'}
                  {entry.via ? ` · ${VIA_LABEL[entry.via] ?? entry.via}` : ''}
                </p>
                {entry.reason ? <p className="mt-1 text-sm">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
