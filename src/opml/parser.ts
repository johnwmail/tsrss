import type { FeedImport, FeedExport } from '../db/types'

/**
 * Parse OPML XML string → flat list of feed URLs with category.
 * Uses simple regex-based parsing that works in Workers runtime.
 */
export function parseOPML(xml: string): FeedImport[] {
  const feeds: FeedImport[] = []

  // Track the current category from parent outlines
  const categories: string[] = []

  // First pass: parse nesting structure
  const lines = xml.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()

    // Opening outline without xmlUrl = category
    const catMatch = trimmed.match(/<outline\s+(?:text|title)="([^"]*)"[^>]*>/i)
    const outlineMatch = trimmed.match(/<outline\s+(text|title)="([^"]*)"[^>]*\s+xmlUrl="([^"]*)"[^>]*\/?>/i)

    if (outlineMatch) {
      const text = outlineMatch[2]
      const xmlUrl = outlineMatch[3]
      const title = extractAttr(trimmed, 'title') || text || extractAttr(trimmed, 'htmlUrl') || xmlUrl
      feeds.push({
        url: xmlUrl,
        title: title,
        category: categories.length > 0 ? categories[categories.length - 1] : '',
      })
    } else if (catMatch) {
      const catName = extractAttr(trimmed, 'title') || catMatch[1]
      if (catName) categories.push(catName)
    }

    // Closing outline tag = pop category (but not on self-closing feed lines)
    if (trimmed.includes('</outline>') && !trimmed.includes('xmlUrl=') && categories.length > 0) {
      categories.pop()
    }
  }

  return feeds
}

export function extractAttr(xml: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i')
  const m = xml.match(re)
  return m ? m[1] : ''
}

/**
 * Generate OPML XML string from feed exports.
 */
export function generateOPML(title: string, feeds: FeedExport[]): string {
  const categories = new Map<string, FeedExport[]>()
  for (const f of feeds) {
    const cat = f.category || '_uncategorized'
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(f)
  }

  let body = ''
  for (const [cat, catFeeds] of categories) {
    if (cat === '_uncategorized') {
      for (const f of catFeeds) {
        body += `    <outline text="${esc(f.title)}" title="${esc(f.title)}" type="rss" xmlUrl="${esc(f.url)}" htmlUrl="${esc(f.siteURL)}"/>\n`
      }
    } else {
      body += `    <outline text="${esc(cat)}" title="${esc(cat)}">\n`
      for (const f of catFeeds) {
        body += `      <outline text="${esc(f.title)}" title="${esc(f.title)}" type="rss" xmlUrl="${esc(f.url)}" htmlUrl="${esc(f.siteURL)}"/>\n`
      }
      body += `    </outline>\n`
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${esc(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body}  </body>
</opml>`
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
