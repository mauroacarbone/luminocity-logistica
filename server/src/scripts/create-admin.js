import { randomUUID } from 'node:crypto'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { normalizeName } from '../access.js'
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

if (!usingDatabase()) {
  console.error('Falta DATABASE_URL. El usuario admin se crea en Postgres.')
  process.exit(1)
}

const input = await readInput()
if (!input) process.exit(1)

try {
  await ensureSchema()
  const passwordHash = await bcrypt.hash(input.password, 10)
  await withTransaction(async () => {
    const users = await readCollection('users')
    const email = input.email
    if (users.some((user) => user.email === email)) {
      throw new Error('Ya hay una cuenta con ese email.')
    }
    const nameKey = normalizeName(input.name)
    if (nameKey && users.some((user) => normalizeName(user.name) === nameKey)) {
      throw new Error('Ya hay una cuenta con ese nombre.')
    }
    users.push({
      id: randomUUID(),
      name: input.name,
      email,
      passwordHash,
      role: 'admin',
    })
    await writeCollection('users', users)
  })
  console.log(`Usuario admin creado: ${input.email}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}

async function readInput() {
  const fromEnv =
    process.env.ADMIN_EMAIL !== undefined ||
    process.env.ADMIN_PASSWORD !== undefined ||
    process.env.ADMIN_NAME !== undefined
  let email = ''
  let password = ''
  let name = ''
  if (fromEnv) {
    email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
    password = String(process.env.ADMIN_PASSWORD ?? '')
    name = String(process.env.ADMIN_NAME ?? '').trim()
  } else if (!stdin.isTTY) {
    console.error('Pasá ADMIN_EMAIL y ADMIN_PASSWORD, o corré el script en una terminal.')
    return null
  } else {
    const answers = await askAll()
    email = answers.email
    password = answers.password
    name = answers.name
  }
  if (!name) name = 'Admin'
  if (!EMAIL.test(email)) {
    console.error('Ingresá un email válido.')
    return null
  }
  if (password.length < 10) {
    console.error('Usá al menos 10 caracteres.')
    return null
  }
  return { email, password, name }
}

async function askAll() {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    const email = (await rl.question('Email: ')).trim().toLowerCase()
    const password = await rl.question('Contraseña: ')
    const name = (await rl.question('Nombre (Admin): ')).trim()
    return { email, password, name }
  } finally {
    rl.close()
  }
}
