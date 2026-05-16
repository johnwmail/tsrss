import { Context } from 'hono'
import type { Env } from '../index'
import { getFeeds, getCategories, createFeed, createCategory } from '../db/queries'
import { subscribeFeed } from '../feed/refresh'
import { parseOPML, generateOPML } from '../opml/parser'
import { requireUser } from './helpers'

export async function handleExportOPML(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)

  const [feeds, categories] = await Promise.all([
    getFeeds(c.env.DB, userID),
    getCategories(c.env.DB, userID),
  ])

  const catMap = new Map(categories.map((c) => [c.id, c.title]))

  const exports = feeds.map((f) => ({
    url: f.url,
    title: f.title,
    siteURL: f.site_url,
    category: f.category_id ? catMap.get(f.category_id) || '' : '',
  }))

  const opml = generateOPML('TSRSS Export', exports)

  c.header('Content-Type', 'application/xml')
  c.header('Content-Disposition', 'attachment; filename=tsrss-feeds.opml')
  return c.body(opml)
}

export async function handleImportOPML(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'no file provided' }, 400)

  const xml = await file.text()
  const feeds = parseOPML(xml)

  // Resolve category mappings
  const existingCats = await getCategories(c.env.DB, userID)
  const catMap = new Map(existingCats.map((c) => [c.title, c.id]))

  for (const f of feeds) {
    if (f.category && !catMap.has(f.category)) {
      const cat = await createCategory(c.env.DB, userID, f.category)
      catMap.set(f.category, cat.id)
    }
  }

  // Import each feed
  const existingFeeds = await getFeeds(c.env.DB, userID)
  const existingURLs = new Set(existingFeeds.map((f) => f.url))

  let imported = 0
  for (const f of feeds) {
    if (existingURLs.has(f.url)) continue

    try {
      const feedData = await subscribeFeed(c.env, f.url)
      const catID = f.category ? (catMap.get(f.category) ?? null) : null

      const feed = await createFeed(
        c.env.DB,
        userID,
        catID,
        f.url,
        feedData.title,
        feedData.siteURL,
        feedData.description,
      )

      const { upsertArticle } = await import('../db/queries')
      for (const item of feedData.items) {
        try {
          await upsertArticle(c.env.DB, feed.id, item.guid, item.url, item.title, item.author, item.content, item.summary, item.publishedAt)
        } catch { /* skip */ }
      }
      imported++
    } catch (err) {
      console.warn('import feed failed:', f.url, String(err))
    }
  }

  return c.json({ imported, skipped: feeds.length - imported, total: feeds.length })
}
