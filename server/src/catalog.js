import { Router } from 'express'
import { CATALOG_DEFAULTS } from './catalogDefaults.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireRole } from './middleware.js'
import { normalizeTimeWindow } from './orders.js'

const LIST_MAX = 500
const ITEM_MAX = 120

const LISTS = [
  { key: 'sellers', label: 'Vendedores', kind: 'strings' },
  { key: 'ownTransporters', label: 'Entrega propia', kind: 'strings' },
  { key: 'courierTransporters', label: 'Correo / Courier', kind: 'strings' },
  { key: 'zones', label: 'Zonas', kind: 'zones' },
  { key: 'propertyTypes', label: 'Tipos de propiedad', kind: 'strings' },
  { key: 'timeWindows', label: 'Franjas horarias', kind: 'windows' },
]

function quote(value) {
  return `“${String(value)}”`
}

function itemKey(value) {
  return String(value).trim().toLocaleLowerCase('es-AR')
}

function tooLong(label, value) {
  return `${label}: ${quote(value)} supera los 120 caracteres.`
}

function repeated(label, value) {
  return `${label}: ${quote(value)} está repetido.`
}

function validateStrings(label, value, { windows = false } = {}) {
  if (!Array.isArray(value)) return { error: `${label}: tiene que ser una lista.` }
  if (value.length > LIST_MAX) return { error: `${label}: hay más de ${LIST_MAX} ítems.` }
  const seen = new Set()
  const next = []
  for (const item of value) {
    if (typeof item !== 'string') return { error: `${label}: hay un valor que no es texto.` }
    const stored = windows ? normalizeTimeWindow(item) : item
    if (!stored.trim()) return { error: `${label}: hay un valor vacío.` }
    if (stored.length > ITEM_MAX) return { error: tooLong(label, stored) }
    const key = itemKey(stored)
    if (seen.has(key)) return { error: repeated(label, stored) }
    seen.add(key)
    next.push(stored)
  }
  return { value: next }
}

function validateZones(label, value) {
  if (!Array.isArray(value)) return { error: `${label}: tiene que ser una lista.` }
  if (value.length > LIST_MAX) return { error: `${label}: hay más de ${LIST_MAX} ítems.` }
  const seen = new Set()
  const next = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `${label}: hay una zona que no es válida.` }
    }
    const name = item.name
    const days = item.days
    if (typeof name !== 'string' || typeof days !== 'string') {
      return { error: `${label}: hay una zona que no es válida.` }
    }
    if (!name.trim()) return { error: `${label}: hay un valor vacío.` }
    if (!days.trim()) return { error: `${label}: ${quote(name)} no tiene días.` }
    if (name.length > ITEM_MAX) return { error: tooLong(label, name) }
    if (days.length > ITEM_MAX) return { error: tooLong(label, days) }
    const key = itemKey(name)
    if (seen.has(key)) return { error: repeated(label, name) }
    seen.add(key)
    next.push({ name, days })
  }
  return { value: next }
}

function validateList(spec, value) {
  if (spec.kind === 'zones') return validateZones(spec.label, value)
  if (spec.kind === 'windows') return validateStrings(spec.label, value, { windows: true })
  return validateStrings(spec.label, value)
}

function present(stored) {
  const catalog = {}
  for (const spec of LISTS) {
    catalog[spec.key] = Array.isArray(stored?.[spec.key]) ? stored[spec.key] : []
  }
  const empty = !stored || typeof stored !== 'object' || Array.isArray(stored) || Object.keys(stored).length === 0
  return { catalog, empty }
}

async function readStored() {
  const stored = await readCollection('catalog')
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  return stored
}

function validatePatch(body, { full = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'El catálogo no es válido.' }
  }
  const next = {}
  let count = 0
  for (const spec of LISTS) {
    if (!(spec.key in body)) {
      if (full) return { error: `${spec.label}: falta la lista.` }
      continue
    }
    count += 1
    const parsed = validateList(spec, body[spec.key])
    if (parsed.error) return parsed
    next[spec.key] = parsed.value
  }
  if (!full && count === 0) return { error: 'No hay listas para guardar.' }
  return { value: next }
}

export const catalogRouter = Router()

catalogRouter.get('/', async (_req, res) => {
  const stored = await readStored()
  res.json(present(stored))
})

catalogRouter.put('/', requireRole('admin'), async (req, res) => {
  const parsed = validatePatch(req.body)
  if (parsed.error) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const saved = await locked(async () => {
    const current = await readStored()
    const next = { ...current, ...parsed.value }
    await writeCollection('catalog', next)
    return next
  })
  res.json(present(saved))
})

catalogRouter.post('/import', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const body = req.body
  const seed = Boolean(body && typeof body === 'object' && !Array.isArray(body) && body.seed === true)
  const parsed = seed ? { value: structuredClone(CATALOG_DEFAULTS) } : validatePatch(body, { full: true })
  if (parsed.error) {
    res.status(400).json({ message: parsed.error })
    return
  }
  try {
    const saved = await locked(async () => {
      const current = await readStored()
      if (Object.keys(current).length > 0) {
        const error = new Error('Los datos maestros ya están cargados en el servidor.')
        error.status = 409
        throw error
      }
      await writeCollection('catalog', parsed.value)
      return parsed.value
    })
    res.json(present(saved))
  } catch (error) {
    if (error?.status === 409) {
      res.status(409).json({ message: error.message })
      return
    }
    throw error
  }
})
