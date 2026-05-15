import type { D1Database } from '@cloudflare/workers-types'

export interface DBEnv {
  DB: D1Database
}

// ── Row types (mapped from SQL schema) ──────────────────────────────────────

export interface User {
  id: string
  email: string | null
  created_at: string
  last_seen: string
}

export interface Category {
  id: number
  user_id: string
  title: string
  created_at: string
  sort_order: number
}

export interface Feed {
  id: number
  user_id: string
  category_id: number | null
  url: string
  title: string
  site_url: string
  description: string
  last_updated: string | null
  last_error: string | null
  created_at: string
  sort_order: number
  etag: string
  last_modified: string
  error_count: number
}

export interface FeedWithMeta extends Feed {
  category_title: string | null
  unread_count: number
}

export interface FeedForRefresh extends Feed {
  // same as Feed
}

export interface Article {
  id: number
  feed_id: number
  guid: string
  url: string
  title: string
  author: string
  content: string
  summary: string
  published_at: string | null
  created_at: string
}

export interface ArticleRow {
  id: number
  feed_id: number
  guid: string
  url: string
  title: string
  author: string
  content: string
  summary: string
  published_at: string | null
  created_at: string
  feed_title: string
  feed_site_url: string
  is_read: number
  is_starred: number
}

export interface ArticleState {
  user_id: string
  article_id: number
  is_read: number
  is_starred: number
  read_at: string | null
  starred_at: string | null
}

export interface Migration {
  migration_number: number
  migration_name: string
  executed_at: string
}

// ── Request/Response types ──────────────────────────────────────────────────

export interface CountsResult {
  total: number
  unread: number
  starred: number
  feeds: Record<string, number>
}

export interface ArticleSummary {
  id: number
  feed_id: number
  url: string
  title: string
  author: string
  published_at: string | null
  feed_title: string
  feed_site_url: string
  is_read: number
  is_starred: number
}

export interface ArticleQueryOpts {
  categoryID?: number
  feedID?: number
  unreadOnly: boolean
  starredOnly: boolean
  sortOldest: boolean
  limit: number
  offset: number
  beforeTime?: string
  beforeID?: number
  afterTime?: string
  afterID?: number
}

export interface FeedImport {
  url: string
  title: string
  category: string
}

export interface FeedExport {
  url: string
  title: string
  siteURL: string
  category: string
}
