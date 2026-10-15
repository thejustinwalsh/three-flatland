import CachePolicy from 'http-cache-semantics'
import { describe, expect, it } from 'vitest'

const request = (headers: CachePolicy.Headers = {}): CachePolicy.HttpRequest => ({
  url: 'https://cache-fixture.invalid/account',
  method: 'GET',
  headers: { host: 'cache-fixture.invalid', cookie: 'session=user-a', ...headers },
})

function policy(headers: CachePolicy.Headers, options?: CachePolicy.Options, requestHeaders?: CachePolicy.Headers) {
  const result = new CachePolicy(
    request(requestHeaders),
    {
      status: 200,
      headers: { date: new Date().toUTCString(), ...headers },
    },
    options
  )
  result.age = () => 60
  return result
}

const blocked = [
  { name: 'shared Set-Cookie without explicit opt-in', headers: { 'set-cookie': 'session=secret-a' } },
  { name: 'no-cache', headers: { 'cache-control': 'no-cache' } },
  { name: 'no-store', headers: { 'cache-control': 'no-store' } },
  { name: 'shared private response', headers: { 'cache-control': 'private' } },
  { name: 'shared proxy-revalidate', headers: { 'cache-control': 'proxy-revalidate' } },
  { name: 'must-revalidate', headers: { 'cache-control': 'must-revalidate' } },
  { name: 'Vary wildcard', headers: { vary: '*' } },
  { name: 'authenticated response without opt-in', headers: {}, requestHeaders: { authorization: 'Bearer user-a' } },
]

describe('HTTP cache security regressions (GHSA-ch52-4w7c-c8xp)', () => {
  it.each(blocked)('requires synchronous origin validation for $name', ({ headers, requestHeaders }) => {
    const original = policy(
      {
        ...headers,
        'cache-control': `${headers['cache-control'] ?? ''}, stale-while-revalidate=120, stale-if-error=120`,
      },
      undefined,
      requestHeaders
    )
    // Cover existing disk-cache entries as well as newly constructed policies.
    const restored = CachePolicy.fromObject(original.toObject())
    restored.age = () => 60
    for (const cached of [original, restored]) {
      for (const stale of [{}, { 'cache-control': 'max-stale=999999' }]) {
        const next = request({ cookie: 'session=user-b', ...stale })
        expect(cached.satisfiesWithoutRevalidation(next)).toBe(false)
        const evaluation = cached.evaluateRequest(next)
        expect(evaluation.response).toBeUndefined()
        expect(evaluation.revalidation?.synchronous).toBe(true)
        const failedValidation = cached.revalidatedPolicy(next, { status: 503, headers: {} })
        expect(failedValidation.modified).toBe(true)
        expect(failedValidation.matches).toBe(false)
      }
    }
  })

  it.each([
    { name: 'ordinary public response', headers: { 'cache-control': 'public, max-age=0' } },
    {
      name: 'explicitly public Set-Cookie response',
      headers: { 'cache-control': 'public, max-age=0', 'set-cookie': 'public-preference=value' },
    },
    {
      name: 'explicitly immutable Set-Cookie response',
      headers: { 'cache-control': 'immutable, max-age=0', 'set-cookie': 'public-preference=value' },
    },
    {
      name: 'private cache',
      headers: { 'cache-control': 'max-age=0', 'set-cookie': 'session=user-a' },
      options: { shared: false },
    },
  ])('preserves intentional stale reuse for $name', ({ headers, options }) => {
    const cached = policy({ ...headers, 'cache-control': `${headers['cache-control']}, stale-if-error=120` }, options)
    const next = request({ 'cache-control': 'max-stale=120' })
    expect(cached.satisfiesWithoutRevalidation(next)).toBe(true)
    expect(cached.revalidatedPolicy(next, { status: 503, headers: {} }).modified).toBe(false)
  })

  it('still rejects a different user selected by Vary', () => {
    const cached = policy({
      'cache-control': 'public, max-age=0, stale-if-error=120',
      'set-cookie': 'session=user-a',
      vary: 'Cookie',
    })
    const next = request({ cookie: 'session=user-b', 'cache-control': 'max-stale=120' })
    expect(cached.satisfiesWithoutRevalidation(next)).toBe(false)
    expect(cached.revalidatedPolicy(next, { status: 503, headers: {} }).modified).toBe(true)
  })
})
