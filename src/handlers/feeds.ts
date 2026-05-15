import { Context } from 'hono'
import type { Env } from '../index'
import { getFeedsOrdered, getFeed, createFeed, updateFeedDetails, deleteFeed, getFeedByURL } from '../db/queries'
import { subscribeFeed, validateFeedURL } from '../feed/refresh'
import { requireUser } from './helpers'

export async function handleGetFeeds(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const feeds = await getFeedsOrdered(c.env.DB, userID)
  return c.json(feeds || [])
}

export async function handleSubscribe(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const body = await c.req.json<{ url?: string; category_id?: number | null }>()

  if (!body.url) return c.json({ error: 'url is required' }, 400)

  // Validate and fetch feed metadata
  let feedData
  try {
    feedData = await subscribeFeed(c.env, body.url)
  } catch (err) {
    return c.json({ error: 'failed to fetch feed: ' + (err instanceof Error ? err.message : String(err)) }, 400)
  }

  // Check for existing subscription
  const existing = await getFeedByURL(c.env.DB, userID, body.url)
  if (existing) return c.json({ error: 'already subscribed to this feed' }, 409)

  // Create feed
  const feed = await createFeed(
    c.env.DB,
    userID,
    body.category_id ?? null,
    body.url,
    feedData.title,
    feedData.siteURL,
    feedData.description,
  )

  // Upsert initial articles
  const { upsertArticle } = await import('../db/queries')
  for (const item of feedData.items) {
    try {
      await upsertArticle(
        c.env.DB,
        feed.id,
        item.guid,
        item.url,
        item.title,
        item.author,
        item.content,
        item.summary,
        item.publishedAt,
      )
    } catch { /* skip individual article errors */ }
  }

  return c.json(feed)
}

export async function handleUpdateFeed(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid feed id' }, 400)
  const feedID = parseInt(idStr, 10)
  if (isNaN(feedID)) return c.json({ error: 'invalid feed id' }, 400)

  const body = await c.req.json<{ title?: string; url?: string }>()

  const feed = await getFeed(c.env.DB, feedID, userID)
  if (!feed) return c.json({ error: 'feed not found' }, 404)

  const title = body.title?.trim() || feed.title
  const url = body.url?.trim() || feed.url

  // If URL changed, validate it
  if (url !== feed.url) {
    try {
      await validateFeedURL(url)
    } catch (err) {
      return c.json({ error: 'invalid feed URL: ' + (err instanceof Error ? err.message : String(err)) }, 400)
    }
  }

  try {
    await updateFeedDetails(c.env.DB, feedID, userID, title, url)
  } catch (err) {
    const msg = String(err)
    if (msg.includes('UNIQUE')) return c.json({ error: 'already subscribed to this URL' }, 409)
    return c.json({ error: 'failed to update feed' }, 500)
  }

  return c.json({ status: 'ok' })
}

export async function handleUnsubscribe(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const idStr = c.req.param('id')
  if (!idStr) return c.json({ error: 'invalid feed id' }, 400)
  const feedID = parseInt(idStr, 10)
  if (isNaN(feedID)) return c.json({ error: 'invalid feed id' }, 400)

  await deleteFeed(c.env.DB, feedID, userID)
  return c.json({ status: 'ok' })
}
