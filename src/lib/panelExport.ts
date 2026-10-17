import { DISPATCH_LABEL, isOwnDelivery } from '../data/catalog'
import { STATUS_LABEL, STATUS_ORDER, STATUS_PILL, type Order, type OrderStatus } from '../data/orders'
import { ROLE_LABEL, type Role } from './authStore'
import { writePdf } from './exportPdf'
import { writeXlsx, type XlsxColumn, type XlsxRow, type XlsxSheet } from './exportXlsx'
import { PRIORITY_LABEL, isOrderPriority } from './priority'
import type { RouteSheet } from './routeSheetsApi'
import { normalizeTimeWindow } from './slot'
import { formatIsoDate } from './week'
import type { ColumnKind, RawValue } from './reportModel'

type DateFilter = 'atrasados' | 'hoy' | 'manana' | 'semana' | 'todos'
type StatusFilter = OrderStatus | 'abiertos' | null

type PanelExportInput = {
  orders: Order[]
  dateFilter: DateFilter
  statusFilter: StatusFilter
  today: string
  tomorrow: string
  weekFrom: string
  weekTo: string
  sheets: RouteSheet[]
  canPlan: boolean
  userName: string
  role: Role
}

const DATE_LABEL: Record<DateFilter, string> = {
  atrasados: 'Atrasados',
  hoy: 'Hoy',
  manana: 'Mañana',
  semana: 'Esta semana',
  todos: 'Todos',
}

function isOverdue(order: Order, today: string) {
  return Boolean(order.deliveryDate?.trim()) && order.deliveryDate < today && order.status !== 'entregado'
}

function daysLate(order: Order, today: string) {
  if (!isOverdue(order, today)) return 'No'
  const [year, month, day] = today.split('-').map(Number)
  const [orderYear, orderMonth, orderDay] = order.deliveryDate.split('-').map(Number)
  const days = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(orderYear, orderMonth - 1, orderDay)) / 86400000)
  return days > 0 ? `${days} días` : 'Sí'
}

function addressOf(order: Order) {
  const place = [order.floor?.trim() ? `Piso ${order.floor.trim()}` : '', order.unit?.trim() ? `Depto ${order.unit.trim()}` : '']
    .filter(Boolean)
    .join(' ')
  return [order.address?.trim(), place].filter(Boolean).join(', ')
}

function carrierOf(order: Order) {
  if (isOwnDelivery(order)) return order.driverName?.trim() || order.transporter?.trim() || ''
  if (order.dispatchType === 'correo') {
    const tracking = order.trackingNumber?.trim()
    return [order.transporter?.trim(), tracking].filter(Boolean).join(' · ')
  }
  return ''
}

function sheetOf(order: Order, sheets: RouteSheet[], canPlan: boolean) {
  if (!canPlan || !order.routeId) return ''
  const sheet = sheets.find((item) => item.id === order.routeId)
  if (!sheet) return ''
  const driver = order.driverName?.trim() || 'chofer'
  const slot = sheet.slot || order.timeWindow || 'sin franja'
  return `En hoja de ${driver} · ${slot}`
}

function loadedOf(value: string) {
  const date = value?.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatIsoDate(date) : value || ''
}

function dateLine(input: PanelExportInput) {
  if (input.dateFilter === 'semana') {
    return `Entregas para: Esta semana (${formatIsoDate(input.weekFrom)} – ${formatIsoDate(input.weekTo)})`
  }
  if (input.dateFilter === 'hoy') return `Entregas para: Hoy (${formatIsoDate(input.today)})`
  if (input.dateFilter === 'manana') return `Entregas para: Mañana (${formatIsoDate(input.tomorrow)})`
  return `Entregas para: ${DATE_LABEL[input.dateFilter]}`
}

function statusLine(status: StatusFilter) {
  if (status === 'abiertos') return 'Estado: Abiertos'
  if (status && status in STATUS_LABEL) return `Estado: ${STATUS_LABEL[status]}`
  return 'Estado: Todos'
}

function stamp() {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  return `${formatted} (hora de Buenos Aires)`
}

function column(key: string, header: string, kind: ColumnKind): XlsxColumn {
  return { key, header, kind }
}

const BASE_COLUMNS: XlsxColumn[] = [
  column('id', 'Pedido', 'text'),
  column('priority', 'Prioridad', 'text'),
  column('client', 'Cliente', 'text'),
  column('phone', 'Teléfono', 'text'),
  column('address', 'Dirección', 'text'),
  column('zone', 'Zona', 'text'),
  column('slot', 'Franja', 'text'),
  column('delivery', 'Entrega', 'date'),
  column('late', 'Atrasado', 'text'),
  column('loaded', 'Cargado', 'text'),
  column('status', 'Estado', 'text'),
  column('dispatch', 'Despacho', 'text'),
  column('carrier', 'Chofer o transportista', 'text'),
  column('sheet', 'Hoja', 'text'),
  column('seller', 'Vendedor', 'text'),
  column('packages', 'Bultos', 'count'),
  column('invoices', 'Facturas', 'text'),
  column('collect', 'Cobrar', 'text'),
]

const PDF_SKIP = new Set(['phone', 'invoices', 'loaded'])

