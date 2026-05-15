import { describe, it, expect } from 'vitest'
import { shouldSkipFeed, filterOldItems, isPrivateURL, FeedNotModified } from '../feed/fetcher'
import type { FeedItem } from '../feed/fetcher'

describe('shouldSkipFeed', () => {
  it('returns false for feeds with no errors', () => {
    expect(shouldSkipFeed({ error_count: 0, last_updated: null })).toBe(false)
  })

  it('returns false for feeds with errors but no last_updated', () => {
    expect(shouldSkipFeed({ error_count: 3, last_updated: null })).toBe(false)
  })

  it('returns true for feeds in backoff period', () => {
    expect(shouldSkipFeed({
      error_count: 5, // 32h backoff, capped at 24h
      last_updated: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
    })).toBe(true)
  })

  it('returns false for feeds past backoff period', () => {
    expect(shouldSkipFeed({
      error_count: 1, // 2h backoff
      last_updated: new Date(Date.now() - 4 * 3600000).toISOString(), // 4 hours ago
    })).toBe(false)
  })
})

describe('filterOldItems', () => {
  const makeItem = (publishedAt: string | null): FeedItem => ({
    guid: 'guid', url: 'url', title: 'title', author: '',
    content: '', summary: '', publishedAt,
  })

  it('removes items older than cutoff', () => {
    const items = [
      makeItem(new Date(Date.now() - 10 * 86400000).toISOString()), // 10 days ago
      makeItem(new Date(Date.now() - 2 * 86400000).toISOString()), // 2 days ago
      makeItem(new Date().toISOString()), // now
    ]
    const cutoff = new Date(Date.now() - 5 * 86400000).toISOString() // 5 days ago
    const filtered = filterOldItems(items, cutoff)
    expect(filtered).toHaveLength(2)
  })

  it('keeps items with no date', () => {
    const items = [makeItem(null)]
    const cutoff = new Date().toISOString()
    expect(filterOldItems(items, cutoff)).toHaveLength(1)
  })
})

describe('isPrivateURL', () => {
  it('detects localhost', () => {
    expect(isPrivateURL('http://localhost:8080/feed')).toBe(true)
  })

  it('detects 127.0.0.1', () => {
    expect(isPrivateURL('http://127.0.0.1/feed')).toBe(true)
  })

  it('detects 10.x.x.x', () => {
    expect(isPrivateURL('http://10.0.0.1/feed')).toBe(true)
  })

  it('detects 192.168.x.x', () => {
    expect(isPrivateURL('http://192.168.1.1/feed')).toBe(true)
  })

  it('allows public URLs', () => {
    expect(isPrivateURL('https://example.com/feed')).toBe(false)
    expect(isPrivateURL('https://news.ycombinator.com/rss')).toBe(false)
  })

  it('rejects non-http schemes', () => {
    expect(isPrivateURL('file:///etc/passwd')).toBe(true)
    expect(isPrivateURL('ftp://example.com/file')).toBe(true)
  })
})

describe('FeedNotModified', () => {
  it('has correct name and message', () => {
    const err = new FeedNotModified()
    expect(err.name).toBe('FeedNotModified')
    expect(err.message).toBe('feed not modified')
  })
})
