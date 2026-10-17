import { useEffect, useRef, useState } from 'react'
import type { ChartSeries } from '../../lib/reportCharts'

export function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next && next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, width, narrow: width < 480 }
}

export function formatTick(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

export function fillOf(series: ChartSeries, patternId: string) {
  return series.hatch ? `url(#${patternId})` : `var(${series.swatch})`
}

export function shorten(label: string, max = 16) {
  if (label.length <= max) return label
  return `${label.slice(0, max - 1)}…`
}
