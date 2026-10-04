const GAP_MS = 1100
const USER_AGENT = 'LuminocityLogistica/1.0 (mauro@luminocity.local)'

let tail = Promise.resolve()
let nextAt = 0
const inflight = new Map()

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryable(message) {
  const error = new Error(message)
  error.retry = true
  return error
}

function lookup(address) {
  const run = async () => {
    const delay = Math.max(0, nextAt - Date.now())
    nextAt = Date.now() + delay + GAP_MS
    if (delay > 0) await wait(delay)

    const query = /argentina/i.test(address) ? address : `${address}, Argentina`
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'ar')
    url.searchParams.set('q', query)

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (response.status === 429 || response.status >= 500) {
      throw retryable('nominatim')
    }
    if (!response.ok) return null
    const hits = await response.json()
    const hit = Array.isArray(hits) ? hits[0] : null
    if (!hit) return null
    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  const task = tail.then(run, run)
  tail = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/** Una consulta de Nominatim por segundo. La misma dirección en curso se reutiliza. */
export function geocodeAddress(address) {
  const key = address.trim().toLocaleLowerCase('es')
  const current = inflight.get(key)
  if (current) return current
  const task = lookup(address).finally(() => {
    if (inflight.get(key) === task) inflight.delete(key)
  })
  inflight.set(key, task)
  return task
}
