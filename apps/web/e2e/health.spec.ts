import { expect, test } from '@playwright/test'

// The endpoint Railway polls, called the way Railway calls it.
test('the health check reports the app and the database are up', async ({
  page,
}) => {
  const response = await page.request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'ok', db: 'ok' })
})
