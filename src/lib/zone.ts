import { DELIVERY_ZONES, type DeliveryZone } from '../data/catalog'
import { DAY_LONG, DAY_SHORT, parseIso } from './week'

export type DeliveryZoneName = (typeof DELIVERY_ZONES)[number]['name']

export type ZonePlace = {
  city?: string
  town?: string
  suburb?: string
  state?: string
  municipality?: string
  city_district?: string
  county?: string
  neighbourhood?: string
  quarter?: string
  village?: string
  hamlet?: string
  state_district?: string
  province?: string
  road?: string
  house_number?: string
}

export type ZoneQuery = {
  address?: string
  displayName?: string
  place?: ZonePlace
}

const LOCALITY_KEYS = [
  'city',
  'town',
  'suburb',
  'municipality',
  'city_district',
  'county',
  'neighbourhood',
  'quarter',
  'village',
  'hamlet',
  'state_district',
  'province',
] as const satisfies readonly (keyof ZonePlace)[]

// Partidos y localidades distintivas: se buscan en toda la dirección.
// Los de una sola palabra y las avenidas homónimas se descartan si parecen el nombre de la calle.
const ANYWHERE: { zone: DeliveryZoneName; names: string[] }[] = [
  {
    zone: 'GBA Norte',
    names: [
      'Vicente López',
      'San Isidro',
      'San Fernando',
      'General San Martín',
      'José C. Paz',
      'Jose C Paz',
      'Malvinas Argentinas',
      'San Miguel',
      'Escobar',
      'Pilar',
      'Tigre',
    ],
  },
  {
    zone: 'GBA Oeste',
    names: [
      'Tres de Febrero',
      '3 de Febrero',
      'La Matanza',
      'Ituzaingó',
      'Hurlingham',
      'Ramos Mejía',
      'González Catán',
      'Lomas del Mirador',
      'Isidro Casanova',
      'Rafael Castillo',
      'Morón',
      'Merlo',
      'Moreno',
    ],
  },
  {
    zone: 'GBA Sur',
    names: [
      'Florencio Varela',
      'Almirante Brown',
      'Lomas de Zamora',
      'Esteban Echeverría',
      'Berazategui',
      'Presidente Perón',
      'Lanús',
      'Quilmes',
      'Avellaneda',
      'Ezeiza',
    ],
  },
]

// Barrios y localidades ambiguas (también son calles): solo cuentan como localidad,
// no como el nombre de la calle con altura.
const LOCAL_ONLY: { zone: DeliveryZoneName; names: string[] }[] = [
  {
    zone: 'CABA',
    names: [
      'Parque Avellaneda',
      'Parque Chacabuco',
      'Parque Patricios',
      'Puerto Madero',
      'Villa del Parque',
      'Villa General Mitre',
      'Villa Pueyrredón',
      'Villa Santa Rita',
      'Villa Ortúzar',
      'Villa Urquiza',
      'Villa Devoto',
      'Villa Crespo',
      'Villa Lugano',
      'Villa Soldati',
      'Villa Riachuelo',
      'Villa Luro',
      'Villa Real',
      'Nueva Pompeya',
      'San Cristóbal',
      'Vélez Sársfield',
      'Monte Castro',
      'La Paternal',
      'Barrio Norte',
      'Microcentro',
      'Agronomía',
      'Balvanera',
      'Caballito',
      'Chacarita',
      'Colegiales',
      'Constitución',
      'Floresta',
      'Mataderos',
      'Monserrat',
      'Palermo',
      'Recoleta',
      'Saavedra',
      'San Nicolás',
      'San Telmo',
      'Versalles',
      'Barracas',
      'Belgrano',
      'Coghlan',
      'Liniers',
      'Almagro',
      'Flores',
      'Retiro',
      'Boedo',
      'Núñez',
      'La Boca',
      'Parque Chas',
    ],
  },
  {
    zone: 'GBA Norte',
    names: [
      'San Martín',
      'Villa Ballester',
      'Los Polvorines',
      'Grand Bourg',
      'Boulogne',
      'Nordelta',
      'Martínez',
      'Olivos',
      'Munro',
      'Beccar',
      'Victoria',
      'Virreyes',
    ],
  },
  {
    zone: 'GBA Oeste',
    names: ['San Justo', 'Castelar', 'Caseros', 'Haedo', 'Ciudadela', 'Palomar'],
  },
  {
    zone: 'GBA Sur',
    names: [
      'Lomas',
      'Temperley',
      'Adrogué',
      'Banfield',
      'Longchamps',
      'Berazategui',
      'Bernal',
      'Wilde',
      'Sarandí',
      'Burzaco',
      'Claypole',
    ],
  },
  {
    // Buenos Aires fuera del anillo de reparto, u otra provincia.
    zone: 'Provincia',
    names: [
      'La Plata',
      'Mar del Plata',
      'Bahía Blanca',
      'San Nicolás de los Arroyos',
      'Córdoba',
      'Rosario',
      'Mendoza',
      'Santa Fe',
      'Tucumán',
      'Salta',
      'Entre Ríos',
      'Misiones',
      'Corrientes',
      'Chaco',
      'Formosa',
      'Jujuy',
      'Santiago del Estero',
      'Catamarca',
      'La Rioja',
      'San Juan',
      'San Luis',
      'Neuquén',
      'Río Negro',
      'Chubut',
      'Santa Cruz',
      'Tierra del Fuego',
      'La Pampa',
      'Zárate',
      'Campana',
      'Luján',
      'Pergamino',
      'Tandil',
    ],
  },
]

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function asQuery(input: string | ZoneQuery): ZoneQuery {
  return typeof input === 'string' ? { address: input } : input
}

