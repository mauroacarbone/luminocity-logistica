import { readCollection, writeCollection } from './db/store.js'

export async function readLocations() {
  return readCollection('locations')
}

async function writeLocations(locations) {
  await writeCollection('locations', locations)
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
