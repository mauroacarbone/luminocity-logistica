import { useState } from 'react'
import type { ChartSpec } from '../../lib/reportCharts'
import { fillOf, formatTick, shorten, useChartWidth } from './chartFormat'
import { ChartLegend } from './shared'

export function HBars({ chart }: { chart: ChartSpec }) {
  const [tip, setTip] = useState<number | null>(null)
  const { ref, narrow } = useChartWidth()
  const drivers = chart.kind === 'drivers'
  const primary = chart.series[0]
  const secondary = chart.series[1]
  const peak = Math.max(1, ...(primary?.values ?? [0]))
  const secondPeak = Math.max(1, ...(secondary?.values ?? [0]))
  const rowH = 28
  const height = Math.max(180, chart.labels.length * rowH + 16)
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      <ChartLegend series={chart.series} />
      <svg role="img" aria-label={chart.aria} viewBox={`0 0 640 ${height}`} className="h-auto w-full" style={{ minHeight: 180 }}>
        {chart.labels.map((label, index) => {
          const y = 8 + index * rowH
          const value = primary?.values[index] ?? 0
          const barW = (value / peak) * (drivers ? 160 : 280)
          const km = secondary?.values[index] ?? 0
          const kmW = (km / secondPeak) * 120
          const detail = drivers
            ? `${label}: ${formatTick(value)} viajes, ${formatTick(km)} km. ${chart.notes?.[index] ?? ''}`
            : `${label}: ${formatTick(value)} %. ${chart.notes?.[index] ?? ''}`
          return (
            <g key={`${label}-${index}`}>
              <text x="4" y={y + 16} fill="var(--text)" fontSize="12">
                {shorten(label, narrow ? 12 : 18)}
              </text>
              {primary ? (
                <rect x="150" y={y + 4} width={Math.max(1, barW)} height="14" fill={fillOf(primary, 'none')} rx="2" />
              ) : null}
              {drivers && secondary ? (
                <rect x="330" y={y + 4} width={Math.max(1, kmW)} height="14" fill={fillOf(secondary, 'none')} rx="2" />
              ) : null}
              <text x={drivers ? 460 : 440} y={y + 16} fill="var(--text-muted)" fontSize="11">
                {drivers ? (chart.notes?.[index] ?? '') : (chart.notes?.[index] ?? formatTick(value))}
              </text>
              <rect
                x="0"
                y={y}
                width="640"
                height={rowH - 4}
                fill="transparent"
                tabIndex={0}
                aria-label={detail}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                onFocus={() => setTip(index)}
                onBlur={() => setTip(null)}
                onMouseEnter={() => setTip(index)}
                onMouseLeave={() => setTip(null)}
              />
            </g>
          )
        })}
      </svg>
      {tip != null ? (
        <div role="tooltip" className="absolute top-8 left-36 z-10 max-w-64 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-md">
          <p className="font-semibold">{chart.labels[tip]}</p>
          <p>
            {primary?.name}: {formatTick(primary?.values[tip] ?? 0)}
            {chart.kind === 'hbar' ? ' %' : ''}
          </p>
          {drivers ? (
            <p>
              {secondary?.name}: {formatTick(secondary?.values[tip] ?? 0)}
            </p>
          ) : null}
          {chart.notes?.[tip] ? <p>{chart.notes[tip]}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
