import { pgErrorIn } from './pg-error'

// Raised by lookup_name_guard() with the saved name in DETAIL.
const LOOKUP_NAME_SHARED = 'LKSHR'
const LOOKUP_NAME_OWN = 'LKOWN'

type LookupNameClash = { kind: 'shared' | 'own'; savedName: string }

function parseLookupNameClash(err: unknown): LookupNameClash | null {
  const shared = pgErrorIn(err, LOOKUP_NAME_SHARED)
  if (shared) {
    return typeof shared.detail === 'string'
      ? { kind: 'shared', savedName: shared.detail }
      : null
  }
  const own = pgErrorIn(err, LOOKUP_NAME_OWN)
  if (own) {
    return typeof own.detail === 'string'
      ? { kind: 'own', savedName: own.detail }
      : null
  }
  return null
}

/** The sentence for a lookup write that lost to a saved name, or null for any other error. */
export function lookupNameClashMessage(err: unknown): string | null {
  const clash = parseLookupNameClash(err)
  if (!clash) return null
  switch (clash.kind) {
    case 'shared':
      return `${clash.savedName} is already in the list. Pick it there, or give yours a different name.`
    case 'own':
      return `You already have one called ${clash.savedName}. Pick it there, or give this one a different name.`
  }
}