function rowOf(order: Order, input: PanelExportInput): XlsxRow {
  const dispatch = order.dispatchType && order.dispatchType in DISPATCH_LABEL ? DISPATCH_LABEL[order.dispatchType] : ''
  const collect = order.collectOnDelivery ? (order.amount?.trim() ? `Sí · ${order.amount.trim()}` : 'Sí') : 'No'
  const cells: Record<string, RawValue> = {
    id: order.id,
    priority: isOrderPriority(order.priority) ? PRIORITY_LABEL[order.priority] : PRIORITY_LABEL.normal,
    client: order.client,
    phone: order.phone ?? '',
    address: addressOf(order),
    zone: order.zone ?? '',
    slot: normalizeTimeWindow(order.timeWindow) || order.timeWindow || '',
    delivery: order.deliveryDate || '',
    late: daysLate(order, input.today),
    loaded: loadedOf(order.loadedAt),
    status: STATUS_PILL[order.status],
    dispatch,
    carrier: carrierOf(order),
    sheet: sheetOf(order, input.sheets, input.canPlan),
    seller: order.seller ?? '',
    packages: order.packages ?? 0,
    invoices: (order.invoices ?? []).filter(Boolean).join(', '),
    collect,
  }
  return { cells }
}

export function buildPanelExport(input: PanelExportInput) {
  const columns = input.canPlan ? BASE_COLUMNS : BASE_COLUMNS.filter((item) => item.key !== 'sheet')
  const rows = input.orders.map((order) => rowOf(order, input))
  const packages = rows.reduce((sum, row) => sum + (typeof row.cells.packages === 'number' ? row.cells.packages : 0), 0)
  const byStatus = STATUS_ORDER.map((status) => {
    const list = input.orders.filter((order) => order.status === status)
    return {
      status: STATUS_LABEL[status],
      count: list.length,
      packages: list.reduce((sum, order) => sum + (order.packages ?? 0), 0),
    }
  })
  const late = input.orders.filter((order) => isOverdue(order, input.today)).length
  const generatedAt = stamp()
  const filters = [dateLine(input), statusLine(input.statusFilter)]
  const totalCells = columns.map((item, index) => {
    if (index === 0) return { key: item.key, value: `Total: ${input.orders.length} pedidos`, text: `Total: ${input.orders.length} pedidos` }
    if (item.key === 'packages') return { key: item.key, value: packages, text: String(packages) }
    return { key: item.key, value: '', text: '' }
  })
  return {
    meta: {
      title: 'Panel operativo',
      filters,
      generatedAt,
      user: `${input.userName} (${ROLE_LABEL[input.role]})`,
    },
    columns,
    rows,
    total: { mode: 'rows' as const, lines: [{ label: 'Total', cells: totalCells }] },
    byStatus,
    late,
    fileStem: `panel-operativo-${input.dateFilter}-${input.today}`,
  }
}

function summarySheet(model: ReturnType<typeof buildPanelExport>): XlsxSheet {
  return {
    name: 'Resumen',
    preamble: [model.meta.title, ...model.meta.filters, `Generado el ${model.meta.generatedAt} por ${model.meta.user}`, `Atrasados: ${model.late}`],
    columns: [
      column('status', 'Estado', 'text'),
      column('count', 'Cantidad', 'count'),
      column('packages', 'Bultos', 'count'),
    ],
    rows: model.byStatus.map((item) => ({ cells: { status: item.status, count: item.count, packages: item.packages } })),
  }
}

export async function downloadPanelXlsx(input: PanelExportInput) {
  const model = buildPanelExport(input)
  const pedidos: XlsxSheet = {
    name: 'Pedidos',
    columns: model.columns,
    rows: model.rows,
    total: model.total,
  }
  await writeXlsx({ fileName: `${model.fileStem}.xlsx`, meta: model.meta, sheets: [pedidos, summarySheet(model)] })
}

export async function downloadPanelPdf(input: PanelExportInput) {
  const model = buildPanelExport(input)
  const columns = model.columns.filter((item) => !PDF_SKIP.has(item.key))
  const rows = model.rows.map((row) =>
    columns.map((item) => {
      const value = row.cells[item.key]
      if (item.kind === 'date' && typeof value === 'string' && value) return formatIsoDate(value)
      return value == null ? '' : String(value)
    }),
  )
  const totalLine = model.total.lines[0].cells.filter((cell) => columns.some((item) => item.key === cell.key)).map((cell) => cell.text)
  await writePdf({
    fileName: `${model.fileStem}.pdf`,
    meta: model.meta,
    blocks: [
      {
        type: 'table',
        title: 'Por estado',
        columns: [
          { header: 'Estado', align: 'left', kind: 'text' },
          { header: 'Cantidad', align: 'right', kind: 'count' },
          { header: 'Bultos', align: 'right', kind: 'count' },
        ],
        rows: model.byStatus.map((item) => [item.status, String(item.count), String(item.packages)]),
        pending: [],
        total: [[`Atrasados: ${model.late}`, '', '']],
      },
      {
        type: 'table',
        title: `Total: ${input.orders.length} pedidos`,
        columns: columns.map((item) => ({ header: item.header, align: item.kind === 'count' ? 'right' : 'left', kind: item.kind })),
        rows,
        pending: [],
        total: [totalLine],
      },
    ],
  })
}
