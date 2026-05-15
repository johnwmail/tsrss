import { describe, it, expect, vi } from 'vitest'
import { queryArticles, getCounts } from '../db/queries'
import type { ArticleQueryParams } from '../db/queries'

type MockStmt = {
  bind: (...args: any[]) => MockStmt
  all: () => Promise<{ results: any[] }>
  first: () => Promise<any>
  run: () => Promise<void>
  _bindings: any[]
  _sql: string
}

function mockDB(): { db: any; stmts: MockStmt[] } {
  const stmts: MockStmt[] = []
  const db: any = {
    prepare: vi.fn((sql: string) => {
      const stmt: MockStmt = {
        bind: vi.fn((...args: any[]) => {
          stmt._bindings = args
          return stmt
        }),
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => {}),
        _bindings: [],
        _sql: sql,
      }
      stmts.push(stmt)
      return stmt
    }),
    batch: vi.fn(async (_stmts: any[]) => {}),
  }
  return { db, stmts }
}

describe('queryArticles', () => {
  it('builds basic query with defaults', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    expect(stmts).toHaveLength(1)
    const sql = stmts[0]._sql
    expect(sql).toContain('LEFT JOIN article_states')
    expect(sql).toContain('ORDER BY a.published_at DESC')
    expect(sql).toContain('LIMIT ? OFFSET ?')
    expect(stmts[0]._bindings).toEqual(['user1', 'user1', 50, 0])
  })

  it('uses INNER JOIN for starredOnly', async () => {
    const { db } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      unreadOnly: false,
      starredOnly: true,
      sortOldest: false,
      limit: 20,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = db.prepare.mock.calls[0][0] as string
    expect(sql).toContain('JOIN article_states')
    expect(sql).not.toContain('LEFT JOIN')
    expect(sql).toContain('s.is_starred = 1')
  })

  it('filters by feedID', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      feedID: 42,
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = stmts[0]._sql as string
    expect(sql).toContain('f.id = ?')
    expect(stmts[0]._bindings).toContain(42)
  })

  it('filters by categoryID', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      categoryID: 5,
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = stmts[0]._sql as string
    expect(sql).toContain('f.category_id = ?')
    expect(stmts[0]._bindings).toContain(5)
  })

  it('filters by uncategorized (categoryID=0)', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      categoryID: 0,
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = stmts[0]._sql as string
    expect(sql).toContain('f.category_id IS NULL')
    expect(sql).not.toContain('f.category_id = ?')
  })

  it('filters by unreadOnly', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      unreadOnly: true,
      starredOnly: false,
      sortOldest: false,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = stmts[0]._sql as string
    expect(sql).toContain('(s.is_read IS NULL OR s.is_read = 0)')
  })

  it('uses cursor pagination (before)', async () => {
    const { db, stmts } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      unreadOnly: false,
      starredOnly: false,
      sortOldest: false,
      limit: 20,
      offset: 0,
      beforeTime: '2024-01-15T00:00:00Z',
      beforeID: 100,
    }

    await queryArticles(db, params)

    const sql = stmts[0]._sql as string
    expect(sql).toContain('LIMIT ?')
    expect(sql).not.toContain('OFFSET')
    expect(stmts[0]._bindings).toContain('2024-01-15T00:00:00Z')
    expect(stmts[0]._bindings).toContain(100)
  })

  it('uses sortOldest for ascending order', async () => {
    const { db } = mockDB()
    const params: ArticleQueryParams = {
      userID: 'user1',
      unreadOnly: false,
      starredOnly: false,
      sortOldest: true,
      limit: 50,
      offset: 0,
    }

    await queryArticles(db, params)

    const sql = db.prepare.mock.calls[0][0] as string
    expect(sql).toContain('ORDER BY a.published_at ASC')
  })
})

describe('getCounts', () => {
  it('returns zero counts when no data', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => ({ count: 0 })),
          run: vi.fn(async () => {}),
        })),
      })),
      batch: vi.fn(async () => []),
    } as any

    const counts = await getCounts(db, 'user1')
    expect(counts).toEqual({
      total: 0,
      unread: 0,
      starred: 0,
      feeds: {},
    })
  })
})
