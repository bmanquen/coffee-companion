// Seam so the API never imports PostHog — ADR-0014. Account deletion hands the
// account id to whatever the server wired; tests hand a fake.

export type PersonErasure = (accountId: string) => Promise<void>

let erase: PersonErasure | null = null

export function setPersonErasure(next: PersonErasure | null) {
  erase = next
}

export async function erasePerson(accountId: string) {
  await erase?.(accountId)
}
