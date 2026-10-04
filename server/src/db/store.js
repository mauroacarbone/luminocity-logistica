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

function sslFor(connectionString) {
  const value = connectionString.toLowerCase()
  if (value.includes('sslmode=disable')) return false
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?(\/|\?|$)/.test(connectionString)
  if (local && !value.includes('sslmode=require') && !value.includes('sslmode=verify')) return false
  return { rejectUnauthorized: false }
}

function getPool() {
  const connectionString = String(process.env.DATABASE_URL ?? '').trim()
  if (!connectionString) throw new Error('Falta DATABASE_URL.')
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
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

function queryable() {
  return tx.getStore() ?? getPool()
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

async function replaceRows(client, name, rows) {
  const table = assertCollectionName(name)
  if (rows.length === 0) {
    await client.query(`DELETE FROM ${table}`)
    return
  }
  await client.query(`DELETE FROM ${table} WHERE id <> ALL($1::text[])`, [rows.map((row) => row.id)])
  for (const row of rows) {
    await client.query(UPSERT(table), [row.id, JSON.stringify(row.data)])
  }
}

async function readPostgres(name) {
  const table = assertCollectionName(name)
  const spec = specOf(name)
  const result = await queryable().query(`SELECT id, data FROM ${table} ORDER BY id`)
  if (spec.kind === 'array') return result.rows.map((row) => row.data)
  const object = {}
  for (const row of result.rows) object[row.id] = row.data
  return object
}

async function withClient(fn) {
  const current = tx.getStore()
  if (current) return fn(current)
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
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
    client.release()
  }
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
  await withClient((client) => replaceRows(client, name, rows))
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
      await client.query(UPSERT(table), [row.id, JSON.stringify(row.data)])
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
  if (tx.getStore()) return task()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await tx.run(client, () => task())
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
    client.release()
  }
}

export async function closeDatabase() {
  if (!pool) return
  const current = pool
  pool = null
  await current.end()
}

export { COLLECTION_NAMES }
