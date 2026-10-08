import { describe, expect, it } from 'vitest'
import { welcomeMessage } from './welcome'

describe('welcomeMessage', () => {
  it('names the app', () => {
    expect(welcomeMessage()).toBe('Coffee Companion')
  })
})
