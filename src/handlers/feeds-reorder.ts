import { Context } from 'hono'
import type { Env } from '../index'
import { updateFeedSortOrder, updateFeedCategory } from '../db/queries'
import { requireUser } from './helpers'

export async function handleReorderFeeds(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const body = await c.req.json<Array<{ id: number; order: number; category_id?: number | null }>>()

  for (const item of body) {
    if (item.category_id !== undefined) {
      await updateFeedCategory(c.env.DB, item.id, item.category_id, item.order, userID)
    } else {
      await updateFeedSortOrder(c.env.DB, item.id, item.order, userID)
    }
  }
  return c.json({ status: 'ok' })
}
