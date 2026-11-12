// The brewing device type that espresso shots must use. Seeded as a system
// default (see seed.ts / the brewing_device_types migration).
export const ESPRESSO_DEVICE_TYPE = 'Espresso'

export const ESPRESSO_SHOT_PAGE_SIZE = 20

export const ESPRESSO_SHOT_Q_MAX = 100

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Postgres timestamp is microseconds; JS Date is milliseconds. The cursor
// carries created_at as this to_char text so paging never drops same-ms rows.
export const ESPRESSO_CURSOR_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH24:MI:SS.US'
export const ESPRESSO_CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/

// Opaque next-page token. Clients pass it back as-is and never parse it.
export type EspressoShotCursor = string

type EspressoShotCursorKey = {
  createdAt: string
  id: string
}

export function encodeEspressoShotCursor(key: EspressoShotCursorKey): string {
  return Buffer.from(`${key.createdAt}\0${key.id}`, 'utf8').toString(
    'base64url',
  )
}

function isEspressoCursorTimestamp(value: string): boolean {
  if (!ESPRESSO_CURSOR_TIMESTAMP_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  const second = Number(value.slice(17, 19))
  if (month < 1 || month > 12) return false
  if (hour > 23 || minute > 59 || second > 59) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day >= 1 && day <= daysInMonth
}

export function decodeEspressoShotCursor(
  cursor: string,
): EspressoShotCursorKey | null {
  let payload: string
  try {
    payload = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const sep = payload.indexOf('\0')
  if (sep <= 0) return null
  const createdAt = payload.slice(0, sep)
  const id = payload.slice(sep + 1)
  if (!isEspressoCursorTimestamp(createdAt) || !UUID_PATTERN.test(id)) {
    return null
  }
  return { createdAt, id }
}

// Postgres numeric comes back as a string. Normalize so 16 and 16.0 compare
// equal without going through floating-point rounding.
export function normalizeDecimal(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const [wholeRaw, fractionRaw = ''] = trimmed.split('.')
  const wholeDigits = wholeRaw.replace(/^0+(?=\d)/, '') || '0'
  const fractionDigits = fractionRaw.replace(/0+$/, '')
  return fractionDigits ? `${wholeDigits}.${fractionDigits}` : wholeDigits
}

// Whether a brewing device is an Espresso-type device, i.e. valid for pulling
// espresso shots. Pure helper so it can be unit tested without a database.
export const isEspressoDevice = (device: { type: { name: string } }): boolean =>
  device.type.name === ESPRESSO_DEVICE_TYPE
