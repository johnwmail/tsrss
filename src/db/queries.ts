import type { D1Database } from '@cloudflare/workers-types'
import type {
  ArticleRow,
  ArticleSummary,
  Category,
  Feed,
  FeedWithMeta,
  FeedForRefresh,
  CountsResult,
  Article,
} from './types'

// ── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(db: D1Database, userID: string, email: string | null): Promise<void> {
  const now = new Date().toISOString()
  await db.prepare(
    `INSERT INTO users (id, email, created_at, last_seen)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, last_seen = excluded.last_seen`
  ).bind(userID, email, now, now).run()
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(db: D1Database, userID: string, title: string): Promise<Category> {
  const res = await db.prepare(
    'INSERT INTO categories (user_id, title) VALUES (?, ?) RETURNING *'
  ).bind(userID, title).first<Category>()
  return res!
}

export async function getCategories(db: D1Database, userID: string): Promise<Category[]> {
  const res = await db.prepare(
    'SELECT * FROM categories WHERE user_id = ? ORDER BY title'
  ).bind(userID).all<Category>()
  return res.results
}

export async function getCategoriesOrdered(db: D1Database, userID: string): Promise<Category[]> {
  const res = await db.prepare(
    'SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC, title ASC'
  ).bind(userID).all<Category>()
  return res.results
}

export async function updateCategorySortOrder(db: D1Database, id: number, sortOrder: number, userID: string): Promise<void> {
  await db.prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND user_id = ?')
    .bind(sortOrder, id, userID).run()
}

// ── Feeds ───────────────────────────────────────────────────────────────────

