import Parser from 'rss-parser'

const feedParser = new Parser({
  timeout: 30000,
  headers: { 'User-Agent': 'TSRSS/1.0 (feed reader)' },
  maxRedirects: 5,
})

export interface FeedItem {
  guid: string
  url: string
  title: string
  author: string
  content: string
  summary: string
  publishedAt: string | null
}

export interface FeedFetchResult {
  title: string
  siteURL: string
  description: string
  items: FeedItem[]
  etag: string
  lastModified: string
}

/**
 * Unconditional GET, used for initial subscribe.
 */
export async function fetchFeed(urlStr: string): Promise<FeedFetchResult> {
  return fetchWithCaching(urlStr, '', '')
}

/**
 * Conditional GET using saved ETag/Last-Modified.
 * Throws FeedNotModified if 304 returned.
 */
export async function fetchFeedConditional(
  urlStr: string,
  etag: string,
  lastModified: string,
): Promise<FeedFetchResult> {
  return fetchWithCaching(urlStr, etag, lastModified)
}

async function fetchWithCaching(
  urlStr: string,
  etag: string,
  lastModified: string,
): Promise<FeedFetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'TSRSS/1.0 (feed reader)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  }
  if (etag) headers['If-None-Match'] = etag
  if (lastModified) headers['If-Modified-Since'] = lastModified

  const resp = await fetch(urlStr, { headers })

  if (resp.status === 304) {
    throw new FeedNotModified()
  }

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  }

  const body = await resp.text()
  const etagHeader = resp.headers.get('ETag') || ''
  const lastModHeader = resp.headers.get('Last-Modified') || ''

  return await parseFeedXML(body, etagHeader, lastModHeader)
}

async function parseFeedXML(
  body: string,
  etag: string,
  lastModified: string,
): Promise<FeedFetchResult> {
  const parsed = await feedParser.parseString(body)

  const title = parsed.title || ''
  const siteURL = parsed.link || ''
  const description = parsed.description || ''

  const items: FeedItem[] = (parsed.items || []).map((item) => ({
    guid: item.guid || item.link || '',
    url: item.link || '',
    title: item.title || '',
    author: item.creator || item.author || '',
    content: item['content:encoded'] || item.content || '',
    summary: item.summary || item.contentSnippet || '',
    publishedAt: item.isoDate || item.pubDate ? new Date(item.pubDate || item.isoDate!).toISOString() : null,
  }))

  return { title, siteURL, description, items, etag, lastModified }
}

export class FeedNotModified extends Error {
  constructor() {
    super('feed not modified')
    this.name = 'FeedNotModified'
  }
}

/**
 * SSRF protection: reject private/reserved IP addresses.
 */
export function isPrivateURL(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true
    const hostname = u.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
      const parts = ipv4Match.slice(1).map(Number)
      if (parts[0] === 10) return true
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
      if (parts[0] === 192 && parts[1] === 168) return true
      if (parts[0] === 127) return true
      if (parts[0] === 169 && parts[1] === 254) return true
      if (parts[0] === 0) return true
    }
    return false
  } catch {
    return true
  }
}

/**
 * Filter out items older than the cutoff date.
 */
export function filterOldItems(items: FeedItem[], cutoff: string): FeedItem[] {
  const cutoffMs = new Date(cutoff).getTime()
  return items.filter((item) => !item.publishedAt || new Date(item.publishedAt).getTime() >= cutoffMs)
}

/**
 * Exponential backoff: true = skip this feed this cycle.
 */
export function shouldSkipFeed(feed: {
  error_count: number
  last_updated: string | null
}): boolean {
  if (feed.error_count === 0 || !feed.last_updated) return false
  const backoffHours = Math.min(1 << Math.min(feed.error_count, 5), 24)
  const nextAllowed = new Date(new Date(feed.last_updated).getTime() + backoffHours * 3600000)
  return new Date() < nextAllowed
}
