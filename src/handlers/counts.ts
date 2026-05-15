import { Context } from 'hono'
import type { Env } from '../index'
import { getCounts } from '../db/queries'
import { requireUser } from './helpers'

export async function handleGetCounts(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const counts = await getCounts(c.env.DB, userID)
  return c.json(counts)
}
