import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  COLLECTION_NAMES,
  closeDatabase,
  ensureSchema,
  readJsonFile,
  upsertCollection,
  usingDatabase,
} from '../db/store.js'

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(serverRoot, '.env') })

if (!usingDatabase()) {
  console.error('Falta DATABASE_URL. No se puede migrar a Postgres.')
  process.exit(1)
}

try {
  await ensureSchema()
  for (const name of COLLECTION_NAMES) {
    const value = await readJsonFile(name)
    const count = await upsertCollection(name, value)
    console.log(`${name}: ${count}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
