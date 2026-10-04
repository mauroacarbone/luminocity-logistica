const GAP_MS = 1100
const USER_AGENT = 'LuminocityLogistica/1.0 (operacion interna de reparto)'

let tail = Promise.resolve()
let nextAt = 0

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Una consulta de Nominatim por segundo, con User-Agent propio. */
export function geocodeAddress(address) {
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
    })
    if (response.status === 429 || response.status >= 500) {
      throw new Error('nominatim')
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
