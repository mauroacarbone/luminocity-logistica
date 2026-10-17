import type { ChartSpec } from '../../lib/reportCharts'
import { HBars } from './HBars'
import { LineChart } from './LineChart'
import { StackedBars } from './StackedBars'

export function SectionChart({ chart }: { chart: ChartSpec }) {
  if (chart.kind === 'line') return <LineChart chart={chart} />
  if (chart.kind === 'hbar' || chart.kind === 'drivers') return <HBars chart={chart} />
  return <StackedBars chart={chart} />
}
