import { randomUUID } from 'expo-crypto'

export function newIdempotencyKey() {
  return randomUUID()
}
