import { Context } from 'hono'
import type { Env } from '../index'
import {
  setArticleRead, setArticleUnread, setArticleStarred, setArticleUnstarred,
  markFeedRead, markAllRead, markCategoryRead, markReadBatch,
} from '../db/queries'
import { requireUser } from './helpers'

export async function handleMarkRead(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid article id' }, 400)
  const articleID = parseInt(idStr, 10)
  if (isNaN(articleID)) return c.json({ error: 'invalid article id' }, 400)

  const now = new Date().toISOString()
  await setArticleRead(c.env.DB, userID, articleID, now)
  return c.json({ status: 'ok' })
}

export async function handleMarkUnread(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid article id' }, 400)
  const articleID = parseInt(idStr, 10)
  if (isNaN(articleID)) return c.json({ error: 'invalid article id' }, 400)

  await setArticleUnread(c.env.DB, userID, articleID)
  return c.json({ status: 'ok' })
}

export async function handleStar(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid article id' }, 400)
  const articleID = parseInt(idStr, 10)
  if (isNaN(articleID)) return c.json({ error: 'invalid article id' }, 400)

  const now = new Date().toISOString()
  await setArticleStarred(c.env.DB, userID, articleID, now)
  return c.json({ status: 'ok' })
}

export async function handleUnstar(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid article id' }, 400)
  const articleID = parseInt(idStr, 10)
  if (isNaN(articleID)) return c.json({ error: 'invalid article id' }, 400)

  await setArticleUnstarred(c.env.DB, userID, articleID)
  return c.json({ status: 'ok' })
}

export async function handleMarkFeedRead(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid feed id' }, 400)
  const feedID = parseInt(idStr, 10)
  if (isNaN(feedID)) return c.json({ error: 'invalid feed id' }, 400)

  const now = new Date().toISOString()
  await markFeedRead(c.env.DB, userID, feedID, now)
  return c.json({ status: 'ok' })
}

export async function handleMarkReadBatch(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const body = await c.req.json<{ ids?: number[] }>()

  if (!body.ids?.length) return c.json({ error: 'invalid request: ids required' }, 400)

  const now = new Date().toISOString()
  await markReadBatch(c.env.DB, userID, body.ids, now)
  return c.json({ status: 'ok' })
}

export async function handleMarkAllRead(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const q = c.req.query()
  const now = new Date().toISOString()

  if (q.feed_id) {
    const feedID = parseInt(q.feed_id, 10)
    if (isNaN(feedID)) return c.json({ error: 'invalid feed_id' }, 400)
    await markFeedRead(c.env.DB, userID, feedID, now)
  } else if (q.category_id) {
    const catID = parseInt(q.category_id, 10)
    if (isNaN(catID)) return c.json({ error: 'invalid category_id' }, 400)
    await markCategoryRead(c.env.DB, userID, catID, now)
  } else {
    await markAllRead(c.env.DB, userID, now)
  }

  return c.json({ status: 'ok' })
}
