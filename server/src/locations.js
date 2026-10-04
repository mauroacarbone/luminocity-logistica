import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const locationsFile = path.join(dataDir, 'locations.json')

export async function readLocations() {
  try {
    const raw = await readFile(locationsFile, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    throw error
  }
}

async function writeLocations(locations) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(locationsFile, `${JSON.stringify(locations, null, 2)}\n`, 'utf8')
}

/** Reemplaza la posición de un usuario. No guarda el recorrido. */
export async function putLocation(userId, point) {
  const locations = await readLocations()
  locations[userId] = {
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    timestamp: point.timestamp,
    updatedAt: new Date().toISOString(),
  }
  await writeLocations(locations)
}

export async function forgetUsers(ids) {
  if (ids.length === 0) return
  const locations = await readLocations()
  let changed = false
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(locations, id)) continue
    delete locations[id]
    changed = true
  }
  if (changed) await writeLocations(locations)
}
