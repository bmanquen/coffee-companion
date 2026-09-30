import { afterEach, describe, expect, it, vi } from 'vitest'
import { erasePerson, setPersonErasure } from './erase-person'

describe('erasePerson', () => {
  afterEach(() => {
    setPersonErasure(null)
  })

  it('does nothing when no erasure is wired', async () => {
    await expect(erasePerson('user_123')).resolves.toBeUndefined()
  })

  it('forwards the account id once an erasure is wired', async () => {
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    await erasePerson('user_123')

    expect(erase).toHaveBeenCalledWith('user_123')
  })
})