export async function createFeed(
  db: D1Database,
  userID: string,
  categoryID: number | null,
  url: string,
  title: string,
  siteURL: string,
  description: string,
): Promise<Feed> {
  const res = await db.prepare(
    `INSERT INTO feeds (user_id, category_id, url, title, site_url, description)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(userID, categoryID, url, title, siteURL, description).first<Feed>()
  return res!
}

export async function getFeeds(db: D1Database, userID: string): Promise<FeedWithMeta[]> {
  const res = await db.prepare(
    `SELECT f.*, c.title as category_title,
      (SELECT COUNT(*) FROM articles a
       LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = f.user_id
       WHERE a.feed_id = f.id AND (s.is_read IS NULL OR s.is_read = 0)) as unread_count
     FROM feeds f
     LEFT JOIN categories c ON f.category_id = c.id
     WHERE f.user_id = ?
     ORDER BY f.title`
  ).bind(userID).all()
  return res.results as unknown as FeedWithMeta[]
}

export async function getFeedsOrdered(db: D1Database, userID: string): Promise<Feed[]> {
  const res = await db.prepare(
    'SELECT * FROM feeds WHERE user_id = ? ORDER BY sort_order ASC, title ASC'
  ).bind(userID).all<Feed>()
  return res.results
}

export async function getFeed(db: D1Database, id: number, userID: string): Promise<FeedWithMeta | null> {
  return db.prepare(
    `SELECT f.*, c.title as category_title
     FROM feeds f
     LEFT JOIN categories c ON f.category_id = c.id
     WHERE f.id = ? AND f.user_id = ?`
  ).bind(id, userID).first<FeedWithMeta>()
}

export async function getFeedByURL(db: D1Database, userID: string, url: string): Promise<Feed | null> {
  return db.prepare('SELECT * FROM feeds WHERE user_id = ? AND url = ?')
    .bind(userID, url).first<Feed>()
}

export async function updateFeedMeta(
  db: D1Database,
  id: number,
  title: string,
  siteURL: string,
  description: string,
  lastUpdated: string | null,
  lastError: string | null,
  etag: string,
  lastModified: string,
  errorCount: number,
): Promise<void> {
  await db.prepare(
    `UPDATE feeds SET
      title = ?, site_url = ?, description = ?,
      last_updated = ?, last_error = ?,
      etag = ?, last_modified = ?, error_count = ?
     WHERE id = ?`
  ).bind(title, siteURL, description, lastUpdated, lastError, etag, lastModified, errorCount, id).run()
}

export async function updateFeedDetails(db: D1Database, id: number, userID: string, title: string, url: string): Promise<void> {
  await db.prepare('UPDATE feeds SET title = ?, url = ? WHERE id = ? AND user_id = ?')
    .bind(title, url, id, userID).run()
}

export async function deleteFeed(db: D1Database, id: number, userID: string): Promise<void> {
  await db.prepare('DELETE FROM feeds WHERE id = ? AND user_id = ?').bind(id, userID).run()
}

export async function getAllFeedsForRefresh(db: D1Database, limit: number): Promise<FeedForRefresh[]> {
  const res = await db.prepare(
    'SELECT * FROM feeds ORDER BY last_updated ASC NULLS FIRST LIMIT ?'
  ).bind(limit).all<FeedForRefresh>()
  return res.results
}

export async function updateFeedSortOrder(db: D1Database, id: number, sortOrder: number, userID: string): Promise<void> {
  await db.prepare('UPDATE feeds SET sort_order = ? WHERE id = ? AND user_id = ?')
    .bind(sortOrder, id, userID).run()
}

export async function updateFeedCategory(db: D1Database, id: number, categoryID: number | null, sortOrder: number, userID: string): Promise<void> {
  await db.prepare('UPDATE feeds SET category_id = ?, sort_order = ? WHERE id = ? AND user_id = ?')
    .bind(categoryID, sortOrder, id, userID).run()
}

// ── Articles ────────────────────────────────────────────────────────────────

export async function upsertArticle(
  db: D1Database,
  feedID: number,
  guid: string,
  url: string,
  title: string,
  author: string,
  content: string,
  summary: string,
  publishedAt: string | null,
): Promise<Article> {
  const res = await db.prepare(
    `INSERT INTO articles (feed_id, guid, url, title, author, content, summary, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (feed_id, guid) DO UPDATE SET
       url = excluded.url, title = excluded.title, author = excluded.author,
       content = excluded.content, summary = excluded.summary, published_at = excluded.published_at
     RETURNING *`
  ).bind(feedID, guid, url, title, author, content, summary, publishedAt).first<Article>()
  return res!
}

// ── Article queries with dynamic filters ──

export interface ArticleQueryParams {
  userID: string
  categoryID?: number
  feedID?: number
  unreadOnly: boolean
  starredOnly: boolean
  sortOldest: boolean
  limit: number
  offset: number
  beforeTime?: string
  beforeID?: number
  afterTime?: string
  afterID?: number
}

export async function queryArticles(db: D1Database, params: ArticleQueryParams): Promise<ArticleSummary[]> {
  const filters: string[] = []
  const bindings: (string | number)[] = []

  const joinType = params.starredOnly ? 'JOIN' : 'LEFT JOIN'
  const orderCol = params.starredOnly ? 's.starred_at' : 'a.published_at'
  const orderDir = params.sortOldest ? 'ASC' : 'DESC'

  if (params.categoryID !== undefined) {
    if (params.categoryID === 0) {
      filters.push('f.category_id IS NULL')
    } else {
      filters.push('f.category_id = ?')
      bindings.push(params.categoryID)
    }
  }
  if (params.feedID !== undefined) {
    filters.push('f.id = ?')
    bindings.push(params.feedID)
  }
  if (params.unreadOnly) {
    filters.push('(s.is_read IS NULL OR s.is_read = 0)')
  }
  if (params.starredOnly) {
    filters.push('s.is_starred = 1')
  }

  if (params.beforeTime !== undefined && params.beforeID !== undefined) {
    filters.push(`(${orderCol} < ? OR (${orderCol} = ? AND a.id < ?))`)
    bindings.push(params.beforeTime, params.beforeTime, params.beforeID)
  } else if (params.afterTime !== undefined && params.afterID !== undefined) {
    filters.push(`(${orderCol} > ? OR (${orderCol} = ? AND a.id > ?))`)
    bindings.push(params.afterTime, params.afterTime, params.afterID)
  }

  const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : ''
  const hasCursor = params.beforeTime !== undefined || params.afterTime !== undefined
  const paginationClause = hasCursor ? 'LIMIT ?' : 'LIMIT ? OFFSET ?'
  const paginationBindings: (string | number)[] = hasCursor
    ? [params.limit]
    : [params.limit, params.offset]

  const query = `
    SELECT a.id, a.feed_id, a.guid, a.url, a.title, a.author, a.content, a.summary,
           a.published_at, a.created_at,
           f.title as feed_title, f.site_url as feed_site_url,
           COALESCE(s.is_read, 0) as is_read,
           COALESCE(s.is_starred, 0) as is_starred
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    ${joinType} article_states s ON s.article_id = a.id AND s.user_id = ?
    WHERE f.user_id = ?${whereExtra}
    ORDER BY ${orderCol} ${orderDir}
    ${paginationClause}
  `

  const allBindings = [params.userID, params.userID, ...bindings, ...paginationBindings]
  const res = await db.prepare(query).bind(...allBindings).all()
  return res.results as unknown as ArticleSummary[]
}

export async function getArticle(db: D1Database, userID: string, articleID: number): Promise<ArticleRow | null> {
  return db.prepare(
    `SELECT a.*, f.title as feed_title, f.site_url as feed_site_url,
       COALESCE(s.is_read, 0) as is_read,
       COALESCE(s.is_starred, 0) as is_starred
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = ?
     WHERE a.id = ? AND f.user_id = ?`
  ).bind(userID, articleID, userID).first<ArticleRow>()
}

export async function searchArticles(
  db: D1Database,
  userID: string,
  query: string,
  limit: number,
  offset: number,
): Promise<ArticleSummary[]> {
  const pattern = `%${query}%`
  const res = await db.prepare(
    `SELECT a.id, a.feed_id, a.guid, a.url, a.title, a.author, a.content, a.summary,
            a.published_at, a.created_at,
            f.title as feed_title, f.site_url as feed_site_url,
            COALESCE(s.is_read, 0) as is_read,
            COALESCE(s.is_starred, 0) as is_starred
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = ?
     WHERE f.user_id = ? AND (a.title LIKE ? OR a.content LIKE ? OR a.summary LIKE ?)
     ORDER BY a.published_at DESC
     LIMIT ? OFFSET ?`
  ).bind(userID, userID, pattern, pattern, pattern, limit, offset).all()
  return res.results as unknown as ArticleSummary[]
}

// ── Article State ───────────────────────────────────────────────────────────

export async function setArticleRead(db: D1Database, userID: string, articleID: number, readAt: string): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_read, read_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = 1, read_at = excluded.read_at`
  ).bind(userID, articleID, readAt).run()
}

export async function setArticleUnread(db: D1Database, userID: string, articleID: number): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_read)
     VALUES (?, ?, 0)
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = 0, read_at = NULL`
  ).bind(userID, articleID).run()
}

export async function setArticleStarred(db: D1Database, userID: string, articleID: number, starredAt: string): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_starred, starred_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_starred = 1, starred_at = excluded.starred_at`
  ).bind(userID, articleID, starredAt).run()
}

