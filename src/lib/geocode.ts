import type { ZonePlace, ZoneQuery } from './zone'

export type GeocodeHit = {
  id: string
  label: string
  detail: string
  hint: ZoneQuery
  lat: number
  lng: number
}

export type LocatedAddress = {
  street: string
  hint: ZoneQuery
  between: string[]
}

const NOMINATIM_GAP_MS = 1100
const AMBA_VIEWBOX = '-59.15,-34.2,-58.15,-35.1'
const AMBA_LAT = '-34.6'
const AMBA_LON = '-58.4'
const ROAD_KEYS = [
  'road',
  'pedestrian',
  'residential',
  'living_street',
  'footway',
  'path',
  'cycleway',
  'construction',
] as const

let nominatimReady: Promise<void> = Promise.resolve()
let nominatimNext = 0

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

export function pause(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(finish, ms)
    function finish() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort)
  })
}

function isNetworkError(error: unknown) {
  if (isAbortError(error)) return false
  if (error instanceof TypeError) return true
  if (typeof error !== 'object' || error === null) return false
  const message = 'message' in error ? String(error.message) : ''
  return /network|failed to fetch|load failed|fetch/i.test(message)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueParts(parts: string[]) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const part of parts) {
    const clean = part.trim()
    if (!clean) continue
    const key = clean.toLocaleLowerCase('es')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(clean)
  }
  return unique
}

function placeFromRecord(record: Record<string, unknown> | undefined): ZonePlace {
  const place: ZonePlace = {}
  if (!record) return place
  const road = ROAD_KEYS.map((key) => text(record[key])).find(Boolean)
  const fields: [keyof ZonePlace, unknown][] = [
    ['road', road],
    ['house_number', record.house_number],
    ['city', record.city],
    ['town', record.town],
    ['suburb', record.suburb],
    ['state', record.state],
    ['municipality', record.municipality],
    ['city_district', record.city_district],
    ['county', record.county],
    ['neighbourhood', record.neighbourhood],
    ['quarter', record.quarter],
    ['village', record.village],
    ['hamlet', record.hamlet],
    ['state_district', record.state_district],
    ['province', record.province],
  ]
  for (const [key, value] of fields) {
    const clean = text(value)
    if (clean) place[key] = clean
  }
  return place
}

function shortLabel(place: ZonePlace, displayName: string) {
  const road = place.road?.trim() ?? ''
  const number = place.house_number?.trim() ?? ''
  if (road && number && !road.endsWith(` ${number}`)) return `${road} ${number}`
  if (road) return road
  return displayName.split(',')[0]?.trim() ?? ''
}

function detailOf(place: ZonePlace, displayName: string, label: string) {
  const labelKey = label.toLocaleLowerCase('es')
  const fromPlace = uniqueParts([
    place.neighbourhood ?? '',
    place.quarter ?? '',
    place.suburb ?? '',
    place.city_district ?? '',
    place.city ?? '',
    place.town ?? '',
    place.village ?? '',
    place.municipality ?? '',
    place.state ?? '',
  ]).filter((part) => !labelKey.includes(part.toLocaleLowerCase('es')))
  if (fromPlace.length > 0) return fromPlace.slice(0, 3).join(' · ')
  return uniqueParts(displayName.split(',').slice(1))
    .filter((part) => !labelKey.includes(part.toLocaleLowerCase('es')))
    .slice(0, 3)
    .join(' · ')
}

function hintFor(label: string, displayName: string, place: ZonePlace): ZoneQuery {
  return {
    address: label,
    displayName: displayName || label,
    place,
  }
}

async function nominatimGet(url: URL, signal?: AbortSignal) {
  const run = async () => {
    if (signal?.aborted) throw abortError()
    await pause(nominatimNext - Date.now(), signal)
    if (signal?.aborted) throw abortError()
    nominatimNext = Date.now() + NOMINATIM_GAP_MS
    return fetch(url, { headers: { 'Accept-Language': 'es' }, signal })
  }
  const task = nominatimReady.then(run, run)
  nominatimReady = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

type NominatimSearchHit = {
  place_id?: number
  lat?: string
  lon?: string
  display_name?: string
  address?: Record<string, unknown>
}

function hitFromNominatim(item: NominatimSearchHit, index: number): GeocodeHit | null {
  const lat = Number(item.lat)
  const lng = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const displayName = text(item.display_name)
  const place = placeFromRecord(item.address)
  const label = shortLabel(place, displayName)
  if (!label) return null
  return {
    id: String(item.place_id ?? `nominatim-${index}`),
    label,
    detail: detailOf(place, displayName, label),
    hint: hintFor(label, displayName, place),
    lat,
    lng,
  }
}

async function searchNominatim(query: string, signal?: AbortSignal) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'ar')
  url.searchParams.set('q', query)
  url.searchParams.set('viewbox', AMBA_VIEWBOX)
  url.searchParams.set('bounded', '0')
  const response = await nominatimGet(url, signal)
  if (!response.ok) throw new Error('No se pudo buscar la dirección.')
  const hits = (await response.json()) as NominatimSearchHit[]
  return hits.map(hitFromNominatim).filter((hit): hit is GeocodeHit => Boolean(hit))
}

