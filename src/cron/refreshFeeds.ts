import type { ScheduledEvent } from '@cloudflare/workers-types'
import { refreshAllFeeds, purgeOldArticles } from '../feed/refresh'

export type CronEnv = {
  DB: D1Database
  TSRSS_PURGE_DAYS?: string
}

/**
 * Cron trigger: every 30 minutes, refresh all feeds.
 */
export async function scheduled(event: ScheduledEvent, env: CronEnv, ctx: ExecutionContext): Promise<void> {
  console.log('cron: starting feed refresh', event.cron, event.scheduledTime)
  await refreshAllFeeds(env, ctx)
  await purgeOldArticles(env)
  console.log('cron: feed refresh complete')
}
