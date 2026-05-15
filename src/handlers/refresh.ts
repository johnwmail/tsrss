import { Context } from 'hono'
import type { Env } from '../index'
import { refreshAllFeeds } from '../feed/refresh'

export async function handleRefresh(c: Context<{ Bindings: Env }>) {
  // Kick off background refresh (no await — don't block the response)
  c.executionCtx.waitUntil(refreshAllFeeds(c.env, c.executionCtx))
  return c.json({ status: 'refreshing' })
}
