import { Context } from 'hono'
import type { Env } from '../index'
import { searchArticles } from '../db/queries'
import { requireUser } from './helpers'

export async function handleSearchArticles(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const q = c.req.query().q
  if (!q) return c.json({ error: "query parameter 'q' is required" }, 400)

  const limit = parseInt(c.req.query().limit || '50', 10)
  const offset = parseInt(c.req.query().offset || '0', 10)

  const articles = await searchArticles(c.env.DB, userID, q, limit, offset)

  // Strip content/summary from list
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
