import { Context } from 'hono'
import type { Env } from '../index'
import { upsertUser } from '../db/queries'

/**
 * Get user ID from request headers (proxy auth mode) or fallback to "anonymous".
 * Also ensures user record exists in DB.
 */
export async function requireUser(c: Context<{ Bindings: Env }>): Promise<string> {
  let userID = c.req.header('X-ExeDev-UserID') || 'anonymous'
  const email = c.req.header('X-ExeDev-Email') || ''

  try {
    await upsertUser(c.env.DB, userID, email || null)
  } catch (err) {
    console.warn('ensure user error:', err)
  }

  return userID
}
