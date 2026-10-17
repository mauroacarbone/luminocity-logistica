import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { deliveredTimeliness as serverTimeliness } from '../timeliness.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function stripImports(source) {
  return source
    .replace(/import type[\s\S]*?;\s*/g, '')
    .replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g, '')
    .replace(/export\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g, '')
}

const slotSource = stripImports(readFileSync(path.join(root, 'src/lib/slot.ts'), 'utf8'))
const timeSource = stripImports(readFileSync(path.join(root, 'src/lib/timeliness.ts'), 'utf8')).replace(
  'const window = normalizeTimeWindow(timeWindow)',
  'const window = slot.normalizeTimeWindow(timeWindow)',
)

const dir = await mkdtemp(path.join(tmpdir(), 'timeliness-'))
await writeFile(path.join(dir, 'slot.js'), transpile(slotSource), 'utf8')
await writeFile(
  path.join(dir, 'timeliness.js'),
  `import * as slot from './slot.js'\n${transpile(timeSource)}`,
  'utf8',
)
const client = await import(pathToFileURL(path.join(dir, 'timeliness.js')).href)

const end = Date.parse('2026-06-15T13:00:00-03:00')
const grace = 30 * 60 * 1000
const cases = [
  {
    name: 'antes',
    order: {
      status: 'entregado',
      deliveryDate: '2026-06-15',
      timeWindow: '09:00 - 13:00',
      deliveredAt: '2026-06-15T08:59:00-03:00',
    },
    expected: 'antes',
  },
  {
    name: 'limite +30',
    order: {
      status: 'entregado',
      deliveryDate: '2026-06-15',
      timeWindow: '09:00-13:00',
      deliveredAt: new Date(end + grace).toISOString(),
    },
    expected: 'en-horario',
  },
  {
    name: 'con demora',
    order: {
      status: 'entregado',
      deliveryDate: '2026-06-15',
      timeWindow: '09:00-13:00',
      deliveredAt: new Date(end + grace + 1).toISOString(),
    },
    expected: 'con-demora',
  },
  {
    name: 'sin entrega',
    order: { status: 'asignado', deliveryDate: '2026-06-15', timeWindow: '09:00-13:00', deliveredAt: '' },
    expected: null,
  },
]

let failed = 0
for (const item of cases) {
  const fromClient = client.deliveredTimeliness(item.order)
  const fromServer = serverTimeliness(item.order)
  if (fromClient !== item.expected || fromServer !== item.expected || fromClient !== fromServer) {
    failed += 1
    console.error(item.name, { fromClient, fromServer, expected: item.expected })
  }
}

if (failed > 0) {
  console.error(`${failed} casos distintos`)
  process.exit(1)
}
console.log(`Cliente y servidor coinciden en ${cases.length} casos`)
