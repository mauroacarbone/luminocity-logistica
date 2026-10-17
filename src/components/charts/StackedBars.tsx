import { useState } from 'react'
import type { ChartSpec } from '../../lib/reportCharts'
import { fillOf, formatTick } from './chartFormat'
import { ChartFrame, ChartLegend } from './shared'

export function StackedBars({ chart }: { chart: ChartSpec }) {
  const [tip, setTip] = useState<number | null>(null)
  const count = Math.max(1, chart.labels.length)
  const totals = chart.labels.map((_, index) => chart.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0))
  const sums = chart.series.map((series) => series.values.reduce((sum, value) => sum + value, 0))
  const all = sums.reduce((sum, value) => sum + value, 0) || 1
  return (
    <ChartFrame
      aria={chart.aria}
      legend={<ChartLegend series={chart.series} />}
      tip={
        tip == null ? null : tip === -1 ? (
          <div role="tooltip" className="pointer-events-none absolute top-2 right-2 z-10 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-md">
            <p className="font-semibold">Período</p>
            {chart.series.map((series, index) => (
              <p key={series.name}>
                {series.name}: {formatTick((sums[index] / all) * 100)} %
              </p>
            ))}
          </div>
        ) : (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 max-w-56 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-md"
            style={{ left: `${(tip / count) * 80}%` }}
          >
            <p className="font-semibold">{chart.labels[tip]}</p>
            {chart.series.map((series) => (
              <p key={series.name}>
                {series.name}: {formatTick(series.values[tip] ?? 0)}
              </p>
            ))}
          </div>
        )
      }
    >
      {(_width, narrow, patternId) => {
        const plotW = chart.kind === 'stacked' ? 500 : 580
        const gap = count > 20 ? 2 : 6
        const barW = Math.max(4, (plotW - gap * count) / count)
        const skip = narrow && count > 8 ? 2 : 1
        return (
          <>
            {chart.labels.map((label, index) => {
              const x = 40 + index * (barW + gap)
              let y = 168
              const total = totals[index] || 1
              const detail = chart.series.map((series) => `${series.name} ${formatTick(series.values[index] ?? 0)}`).join(', ')
              return (
                <g key={`${label}-${index}`}>
                  {chart.series.map((series) => {
                    const height = ((series.values[index] ?? 0) / total) * 140
                    y -= height
                    return height > 0 ? (
                      <rect key={series.name} x={x} y={y} width={barW} height={height} fill={fillOf(series, patternId)} />
                    ) : null
                  })}
                  <rect
                    x={x}
                    y="20"
                    width={barW}
                    height="150"
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${label}: ${detail}`}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    onFocus={() => setTip(index)}
                    onBlur={() => setTip(null)}
                    onMouseEnter={() => setTip(index)}
                    onMouseLeave={() => setTip(null)}
                  />
                  {index % skip === 0 ? (
                    <text
                      x={x + barW / 2}
                      y="188"
                      fill="var(--text-muted)"
                      fontSize={narrow ? 9 : 11}
                      textAnchor={narrow ? 'end' : 'middle'}
                      transform={narrow ? `rotate(-40 ${x + barW / 2} 188)` : undefined}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {chart.kind === 'stacked' ? (
              <g>
                {(() => {
                  let y = 168
                  return chart.series.map((series, index) => {
                    const height = (sums[index] / all) * 140
                    y -= height
                    return height > 0 ? (
                      <rect key={series.name} x="560" y={y} width="28" height={height} fill={fillOf(series, patternId)} />
                    ) : null
                  })
                })()}
                <rect
                  x="552"
                  y="20"
                  width="44"
                  height="150"
                  fill="transparent"
                  tabIndex={0}
                  aria-label={chart.aria}
                  onFocus={() => setTip(-1)}
                  onBlur={() => setTip(null)}
                  onMouseEnter={() => setTip(-1)}
                  onMouseLeave={() => setTip(null)}
                />
                <text x="574" y="188" fill="var(--text-muted)" fontSize="11" textAnchor="middle">
                  Período
                </text>
              </g>
            ) : null}
            <line x1="40" y1="168" x2={40 + plotW} y2="168" stroke="var(--border)" />
          </>
        )
      }}
    </ChartFrame>
  )
}