type PhotonProps = {
  osm_id?: number
  osm_type?: string
  name?: string
  street?: string
  housenumber?: string
  city?: string
  state?: string
  country?: string
  countrycode?: string
  district?: string
  locality?: string
  county?: string
}

function hitFromPhoton(
  props: PhotonProps,
  coordinates: [number, number] | undefined,
  index: number,
): GeocodeHit | null {
  const lng = coordinates?.[0]
  const lat = coordinates?.[1]
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const country = text(props.countrycode).toUpperCase()
  if (country && country !== 'AR') return null
  const road = text(props.street) || text(props.name)
  const place = placeFromRecord({
    road,
    house_number: props.housenumber,
    city: props.city,
    state: props.state,
    county: props.county,
    suburb: props.district || props.locality,
    neighbourhood: props.locality,
    city_district: props.district,
  })
  const displayName = uniqueParts([
    road,
    text(props.housenumber),
    text(props.district),
    text(props.locality),
    text(props.city),
    text(props.county),
    text(props.state),
    text(props.country),
  ]).join(', ')
  const label = shortLabel(place, displayName)
  if (!label) return null
  return {
    id: `${props.osm_type ?? 'photon'}-${props.osm_id ?? index}`,
    label,
    detail: detailOf(place, displayName, label),
    hint: hintFor(label, displayName, place),
    lat,
    lng,
  }
}

async function searchPhoton(query: string, signal?: AbortSignal) {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')
  url.searchParams.set('lang', 'es')
  url.searchParams.set('lat', AMBA_LAT)
  url.searchParams.set('lon', AMBA_LON)
  const response = await fetch(url, { headers: { 'Accept-Language': 'es' }, signal })
  if (!response.ok) return []
  const data = (await response.json()) as {
    features?: { geometry?: { coordinates?: [number, number] }; properties?: PhotonProps }[]
  }
  const hits = (data.features ?? [])
    .map((feature, index) =>
      hitFromPhoton(feature.properties ?? {}, feature.geometry?.coordinates, index),
    )
    .filter((hit): hit is GeocodeHit => Boolean(hit))
  return dedupe(hits)
}

