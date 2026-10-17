import { useId, type ReactNode } from 'react'
import type { ChartSeries } from '../../lib/reportCharts'
import { useChartWidth } from './chartFormat'

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text">
      {series.map((seriesItem) => (
        <li key={seriesItem.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded-sm"
            style={
              seriesItem.hatch
                ? {
                    background: `repeating-linear-gradient(-45deg, var(${seriesItem.swatch}), var(${seriesItem.swatch}) 2px, var(--bg) 2px, var(--bg) 3px)`,
                  }
                : { background: `var(${seriesItem.swatch})` }
            }
          />
          {seriesItem.name}
        </li>
      ))}
    </ul>
  )
}

export function ChartFrame({
  aria,
  legend,
  tip,
  children,
}: {
  aria: string
  legend: ReactNode
  tip: ReactNode
  children: (width: number, narrow: boolean, patternId: string) => ReactNode
}) {
  const { ref, width, narrow } = useChartWidth()
  const patternId = useId().replace(/:/g, '')
  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      {legend}
      <div className="relative min-h-[180px]" style={{ aspectRatio: '16 / 7' }}>
        <svg role="img" aria-label={aria} viewBox="0 0 640 220" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--chart-2)" />
              <rect width="2" height="6" fill="var(--bg)" />
            </pattern>
          </defs>
          {children(width, narrow, patternId)}
        </svg>
        {tip}
      </div>
    </div>
  )
}
