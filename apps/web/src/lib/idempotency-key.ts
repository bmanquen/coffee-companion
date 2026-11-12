const UUID_BYTES = 16
const UUID_VERSION_INDEX = 6
const UUID_VARIANT_INDEX = 8
const UUID_VERSION_4 = 0x40
const UUID_VARIANT_RFC4122 = 0x80

function byteToHex(value: number) {
  return value.toString(16).padStart(2, '0')
}

export function createIdempotencyKey() {
  const bytes = new Uint8Array(UUID_BYTES)
  crypto.getRandomValues(bytes)
  bytes[UUID_VERSION_INDEX] =
    (bytes[UUID_VERSION_INDEX] & 0x0f) | UUID_VERSION_4
  bytes[UUID_VARIANT_INDEX] =
    (bytes[UUID_VARIANT_INDEX] & 0x3f) | UUID_VARIANT_RFC4122
  const hex = Array.from(bytes, byteToHex).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