export async function setArticleUnstarred(db: D1Database, userID: string, articleID: number): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_starred)
     VALUES (?, ?, 0)
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_starred = 0, starred_at = NULL`
  ).bind(userID, articleID).run()
}

export async function markFeedRead(db: D1Database, userID: string, feedID: number, readAt: string): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_read, read_at)
     SELECT ?, a.id, 1, ?
     FROM articles a
     WHERE a.feed_id = ?
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = 1, read_at = excluded.read_at`
  ).bind(userID, readAt, feedID).run()
}

export async function markAllRead(db: D1Database, userID: string, readAt: string): Promise<void> {
  await db.prepare(
    `INSERT INTO article_states (user_id, article_id, is_read, read_at)
     SELECT ?, a.id, 1, ?
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     WHERE f.user_id = ?
     ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = 1, read_at = excluded.read_at`
  ).bind(userID, readAt, userID).run()
}

export async function markCategoryRead(db: D1Database, userID: string, categoryID: number, readAt: string): Promise<void> {
  const catFilter = categoryID === 0 ? 'f.category_id IS NULL' : 'f.category_id = ?'
  const sql = `INSERT OR REPLACE INTO article_states (user_id, article_id, is_read, read_at, is_starred, starred_at)
    SELECT ?, a.id, 1, ?,
      COALESCE(s.is_starred, 0), s.starred_at
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = f.user_id
    WHERE ${catFilter} AND f.user_id = ?`

  if (categoryID === 0) {
    await db.prepare(sql).bind(userID, readAt, userID).run()
  } else {
    await db.prepare(sql).bind(userID, readAt, categoryID, userID).run()
  }
}

