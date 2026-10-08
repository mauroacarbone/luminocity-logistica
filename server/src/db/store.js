import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { COLLECTION_NAMES, assertCollectionName, ensureTables } from './schema.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data')

const SPECS = {
  users: { file: 'users.json', kind: 'array' },
  orders: { file: 'orders.json', kind: 'array' },
  notifications: { file: 'notifications.json', kind: 'array' },
  authorizations: { file: 'authorizations.json', kind: 'array' },
  locations: { file: 'locations.json', kind: 'object' },
  routeSheets: { file: 'routeSheets.json', kind: 'array' },
  picking: { file: 'picking.json', kind: 'array' },
  claims: { file: 'claims.json', kind: 'array' },
}

const tx = new AsyncLocalStorage()
let pool

export function usingDatabase() {
  return Boolean(String(process.env.DATABASE_URL ?? '').trim())
}

function specOf(name) {
  const spec = SPECS[name]
  if (!spec) throw new Error(`Colección desconocida: ${name}`)
  return spec
}

function fileOf(name) {
  return path.join(dataDir, specOf(name).file)
}

function emptyValue(kind) {
  return kind === 'array' ? [] : {}
}

function parseStored(kind, raw) {
  const parsed = JSON.parse(raw)
  if (kind === 'array') return Array.isArray(parsed) ? parsed : []
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed
}

function isLocalHost(connectionString) {
  try {
    const host = new URL(connectionString).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

// El sslmode de la URL pisa la opción ssl del pool. Lo sacamos y lo decidimos acá.
function stripSslParams(connectionString) {
  const queryAt = connectionString.indexOf('?')
  if (queryAt === -1) return connectionString
  const params = new URLSearchParams(connectionString.slice(queryAt + 1))
  for (const key of [...params.keys()]) {
    const name = key.toLowerCase()
    if (name === 'sslmode' || name === 'ssl') params.delete(key)
  }
  const rest = params.toString()
  return rest ? `${connectionString.slice(0, queryAt)}?${rest}` : connectionString.slice(0, queryAt)
}

function sslFor(connectionString) {
  if (isLocalHost(connectionString)) return false
  return { rejectUnauthorized: true }
}

function stripNullChars(value) {
  if (typeof value === 'string') return value.replaceAll('\u0000', '')
  if (Array.isArray(value)) return value.map(stripNullChars)
  if (!value || typeof value !== 'object') return value
  const next = {}
  for (const [key, item] of Object.entries(value)) {
    next[stripNullChars(key)] = stripNullChars(item)
  }
  return next
}

function jsonData(value) {
  return JSON.stringify(stripNullChars(value))
}

function getPool() {
  const connectionString = String(process.env.DATABASE_URL ?? '').trim()
  if (!connectionString) throw new Error('Falta DATABASE_URL.')
  if (!pool) {
    pool = new pg.Pool({
      connectionString: stripSslParams(connectionString),
      ssl: sslFor(connectionString),
      max: 10,
      connectionTimeoutMillis: 10000,
    })
    pool.on('error', (error) => {
      console.error('Error de Postgres', error)
    })
  }
  return pool
}

function context() {
  return tx.getStore() ?? null
}

function queryable() {
  return context()?.client ?? getPool()
}

function watchClient(client) {
  let failure = null
  const onError = (error) => {
    failure = error
    console.error('Error de Postgres', error)
  }
  client.on('error', onError)
  return {
    failure: () => failure,
    finish() {
      client.removeListener('error', onError)
      client.release(failure || undefined)
    },
  }
}

async function readFileCollection(name) {
  const spec = specOf(name)
  try {
    const raw = await readFile(fileOf(name), 'utf8')
    return parseStored(spec.kind, raw)
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyValue(spec.kind)
    throw error
  }
}

async function writeFileCollection(name, value) {
  const file = fileOf(name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function rowsFrom(name, value) {
  const spec = specOf(name)
  if (spec.kind === 'array') {
    if (!Array.isArray(value)) throw new Error(`La colección ${name} tiene que ser una lista.`)
    const seen = new Set()
    return value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`El registro ${index} de ${name} no es válido.`)
      }
      if (typeof item.id !== 'string' || !item.id.trim()) {
        throw new Error(`El registro ${index} de ${name} no tiene id.`)
      }
      if (seen.has(item.id)) throw new Error(`Id repetido en ${name}: ${item.id}`)
      seen.add(item.id)
      return { id: item.id, data: item }
    })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`La colección ${name} tiene que ser un objeto.`)
  }
  return Object.entries(value).map(([id, data]) => {
    if (!id) throw new Error('Una ubicación no tiene id.')
    return { id, data }
  })
}

