import { useState } from 'react'
import type { ChartSpec } from '../../lib/reportCharts'
import { fillOf, formatTick } from './chartFormat'
import { ChartFrame, ChartLegend } from './shared'

export function LineChart({ chart }: { chart: ChartSpec }) {
  const [tip, setTip] = useState<number | null>(null)
  const peak = Math.max(1, ...chart.series.flatMap((series) => series.values))
  const count = Math.max(1, chart.labels.length)
  return (
    <ChartFrame
      aria={chart.aria}
      legend={<ChartLegend series={chart.series} />}
      tip={tip == null ? null : <Tip chart={chart} index={tip} />}
    >
      {(_width, narrow, patternId) => {
        const step = count === 1 ? 0 : 560 / (count - 1)
        const skip = narrow && count > 8 ? 2 : 1
        return (
          <>
            <line x1="48" y1="180" x2="620" y2="180" stroke="var(--border)" />
            {chart.series.map((series) => (
              <polyline
                key={series.name}
                fill="none"
                stroke={fillOf(series, patternId)}
                strokeWidth="2.5"
                points={series.values.map((value, index) => `${48 + index * step},${180 - (value / peak) * 150}`).join(' ')}
              />
            ))}
            {chart.labels.map((label, index) => {
              const x = 48 + index * step
              const detail = chart.series.map((series) => `${series.name} ${formatTick(series.values[index] ?? 0)}`).join(', ')
              return (
                <g key={`${label}-${index}`}>
                  <rect
                    x={x - 10}
                    y="20"
                    width="20"
                    height="160"
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
                      x={x}
                      y="198"
                      fill="var(--text-muted)"
                      fontSize={narrow ? 9 : 11}
                      textAnchor={narrow ? 'end' : 'middle'}
                      transform={narrow ? `rotate(-40 ${x} 198)` : undefined}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </>
        )
      }}
    </ChartFrame>
  )
}

function Tip({ chart, index }: { chart: ChartSpec; index: number }) {
  const count = Math.max(1, chart.labels.length)
  const left = count === 1 ? 50 : (index / (count - 1)) * 100
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-2 z-10 max-w-56 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-md"
      style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
    >
      <p className="font-semibold">{chart.labels[index]}</p>
      {chart.series.map((series) => (
        <p key={series.name}>
          {series.name}: {formatTick(series.values[index] ?? 0)}
        </p>
      ))}
    </div>
  )
}