export async function markReadBatch(db: D1Database, userID: string, ids: number[], readAt: string): Promise<void> {
  const stmts = ids.map((id) =>
    db.prepare(
      `INSERT INTO article_states (user_id, article_id, is_read, read_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = 1, read_at = excluded.read_at`
    ).bind(userID, id, readAt)
  )
  await db.batch(stmts)
}

// ── Counts ──────────────────────────────────────────────────────────────────

export async function getUnreadCount(db: D1Database, userID: string): Promise<number> {
  const res = await db.prepare(
    `SELECT COUNT(*) as count
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = f.user_id
     WHERE f.user_id = ? AND (s.is_read IS NULL OR s.is_read = 0)`
  ).bind(userID).first<{ count: number }>()
  return res?.count ?? 0
}

export async function getTotalArticleCount(db: D1Database, userID: string): Promise<number> {
  const res = await db.prepare(
    'SELECT COUNT(*) as count FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE f.user_id = ?'
  ).bind(userID).first<{ count: number }>()
  return res?.count ?? 0
}

export async function getStarredCount(db: D1Database, userID: string): Promise<number> {
  const res = await db.prepare(
    `SELECT COUNT(*) as count
     FROM article_states s
     JOIN articles a ON s.article_id = a.id
     JOIN feeds f ON a.feed_id = f.id
     WHERE s.user_id = ? AND s.is_starred = 1`
  ).bind(userID).first<{ count: number }>()
  return res?.count ?? 0
}

export async function getCounts(db: D1Database, userID: string): Promise<CountsResult> {
  const [total, unread, starred, feeds] = await Promise.all([
    getTotalArticleCount(db, userID),
    getUnreadCount(db, userID),
    getStarredCount(db, userID),
    getFeeds(db, userID),
  ])

  const feedCounts: Record<string, number> = {}
  for (const f of feeds) {
    if (f.unread_count > 0) {
      feedCounts[String(f.id)] = f.unread_count
    }
  }

  return { total, unread, starred, feeds: feedCounts }
}

// ── Purge ───────────────────────────────────────────────────────────────────

export async function countOldReadArticles(db: D1Database, cutoff: string): Promise<number> {
  const res = await db.prepare(
    `SELECT COUNT(*) as count
     FROM articles a
     JOIN feeds f ON a.feed_id = f.id
     JOIN article_states s ON s.article_id = a.id AND s.user_id = f.user_id
     WHERE s.is_read = 1 AND s.is_starred = 0 AND a.published_at < ?`
  ).bind(cutoff).first<{ count: number }>()
  return res?.count ?? 0
}

export async function purgeOldReadArticles(db: D1Database, cutoff: string): Promise<void> {
  await db.prepare(
    `DELETE FROM articles
     WHERE id IN (
       SELECT a.id FROM articles a
       JOIN feeds f ON a.feed_id = f.id
       JOIN article_states s ON s.article_id = a.id AND s.user_id = f.user_id
       WHERE s.is_read = 1 AND s.is_starred = 0 AND a.published_at < ?
     )`
  ).bind(cutoff).run()
}
