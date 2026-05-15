import { describe, it, expect } from 'vitest'
import type { Context } from 'hono'
import type { Env } from '../index'
import { buildQueryParams } from '../handlers/articles'

function mockContext(query: Record<string, string>): Context<{ Bindings: Env }> {
  return {
    req: { query: () => query, param: () => '', header: () => null, json: async () => ({}), formData: async () => new FormData() },
    env: {} as Env,
    text: () => new Response(),
    json: () => new Response(),
    redirect: () => new Response(),
    html: () => new Response(),
    body: () => new Response(),
    header: () => {},
    executionCtx: { waitUntil: () => {} },
    var: {},
    get: () => {},
    set: () => {},
    newResponse: () => new Response(),
    notFound: () => new Response(),
    res: new Response(),
    event: {} as any,
    finalized: false,
    error: undefined,
  } as unknown as Context<{ Bindings: Env }>
}

describe('buildQueryParams', () => {
  it('returns defaults when no query params', () => {
    const c = mockContext({})
    const params = buildQueryParams(c, 'user1')
    expect(params).toEqual({
      userID: 'user1',
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    })
  })

  it('uses custom limit and offset', () => {
    const c = mockContext({ limit: '10', offset: '20' })
    const params = buildQueryParams(c, 'user1')
    expect(params.limit).toBe(10)
    expect(params.offset).toBe(20)
  })

  it('sets sortOldest for sort=oldest', () => {
    const c = mockContext({ sort: 'oldest' })
    const params = buildQueryParams(c, 'user1')
    expect(params.sortOldest).toBe(true)
  })

  it('sets starredOnly for view=starred', () => {
    const c = mockContext({ view: 'starred' })
    const params = buildQueryParams(c, 'user1')
    expect(params.starredOnly).toBe(true)
    expect(params.unreadOnly).toBe(false)
  })

  it('sets unreadOnly for view=unread', () => {
    const c = mockContext({ view: 'unread' })
    const params = buildQueryParams(c, 'user1')
    expect(params.unreadOnly).toBe(true)
  })

  it('sets unreadOnly for view=fresh', () => {
    const c = mockContext({ view: 'fresh' })
    const params = buildQueryParams(c, 'user1')
    expect(params.unreadOnly).toBe(true)
  })

  it('parses feed_id filter', () => {
    const c = mockContext({ feed_id: '42' })
    const params = buildQueryParams(c, 'user1')
    expect(params.feedID).toBe(42)
  })

  it('parses category_id filter', () => {
    const c = mockContext({ category_id: '7' })
    const params = buildQueryParams(c, 'user1')
    expect(params.categoryID).toBe(7)
  })

  it('parses cursor pagination params', () => {
    const c = mockContext({ before: '2024-01-15T00:00:00Z', before_id: '100' })
    const params = buildQueryParams(c, 'user1')
    expect(params.beforeTime).toBe('2024-01-15T00:00:00Z')
    expect(params.beforeID).toBe(100)
  })

  it('parses after cursor pagination', () => {
    const c = mockContext({ after: '2024-01-15T00:00:00Z', after_id: '50' })
    const params = buildQueryParams(c, 'user1')
    expect(params.afterTime).toBe('2024-01-15T00:00:00Z')
    expect(params.afterID).toBe(50)
  })

  it('feed_id takes priority over category_id when no view', () => {
    const c = mockContext({ feed_id: '10', category_id: '20' })
    const params = buildQueryParams(c, 'user1')
    expect(params.feedID).toBe(10)
    expect(params.categoryID).toBeUndefined()
  })

  it('category_id with unread view sets categoryID', () => {
    const c = mockContext({ view: 'unread', category_id: '3' })
    const params = buildQueryParams(c, 'user1')
    expect(params.unreadOnly).toBe(true)
    expect(params.categoryID).toBe(3)
  })
})
