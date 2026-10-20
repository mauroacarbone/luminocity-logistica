import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { DEMO_EMAIL } from '../users.js'
import {
  closeDatabase,
  ensureSchema,
  readCollection,
  usingDatabase,
  withTransaction,
  writeCollection,
} from '../db/store.js'

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(serverRoot, '.env') })

/** Lista fija. Una colección nueva no entra sola. */
const PURGE = ['orders', 'picking', 'routeSheets', 'claims', 'notifications', 'authorizations', 'locations']

function describeBase() {
  if (!usingDatabase()) return 'Base: archivos JSON en server/data'
  const raw = String(process.env.DATABASE_URL ?? '').trim()
  try {
    const host = new URL(raw).hostname
    return `Base: Postgres (host ${host})`
  } catch {
    return 'Base: Postgres'
  }
}

function readBefore(argv) {
  let confirm = false
  let before = null
  for (const arg of argv) {
    if (arg === '--confirm') {
      confirm = true
      continue
    }
    if (arg.startsWith('--before=')) {
      before = arg.slice('--before='.length)
      continue
    }
    console.error(`No entiendo el argumento ${arg}.`)
    process.exit(1)
  }
  if (before === null) return { confirm, cutoff: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    console.error('La fecha tiene que ser YYYY-MM-DD.')
    process.exit(1)
  }
  const [year, month, day] = before.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  const real =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  if (!real) {
    console.error('La fecha tiene que ser YYYY-MM-DD.')
    process.exit(1)
  }
  return { confirm, cutoff: Date.parse(`${before}T00:00:00.000-03:00`) }
}

function stamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

function dated(name, record) {
  if (name === 'locations') return stamp(record?.updatedAt)
  return stamp(record?.createdAt)
}

function entriesOf(name, value) {
  if (name === 'locations') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    return Object.entries(value).map(([id, data]) => ({ id, data }))
  }
  if (!Array.isArray(value)) return []
  return value.map((data, index) => ({ id: String(index), data }))
}

function keepValue(name, value, kept) {
  if (name === 'locations') {
    const next = {}
    for (const item of kept) next[item.id] = item.data
    return next
  }
  return kept.map((item) => item.data)
}

function splitCollection(name, value, cutoff) {
  const entries = entriesOf(name, value)
  const kept = []
  let remove = 0
  let undated = 0
  for (const entry of entries) {
    if (cutoff === null) {
      remove += 1
      continue
    }
    const when = dated(name, entry.data)
    if (when === null) {
      undated += 1
      kept.push(entry)
      continue
    }
    if (when < cutoff) remove += 1
    else kept.push(entry)
  }
  return {
    name,
    total: entries.length,
    remove,
    undated,
    keep: keepValue(name, value, kept),
    removedOrderIds:
      name === 'orders'
        ? entries
            .filter((entry) => !kept.includes(entry) && typeof entry.data?.id === 'string')
            .map((entry) => entry.data.id)
        : [],
  }
}

function pickingLeft(picking, removedOrderIds) {
  if (!Array.isArray(picking) || removedOrderIds.length === 0) return 0
  const gone = new Set(removedOrderIds)
  return picking.filter((row) => row && typeof row.orderId === 'string' && gone.has(row.orderId)).length
}

function printPlan(plan, leftover) {
  const nameWidth = Math.max('colección'.length, ...plan.map((item) => item.name.length))
  const totalWidth = Math.max('registros'.length, ...plan.map((item) => String(item.total).length))
  const removeWidth = Math.max('a borrar'.length, ...plan.map((item) => String(item.remove).length))
  const line = (name, total, remove) =>
    `${name.padEnd(nameWidth)}  ${total.padStart(totalWidth)}  ${remove.padStart(removeWidth)}`
  console.log(line('colección', 'registros', 'a borrar'))
  for (const item of plan) console.log(line(item.name, String(item.total), String(item.remove)))
  for (const item of plan) {
    if (item.undated > 0) console.log(`${item.name}: sin fecha: ${item.undated}`)
  }
  if (leftover > 0) console.log(`quedan ${leftover} filas de picking vinculadas a pedidos borrados`)
}

const { confirm, cutoff } = readBefore(process.argv.slice(2))

try {
  console.log(describeBase())
  await ensureSchema()
  const plan = await withTransaction(async () => {
    const users = await readCollection('users')
    const demoPresent = (Array.isArray(users) ? users : []).some((user) => user?.email === DEMO_EMAIL)
    const next = []
    for (const name of PURGE) {
      const value = await readCollection(name)
      const split = splitCollection(name, value, cutoff)
      next.push(split)
      if (confirm) await writeCollection(name, split.keep)
    }
    return { plan: next, demoPresent }
  })
  const orders = plan.plan.find((item) => item.name === 'orders')
  const picking = plan.plan.find((item) => item.name === 'picking')
  const leftover = cutoff === null ? 0 : pickingLeft(picking?.keep, orders?.removedOrderIds ?? [])
  if (!confirm) console.log(`Usuario demo presente: ${plan.demoPresent ? 'sí' : 'no'}`)
  printPlan(plan.plan, leftover)
  if (!confirm) {
    console.log('Simulacro: no se borró nada. Para borrar, agregá --confirm.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await closeDatabase()
}
