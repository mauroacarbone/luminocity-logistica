export type LatLng = { lat: number; lng: number }

export type PlannedRoute = {
  kilometers: number
  minutes: number
  line: [number, number][]
  sequence: number[]
}

type OsrmGeometry = { coordinates: [number, number][] }

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function coordPath(points: LatLng[]) {
  return points.map((point) => `${point.lng},${point.lat}`).join(';')
}

function lineFrom(geometry: OsrmGeometry): [number, number][] {
  return geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

function inCapital(displayName: string) {
  return /ciudad autónoma|ciudad autonoma|\bcaba\b/i.test(displayName)
}

async function geocodeNominatim(query: string): Promise<{ point: LatLng; capital: boolean } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'ar')
  url.searchParams.set('q', query)
  const response = await fetch(url, { headers: { 'Accept-Language': 'es' } })
  if (!response.ok) return null
  const hits = (await response.json()) as { lat: string; lon: string; display_name: string }[]
  const capitalHit = hits.find((item) => inCapital(item.display_name))
  const hit = capitalHit ?? hits[0]
  if (!hit) return null
  return {
    point: { lat: Number(hit.lat), lng: Number(hit.lon) },
    capital: inCapital(hit.display_name),
  }
}

async function geocodePhoton(query: string): Promise<LatLng | null> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '1')
  url.searchParams.set('lang', 'es')
  url.searchParams.set('lat', '-34.6')
  url.searchParams.set('lon', '-58.4')
  const response = await fetch(url)
  if (!response.ok) return null
  const data = (await response.json()) as {
    features?: { geometry?: { coordinates?: [number, number] } }[]
  }
  const coordinates = data.features?.[0]?.geometry?.coordinates
  if (!coordinates) return null
  return { lat: coordinates[1], lng: coordinates[0] }
}

export async function geocode(query: string) {
  const first = await geocodeNominatim(query).catch(() => null)
  if (first?.capital) return first.point
  if (!/ciudad autónoma|caba/i.test(query)) {
    await pause(1100)
    const second = await geocodeNominatim(`${query}, Ciudad Autónoma de Buenos Aires`).catch(() => null)
    if (second) return second.point
  }
  if (first) return first.point
  return geocodePhoton(query).catch(() => null)
}

export async function geocodeAll(queries: string[]) {
  const points: (LatLng | null)[] = []
  for (const [index, query] of queries.entries()) {
    if (index > 0) await pause(1100)
    points.push(await geocode(query))
  }
  return points
}

export async function drivingRoute(points: LatLng[]): Promise<PlannedRoute> {
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordPath(points)}?overview=full&geometries=geojson`,
  )
  if (!response.ok) throw new Error('No se pudo calcular la ruta.')
  const data = (await response.json()) as {
    code: string
    routes?: { distance: number; duration: number; geometry: OsrmGeometry }[]
  }
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route) {
    throw new Error('No hay un camino entre esas direcciones.')
  }
  return {
    kilometers: route.distance / 1000,
    minutes: Math.max(1, Math.round(route.duration / 60)),
    line: lineFrom(route.geometry),
    sequence: points.map((_, index) => index),
  }
}

export async function optimizedRoute(points: LatLng[]): Promise<PlannedRoute> {
  if (points.length < 3) return drivingRoute(points)
  const response = await fetch(
    `https://router.project-osrm.org/trip/v1/driving/${coordPath(points)}?source=first&roundtrip=false&overview=full&geometries=geojson`,
  )
  if (!response.ok) throw new Error('No se pudo optimizar el orden.')
  const data = (await response.json()) as {
    code: string
    trips?: { distance: number; duration: number; geometry: OsrmGeometry }[]
    waypoints?: { waypoint_index: number }[]
  }
  const trip = data.trips?.[0]
  const waypoints = data.waypoints
  if (data.code !== 'Ok' || !trip || !waypoints) {
    throw new Error('No hay un camino entre esas direcciones.')
  }
  const sequence = points
    .map((_, index) => index)
    .sort((left, right) => waypoints[left].waypoint_index - waypoints[right].waypoint_index)
  return {
    kilometers: trip.distance / 1000,
    minutes: Math.max(1, Math.round(trip.duration / 60)),
    line: lineFrom(trip.geometry),
    sequence,
  }
}
