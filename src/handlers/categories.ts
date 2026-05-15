import { Context } from 'hono'
import type { Env } from '../index'
import { getCategoriesOrdered, createCategory, updateCategorySortOrder } from '../db/queries'
import { requireUser } from './helpers'

export async function handleGetCategories(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const categories = await getCategoriesOrdered(c.env.DB, userID)
  return c.json(categories || [])
}

export async function handleCreateCategory(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const body = await c.req.json<{ title?: string }>()
  if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400)

  const cat = await createCategory(c.env.DB, userID, body.title.trim())
  return c.json(cat)
}

export async function handleReorderCategories(c: Context<{ Bindings: Env }>) {
  const userID = await requireUser(c)
  const body = await c.req.json<Array<{ id: number; order: number }>>()

  for (const item of body) {
    await updateCategorySortOrder(c.env.DB, item.id, item.order, userID)
  }
  return c.json({ status: 'ok' })
}