const UPSERT = (table) =>
  `INSERT INTO ${table} (id, data, updated_at)
   VALUES ($1, $2::jsonb, now())
   ON CONFLICT (id) DO UPDATE
   SET data = EXCLUDED.data, updated_at = now()`

function rememberSnapshot(name, rows) {
  const store = context()
  if (!store) return
  const photo = new Map()
  for (const row of rows) photo.set(row.id, jsonData(row.data))
  store.snapshots.set(name, photo)
}

async function readPostgres(name) {
  const table = assertCollectionName(name)
  const spec = specOf(name)
  const result = await queryable().query(
    `SELECT id, data FROM ${table} ORDER BY (data->>'createdAt') NULLS LAST, id`,
  )
  rememberSnapshot(
    name,
    result.rows.map((row) => ({ id: row.id, data: row.data })),
  )
  if (spec.kind === 'array') return result.rows.map((row) => row.data)
  const object = {}
  for (const row of result.rows) object[row.id] = row.data
  return object
}

async function snapshotOf(name) {
  const store = context()
  if (store?.snapshots.has(name)) return store.snapshots.get(name)
  await readPostgres(name)
  return context()?.snapshots.get(name) ?? new Map()
}

function logDiff(name, written, deleted) {
  if (process.env.NODE_ENV === 'production') return
  console.log(`Postgres ${name}: ${written} escritas, ${deleted} borradas`)
}

async function applyDiff(client, name, rows) {
  const table = assertCollectionName(name)
  const snapshot = await snapshotOf(name)
  const nextIds = new Set(rows.map((row) => row.id))
  const removed = []
  for (const id of snapshot.keys()) {
    if (!nextIds.has(id)) removed.push(id)
  }
  const changed = []
  for (const row of rows) {
    const json = jsonData(row.data)
    if (snapshot.get(row.id) !== json) changed.push({ id: row.id, json })
  }
  if (removed.length > 0) {
    await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [removed])
  }
  for (const row of changed) {
    await client.query(UPSERT(table), [row.id, row.json])
  }
  rememberSnapshot(
    name,
    rows.map((row) => ({ id: row.id, data: stripNullChars(row.data) })),
  )
  logDiff(name, changed.length, removed.length)
}

async function runTransaction(task) {
  if (context()) return task()
  const client = await getPool().connect()
  const watch = watchClient(client)
  const store = { client, snapshots: new Map() }
  try {
    await client.query('BEGIN')
    const result = await tx.run(store, task)
    const failure = watch.failure()
    if (failure) throw failure
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // La conexión ya no sirve; el error original es el que importa.
    }
    throw error
  } finally {
    watch.finish()
  }
}

async function withClient(fn) {
  return runTransaction(() => fn(context().client))
}

export async function readCollection(name) {
  specOf(name)
  if (!usingDatabase()) return readFileCollection(name)
  return readPostgres(name)
}

export async function writeCollection(name, value) {
  specOf(name)
  if (!usingDatabase()) {
    await writeFileCollection(name, value)
    return
  }
  const rows = rowsFrom(name, value)
  await withClient((client) => applyDiff(client, name, rows))
}

/** Lee el JSON de server/data aunque DATABASE_URL esté definida. */
export async function readJsonFile(name) {
  return readFileCollection(name)
}

/** Carga registros sin borrar los que ya están. Se puede correr de nuevo. */
export async function upsertCollection(name, value) {
  if (!usingDatabase()) throw new Error('Falta DATABASE_URL.')
  const rows = rowsFrom(name, value)
  const table = assertCollectionName(name)
  await withClient(async (client) => {
    for (const row of rows) {
      await client.query(UPSERT(table), [row.id, jsonData(row.data)])
    }
  })
  return rows.length
}

export async function collectionFileExists(name) {
  specOf(name)
  try {
    await readFile(fileOf(name), 'utf8')
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') return false
    throw error
  }
}

export async function ensureSchema() {
  if (!usingDatabase()) return
  const db = getPool()
  await ensureTables((sql) => db.query(sql))
}

export async function checkDatabase() {
  if (!usingDatabase()) return
  await getPool().query('SELECT 1')
}

/** En Postgres abre una transacción. Sin base, corre la tarea como está. */
export async function withTransaction(task) {
  if (!usingDatabase()) return task()
  return runTransaction(task)
}

export async function closeDatabase() {
  if (!pool) return
  const current = pool
  pool = null
  await current.end()
}

export { COLLECTION_NAMES }