function dedupe(hits: GeocodeHit[]) {
  const seen = new Set<string>()
  return hits.filter((hit) => {
    const key = `${hit.label.toLocaleLowerCase('es')}|${hit.detail.toLocaleLowerCase('es')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function geocodeSearch(query: string, signal?: AbortSignal) {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []
  if (signal?.aborted) throw abortError()
  try {
    const hits = dedupe(await searchNominatim(trimmed, signal))
    if (hits.length > 0) return hits
  } catch (error) {
    if (isAbortError(error)) throw error
    // Autocompletado: un solo reintento silencioso ante error de red.
    if (isNetworkError(error)) {
      try {
        const retry = dedupe(await searchNominatim(trimmed, signal))
        if (retry.length > 0) return retry
      } catch (retryError) {
        if (isAbortError(retryError)) throw retryError
      }
    }
  }
  if (signal?.aborted) throw abortError()
  return searchPhoton(trimmed, signal)
}

async function reverseAddress(latitude: number, longitude: number, signal?: AbortSignal) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('addressdetails', '1')
  const response = await nominatimGet(url, signal)
  if (!response.ok) throw new Error('No se pudo completar la dirección.')
  const data = (await response.json()) as {
    display_name?: string
    address?: Record<string, unknown>
  }
  const displayName = text(data.display_name)
  const place = placeFromRecord(data.address)
  const street = shortLabel(place, displayName)
  return {
    street,
    hint: hintFor(street, displayName, place),
  }
}

function foldStreet(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\b(avenida|av|calle|pasaje|pje|boulevard|bvar|bv|diagonal|diag)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sameStreet(left: string, right: string) {
  const a = foldStreet(left)
  const b = foldStreet(right)
  if (!a || !b) return false
  if (a === b) return true
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  return shorter.length >= 5 && longer.includes(shorter)
}

type MeterPoint = { x: number; y: number }

function toMeters(originLat: number, originLng: number, lat: number, lng: number): MeterPoint {
  const latRad = (originLat * Math.PI) / 180
  return {
    x: (lng - originLng) * 111320 * Math.cos(latRad),
    y: (lat - originLat) * 110540,
  }
}

function closestSegment(
  originLat: number,
  originLng: number,
  geometry: { lat: number; lon: number }[],
) {
  let best: { distance: number; bearing: number } | null = null
  for (let index = 1; index < geometry.length; index += 1) {
    const start = toMeters(originLat, originLng, geometry[index - 1].lat, geometry[index - 1].lon)
    const end = toMeters(originLat, originLng, geometry[index].lat, geometry[index].lon)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length2 = dx * dx + dy * dy
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (-start.x * dx - start.y * dy) / length2))
    const x = start.x + dx * t
    const y = start.y + dy * t
    const distance = Math.hypot(x, y)
    const bearing = Math.atan2(dx, dy)
    if (!best || distance < best.distance) best = { distance, bearing }
  }
  return best
}

function angleApart(left: number, right: number) {
  const delta = Math.abs(left - right) % Math.PI
  return delta > Math.PI / 2 ? Math.PI - delta : delta
}

async function crossStreets(lat: number, lng: number, road: string, signal?: AbortSignal) {
  const query = `[out:json][timeout:12];
way(around:120,${lat},${lng})["name"]["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"];
out geom;`
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  })
  if (!response.ok) return []
  const data = (await response.json()) as {
    elements?: {
      type?: string
      tags?: { name?: string }
      geometry?: { lat: number; lon: number }[]
    }[]
  }
  const ways = (data.elements ?? [])
    .map((element) => {
      const name = text(element.tags?.name)
      const geometry = element.type === 'way' ? element.geometry : undefined
      if (!name || !geometry || geometry.length < 2) return null
      const closest = closestSegment(lat, lng, geometry)
      if (!closest) return null
      return { name, ...closest }
    })
    .filter((way): way is { name: string; distance: number; bearing: number } => Boolean(way))

  const main = ways
    .filter((way) => sameStreet(way.name, road) && way.distance <= 45)
    .sort((left, right) => left.distance - right.distance)[0]
  if (!main) return []

  const seen = new Set<string>()
  const crosses: string[] = []
  for (const way of ways.sort((left, right) => left.distance - right.distance)) {
    if (way.distance > 110 || sameStreet(way.name, road)) continue
    if (angleApart(way.bearing, main.bearing) < Math.PI / 6) continue
    const key = foldStreet(way.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    crosses.push(way.name)
    if (crosses.length === 2) break
  }
  return crosses
}

async function describePoint(hit: GeocodeHit, signal?: AbortSignal): Promise<LocatedAddress> {
  let place: ZonePlace = { ...hit.hint.place }
  let displayName = hit.hint.displayName ?? hit.label
  try {
    const reversed = await reverseAddress(hit.lat, hit.lng, signal)
    const reversedPlace = reversed.hint.place
    if (reversedPlace?.road && place.road && !sameStreet(reversedPlace.road, place.road)) {
      const locality = { ...reversedPlace }
      delete locality.road
      delete locality.house_number
      place = { ...place, ...locality, road: place.road, house_number: place.house_number }
    } else if (reversedPlace) {
      place = {
        ...place,
        ...reversedPlace,
        road: reversedPlace.road || place.road,
        house_number: reversedPlace.house_number || place.house_number,
      }
    }
    if (reversed.hint.displayName) displayName = reversed.hint.displayName
  } catch (error) {
    if (isAbortError(error)) throw error
  }
  const street = shortLabel(place, displayName) || hit.label
  let between: string[] = []
  try {
    between = await crossStreets(hit.lat, hit.lng, place.road || street, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
  }
  return { street, hint: hintFor(street, displayName, place), between }
}

export async function locatePoint(hit: GeocodeHit, signal?: AbortSignal) {
  return describePoint(hit, signal)
}

export async function locateAddress(query: string, signal?: AbortSignal) {
  const hits = await geocodeSearch(query, signal)
  const hit = hits[0]
  if (!hit) throw new Error('No encontramos esa dirección.')
  return describePoint(hit, signal)
}

/** Ubicar solo con Photon (tercer intento de Ubicar). */
export async function locateAddressPhoton(query: string, signal?: AbortSignal) {
  const trimmed = query.trim()
  if (trimmed.length < 3) throw new Error('No encontramos esa dirección.')
  if (signal?.aborted) throw abortError()
  const hits = await searchPhoton(trimmed, signal)
  const hit = hits[0]
  if (!hit) throw new Error('No encontramos esa dirección.')
  return describePoint(hit, signal)
}

/** Separa calle y altura al final (ej. "Av. Corrientes 1234"). */
export function splitStreetNumber(address: string): { street: string; number: string } {
  const trimmed = address.trim()
  const match = trimmed.match(/^(.*?)[\s,]+(\d+[A-Za-z]?)\s*$/)
  if (!match) return { street: trimmed, number: '' }
  const street = match[1].trim()
  const number = match[2].trim()
  if (!street) return { street: trimmed, number: '' }
  return { street, number }
}

/** Repone la altura en el resultado si la búsqueda fue sin número. */
export function withHouseNumber(located: LocatedAddress, number: string): LocatedAddress {
  const height = number.trim()
  if (!height) return located
  const street = located.street.trim()
  if (!street) return located
  if (new RegExp(`\\b${height.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(street)) {
    return located
  }
  const road = located.hint.place?.road?.trim() || street
  const nextStreet = /\d/.test(street) ? `${street} ${height}` : `${road} ${height}`
  const place = {
    ...located.hint.place,
    road: located.hint.place?.road || road.replace(new RegExp(`\\s+${height}$`), ''),
    house_number: height,
  }
  return {
    ...located,
    street: nextStreet,
    hint: {
      ...located.hint,
      address: nextStreet,
      place,
    },
  }
}
