import { fetchFeedConditional, fetchFeed, FeedNotModified, shouldSkipFeed, filterOldItems } from './fetcher'
import { getAllFeedsForRefresh, updateFeedMeta, upsertArticle, countOldReadArticles, purgeOldReadArticles } from '../db/queries'
import type { FeedForRefresh } from '../db/types'

export interface RefreshEnv {
  DB: D1Database
  TSRSS_PURGE_DAYS?: string
}

/**
 * Refresh all feeds that are due (not in error backoff).
 * Called from cron trigger and manual refresh endpoint.
 */
export async function refreshAllFeeds(env: RefreshEnv, _ctx: ExecutionContext): Promise<void> {
  const feeds = await getAllFeedsForRefresh(env.DB, 1000)

  // Process in batches of 5 concurrent, with 1s delay between items to be nice to servers
  const batchSize = 5
  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map((feed) => refreshFeedInternal(env, feed))
    )
    if (i + batchSize < feeds.length) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

/**
 * Refresh a single feed by ID.
 */
export async function refreshFeedByID(env: RefreshEnv, feedID: number): Promise<void> {
  const feeds = await getAllFeedsForRefresh(env.DB, 1000)
  const feed = feeds.find((f) => f.id === feedID)
  if (!feed) throw new Error(`feed not found: ${feedID}`)
  await refreshFeedInternal(env, feed)
}

async function refreshFeedInternal(env: RefreshEnv, feed: FeedForRefresh): Promise<void> {
  if (shouldSkipFeed(feed)) return

  const purgeDays = parseInt(env.TSRSS_PURGE_DAYS || '30', 10)
  const now = new Date().toISOString()

  try {
    const result = await fetchFeedConditional(feed.url, feed.etag, feed.last_modified)

    // Filter old articles if purge is enabled
    if (purgeDays > 0) {
      const cutoff = new Date(Date.now() - purgeDays * 86400000).toISOString()
      result.items = filterOldItems(result.items, cutoff)
    }

    // Update feed meta with new data, reset error count
    const title = result.title || feed.title
    await updateFeedMeta(
      env.DB,
      feed.id,
      title,
      result.siteURL,
      result.description,
      now,
      null,
      result.etag,
      result.lastModified,
      0,
    )

    // Upsert articles
    for (const item of result.items) {
      try {
        await upsertArticle(
          env.DB,
          feed.id,
          item.guid,
          item.url,
          item.title,
          item.author,
          item.content,
          item.summary,
          item.publishedAt,
        )
      } catch (err) {
        console.warn(`upsert article error:`, err, `guid:`, item.guid)
      }
    }

    console.log(`refreshed feed`, feed.id, title, result.items.length)
  } catch (err) {
    if (err instanceof FeedNotModified) {
      // 304 Not Modified: update timestamp, reset error count
      await updateFeedMeta(
        env.DB,
        feed.id,
        feed.title,
        feed.site_url,
        feed.description,
        now,
        null,
        feed.etag,
        feed.last_modified,
        0,
      )
      console.log(`feed not modified (304)`, feed.id, feed.title)
      return
    }

    // Error: increment error count
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateFeedMeta(
      env.DB,
      feed.id,
      feed.title,
      feed.site_url,
      feed.description,
      now,
      errMsg,
      feed.etag,
      feed.last_modified,
      feed.error_count + 1,
    )
    console.warn(`refresh feed error`, feed.id, feed.url, errMsg)
  }
}

/**
 * Fetch a feed URL and create initial subscription (called from HandleSubscribe).
 */
export async function subscribeFeed(
  env: RefreshEnv,
  url: string,
): Promise<{ title: string; siteURL: string; description: string; items: Array<{ guid: string; url: string; title: string; author: string; content: string; summary: string; publishedAt: string | null }> }> {
  const result = await fetchFeed(url)

  // Filter old articles if purge is enabled
  const purgeDays = parseInt(env.TSRSS_PURGE_DAYS || '30', 10)
  if (purgeDays > 0) {
    const cutoff = new Date(Date.now() - purgeDays * 86400000).toISOString()
    result.items = filterOldItems(result.items, cutoff)
  }

  return result
}

/**
 * Purge old read articles.
 */
export async function purgeOldArticles(env: RefreshEnv): Promise<void> {
  const purgeDays = parseInt(env.TSRSS_PURGE_DAYS || '30', 10)
  if (purgeDays <= 0) return

  const cutoff = new Date(Date.now() - purgeDays * 86400000).toISOString()
  const count = await countOldReadArticles(env.DB, cutoff)
  if (count === 0) return

  await purgeOldReadArticles(env.DB, cutoff)
  console.log(`purged old read articles`, count, `cutoff_days:`, purgeDays)
}

/**
 * Validate a feed URL (used in update feed when URL changes).
 */
export async function validateFeedURL(url: string): Promise<void> {
  await fetchFeed(url)
}
