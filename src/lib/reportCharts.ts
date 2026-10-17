import { cellText, formatPct, type ReportModel, type ReportSectionModel } from './reportModel'

export const CHART_PRINT = {
  blue: [68, 147, 248] as const,
  orange: [240, 136, 62] as const,
  gray: [145, 152, 161] as const,
  green: [63, 185, 80] as const,
}

export type Rgb = readonly [number, number, number]

export type ChartSeries = {
  name: string
  color: Rgb
  values: number[]
  hatch?: boolean
}

export type ChartSpec = {
  title: string
  kind: 'line' | 'stacked' | 'hbar' | 'bar' | 'drivers'
  aria: string
  labels: string[]
  series: ChartSeries[]
  notes?: string[]
}

function section(model: ReportModel, id: string) {
  return model.sections.find((item) => item.id === id)
}

function num(row: ReportSectionModel['rows'][number], key: string) {
  const value = row.values[key]
  return typeof value === 'number' ? value : 0
}

function oneDecimal(value: number) {
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function topGroups(rows: ReportSectionModel['rows']) {
  const ranked = [...rows].sort((left, right) => num(right, 'pct') - num(left, 'pct'))
  const head = ranked.slice(0, 12)
  const rest = ranked.slice(12)
  const labels = head.map((row) => String(row.values.key ?? ''))
  const values = head.map((row) => num(row, 'pct'))
  const notes = head.map((row) => `${num(row, 'entregados')} entregados`)
  if (rest.length > 0) {
    const part = rest.reduce((sum, row) => sum + (row.pct?.pct?.part ?? 0), 0)
    const whole = rest.reduce((sum, row) => sum + (row.pct?.pct?.whole ?? 0), 0)
    const pct = whole ? Math.round((part / whole) * 1000) / 10 : 0
    const delivered = rest.reduce((sum, row) => sum + num(row, 'entregados'), 0)
    labels.push('Otros')
    values.push(pct)
    notes.push(`${delivered} entregados`)
  }
  return { labels, values, notes }
}

export function reportCharts(model: ReportModel): ChartSpec[] {
  const charts: ChartSpec[] = []
  const days = section(model, 'entregas')
  if (days && days.rows.length > 0) {
    const labels = days.rows.map((row) => cellText(days.columns[0], row))
    const totals = days.rows.map(
      (row) => num(row, 'pendiente') + num(row, 'preparado') + num(row, 'asignado') + num(row, 'viaje') + num(row, 'entregado'),
    )
    const delivered = days.rows.map((row) => num(row, 'entregado'))
    charts.push({
      title: 'Entregas por día',
      kind: 'line',
      aria: `Pedidos por día. El máximo de entregados es ${Math.max(0, ...delivered)}.`,
      labels,
      series: [
        { name: 'Pedidos', color: CHART_PRINT.gray, values: totals },
        { name: 'Entregados', color: CHART_PRINT.blue, values: delivered },
      ],
    })
  }
  const slots = section(model, 'franja')
  if (slots && slots.rows.length > 0) {
    const labels = slots.rows.map((row) => cellText(slots.columns[0], row))
    const series: ChartSeries[] = [
      { name: 'Entregado antes', color: CHART_PRINT.blue, values: slots.rows.map((row) => num(row, 'antes')) },
      { name: 'En horario', color: CHART_PRINT.green, values: slots.rows.map((row) => num(row, 'en')) },
      { name: 'Con demora', color: CHART_PRINT.orange, values: slots.rows.map((row) => num(row, 'demora')), hatch: true },
      { name: 'Sin franja', color: CHART_PRINT.gray, values: slots.rows.map((row) => num(row, 'sin')) },
    ]
    const sums = series.map((item) => item.values.reduce((sum, value) => sum + value, 0))
    const withSlot = sums[0] + sums[1] + sums[2]
    const onTime = withSlot ? Math.round(((sums[0] + sums[1]) / withSlot) * 1000) / 10 : 0
    const late = withSlot ? Math.round((sums[2] / withSlot) * 1000) / 10 : 0
    charts.push({
      title: 'Cumplimiento de franja',
      kind: 'stacked',
      aria: `En horario ${oneDecimal(onTime)}, con demora ${oneDecimal(late)}.`,
      labels,
      series,
    })
  }
  for (const id of ['vendedores', 'zonas'] as const) {
    const group = section(model, id)
    if (!group || group.rows.length === 0) continue
    const top = topGroups(group.rows)
    charts.push({
      title: group.title,
      kind: 'hbar',
      aria: top.labels.map((label, index) => `${label} ${formatPct(top.values[index])}`).join(', '),
      labels: top.labels,
      series: [{ name: '% en horario', color: CHART_PRINT.green, values: top.values }],
      notes: top.notes,
    })
  }
  const drivers = section(model, 'choferes')
  if (drivers) {
    const closed = drivers.rows.filter((row) => !row.pending)
    if (closed.length > 0) {
      charts.push({
        title: 'Por chofer',
        kind: 'drivers',
        aria: closed.map((row) => `${row.values.name} ${num(row, 'trips')} viajes`).join(', '),
        labels: closed.map((row) => String(row.values.name ?? '')),
        series: [
          { name: 'Viajes cerrados', color: CHART_PRINT.blue, values: closed.map((row) => num(row, 'trips')) },
          { name: 'Km', color: CHART_PRINT.gray, values: closed.map((row) => num(row, 'km')) },
        ],
        notes: closed.map((row) => cellText(drivers.columns.find((column) => column.key === 'amount') ?? drivers.columns[0], row)),
      })
    }
  }
  const claims = section(model, 'reclamos-estado')
  if (claims && claims.rows.length > 0) {
    charts.push({
      title: 'Reclamos por estado',
      kind: 'bar',
      aria: claims.rows.map((row) => `${row.values.label} ${num(row, 'count')}`).join(', '),
      labels: claims.rows.map((row) => String(row.values.label ?? '')),
      series: [{ name: 'Reclamos', color: CHART_PRINT.blue, values: claims.rows.map((row) => num(row, 'count')) }],
    })
  }
  const pickups = section(model, 'retiros-dia')
  if (pickups && pickups.rows.length > 0) {
    charts.push({
      title: 'Retiros por día',
      kind: 'bar',
      aria: `Retiros por día. El máximo es ${Math.max(...pickups.rows.map((row) => num(row, 'total')))}.`,
      labels: pickups.rows.map((row) => cellText(pickups.columns[0], row)),
      series: [{ name: 'Retiros', color: CHART_PRINT.blue, values: pickups.rows.map((row) => num(row, 'total')) }],
    })
  }
  return charts
}
