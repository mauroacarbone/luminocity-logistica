/** Una tabla por colección. El objeto queda igual, dentro de data. */
export const COLLECTION_NAMES = [
  'users',
  'orders',
  'notifications',
  'authorizations',
  'locations',
  'routeSheets',
  'tripRates',
  'picking',
  'claims',
]

const IDENT = /^[A-Za-z_]+$/

export function assertCollectionName(name) {
  if (!COLLECTION_NAMES.includes(name) || !IDENT.test(name)) {
    throw new Error(`Colección desconocida: ${name}`)
  }
  return name
}

export async function ensureTables(query) {
  for (const name of COLLECTION_NAMES) {
    assertCollectionName(name)
    await query(
      `CREATE TABLE IF NOT EXISTS ${name} (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    )
  }
}