function localityFields(place: ZonePlace | undefined) {
  if (!place) return ''
  return LOCALITY_KEYS.map((key) => place[key])
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

function looksLikePlaceOnly(address: string) {
  const trimmed = address.trim()
  if (!trimmed || /\d/.test(trimmed)) return false
  return !/^(av|avda|avenida|calle|pasaje|pje|boulevard|bv|diag|diagonal|ruta)\b/i.test(fold(trimmed))
}

function localityFromAddress(address: string) {
  const parts = address.split(',')
  const tail = parts.length > 1 ? parts.slice(1).join(',') : ''
  const barrio = address.match(/barrio\s+[^,]+/i)?.[0] ?? ''
  const bare = looksLikePlaceOnly(address) ? address.trim() : ''
  return [tail, barrio, bare].filter(Boolean).join('\n')
}

// "Av. Moreno 100" o "Moreno 1200" es la calle, no el partido.
function isStreetUse(source: string, start: number, end: number) {
  const before = source.slice(0, start)
  const after = source.slice(end)
  const prefixed =
    /(?:^|[^a-z0-9])(?:av|avda|avenida|calle|callejon|pasaje|pje|boulevard|bvd|bv|diag|diagonal|ruta)\.?\s*$/i.test(
      before,
    )
  return prefixed || /^\s+\d/.test(after)
}

function bestMatch(
  haystack: string,
  groups: { zone: DeliveryZoneName; names: string[] }[],
) {
  const source = fold(haystack)
  let best: { zone: DeliveryZoneName; length: number } | undefined
  for (const group of groups) {
    for (const name of group.names) {
      const needle = fold(name)
      if (needle.length < 3) continue
      const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?=[^a-z0-9]|$)`, 'g')
      let match: RegExpExecArray | null
      while ((match = pattern.exec(source))) {
        const start = match.index + match[0].length - needle.length
        if (isStreetUse(source, start, start + needle.length)) continue
        if (!best || needle.length > best.length) best = { zone: group.zone, length: needle.length }
        break
      }
    }
  }
  return best
}

function hasCabaMarker(text: string) {
  return /ciudad autonoma|\bcaba\b|capital federal|\bcomuna\s+\d{1,2}\b/.test(fold(text))
}

function hasProvincePhrase(text: string) {
  return /provincia de buenos aires|pcia\.?\s+de buenos aires/.test(fold(text))
}

function bareBuenosAires(address: string) {
  return address.split(',').some((part) => fold(part).trim() === 'buenos aires')
}

export function asDeliveryZone(
  value: string | undefined,
  zones: readonly Pick<DeliveryZone, 'name'>[],
): string | undefined {
  if (!value) return undefined
  return zones.find((item) => item.name === value)?.name
}

export function zoneDays(zone: string | undefined, zones: readonly DeliveryZone[]) {
  return zones.find((item) => item.name === zone)?.days
}

export function inferZone(input: string | ZoneQuery): DeliveryZoneName | undefined {
  const query = asQuery(input)
  const address = query.address?.trim() ?? ''
  const displayName = query.displayName?.trim() ?? ''
  const place = query.place
  const state = fold(place?.state ?? '')
  const locality = [localityFromAddress(address), localityFields(place), displayName]
    .filter(Boolean)
    .join('\n')
  const full = [address, displayName, state, locality].filter(Boolean).join('\n')

  // CABA explícita gana sobre un partido que también aparezca en el texto.
  if (hasCabaMarker(state) || hasCabaMarker(full)) return 'CABA'

  const broad = bestMatch(full, ANYWHERE)
  const local = bestMatch(locality, LOCAL_ONLY)
  if (local && (!broad || local.length > broad.length)) return local.zone
  if (broad) return broad.zone

  // Sin partido del anillo: la provincia de Buenos Aires u otra provincia.
  // "Buenos Aires" a secas, en la dirección o en city, se lee como CABA.
  if (state === 'buenos aires' || hasProvincePhrase(full)) return 'Provincia'
  if ((fold(place?.city ?? '') === 'buenos aires' && state !== 'buenos aires') || bareBuenosAires(address)) {
    return 'CABA'
  }
  return undefined
}

export function zoneDayWarning(
  zone: string | undefined,
  isoDate: string | undefined,
  zones: readonly DeliveryZone[],
) {
  const days = zoneDays(zone, zones)
  if (!zone || !isoDate || !days || fold(days) === 'sin dias') return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return undefined
  const date = parseIso(isoDate)
  if (Number.isNaN(date.getTime())) return undefined
  const short = fold(DAY_SHORT[date.getDay()])
  const allowed = days.split('·').map((part) => fold(part.trim()))
  if (allowed.includes(short)) return undefined
  const long = DAY_LONG[date.getDay()].toLowerCase()
  return `Esa fecha es un ${long} y ${zone} reparte ${days}.`
}
