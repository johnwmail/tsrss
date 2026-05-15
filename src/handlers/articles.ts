import { Context } from 'hono'
import type { Env } from '../index'
import { queryArticles, getArticle } from '../db/queries'
import type { ArticleQueryParams } from '../db/queries'
import { requireUser } from './helpers'

export async function handleGetArticles(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const params = buildQueryParams(c, userID)
  const articles = await queryArticles(c.env.DB, params)

  const result = articles.map((a) => ({
    id: a.id,
    feed_id: a.feed_id,
    url: a.url,
    title: a.title,
    author: a.author,
    published_at: a.published_at,
    feed_title: a.feed_title,
    feed_site_url: a.feed_site_url,
    is_read: a.is_read,
    is_starred: a.is_starred,
  }))

  return c.json(result)
}

export async function handleGetArticle(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid article id' }, 400)
  const articleID = parseInt(idStr, 10)
  if (isNaN(articleID)) return c.json({ error: 'invalid article id' }, 400)

  const article = await getArticle(c.env.DB, userID, articleID)
  if (!article) return c.json({ error: 'article not found' }, 404)

  return c.json(article)
}

export function buildQueryParams(c: Context<{ Bindings: Env }>, userID: string): ArticleQueryParams {
  const q = c.req.query()
  const limit = parseInt(q.limit || '50', 10)
  const offset = parseInt(q.offset || '0', 10)
  const sort = q.sort

  const params: ArticleQueryParams = {
    userID,
    unreadOnly: false,
    starredOnly: false,
    sortOldest: sort === 'oldest',
    limit,
    offset,
  }

  if (q.before) params.beforeTime = q.before
  if (q.before_id) params.beforeID = parseInt(q.before_id, 10)
  if (q.after) params.afterTime = q.after
  if (q.after_id) params.afterID = parseInt(q.after_id, 10)

  const view = q.view
  const feedID = q.feed_id
  const categoryID = q.category_id

  if (view === 'starred') {
    params.starredOnly = true
  } else if (view === 'unread' || view === 'fresh') {
    params.unreadOnly = true
    if (categoryID) params.categoryID = parseInt(categoryID, 10)
  } else if (feedID) {
    params.feedID = parseInt(feedID, 10)
  } else if (categoryID) {
    params.categoryID = parseInt(categoryID, 10)
  }

  return params
}
