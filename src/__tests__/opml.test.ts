import { describe, it, expect } from 'vitest'
import { parseOPML, generateOPML } from '../opml/parser'

describe('OPML parser', () => {
  it('parses OPML with nested categories', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Hacker News" type="rss" xmlUrl="https://hnrss.org/frontpage" htmlUrl="https://news.ycombinator.com"/>
      <outline text="Ars Technica" type="rss" xmlUrl="https://feeds.arstechnica.com/arstechnica/index"/>
    </outline>
    <outline text="News" title="News">
      <outline text="BBC" type="rss" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"/>
    </outline>
    <outline text="Uncategorized Feed" type="rss" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`

    const feeds = parseOPML(xml)
    expect(feeds).toHaveLength(4)
    expect(feeds[0]).toEqual({
      url: 'https://hnrss.org/frontpage',
      title: 'Hacker News',
      category: 'Tech',
    })
    expect(feeds[1]).toEqual({
      url: 'https://feeds.arstechnica.com/arstechnica/index',
      title: 'Ars Technica',
      category: 'Tech',
    })
    expect(feeds[2]).toEqual({
      url: 'https://feeds.bbci.co.uk/news/rss.xml',
      title: 'BBC',
      category: 'News',
    })
    expect(feeds[3]).toEqual({
      url: 'https://example.com/feed.xml',
      title: 'Uncategorized Feed',
      category: '',
    })
  })

  it('returns empty array for empty OPML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head></head>
  <body></body>
</opml>`
    expect(parseOPML(xml)).toEqual([])
  })

  it('parses gorss-export format with empty text and self-closing tags', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>GoRSS Export</title></head>
  <body>
    <outline text="IoT" title="IoT">
      <outline text="" type="rss" xmlUrl="http://www.steves-internet-guide.com/feed/" htmlUrl="http://www.steves-internet-guide.com"></outline>
      <outline text="HiveMQ" title="HiveMQ" type="rss" xmlUrl="https://www.hivemq.com/feed.xml" htmlUrl="https://www.hivemq.com/"></outline>
    </outline>
    <outline text="Hacker News" type="rss" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com/"></outline>
  </body>
</opml>`

    const feeds = parseOPML(xml)
    expect(feeds).toHaveLength(3)
    expect(feeds[0]).toEqual({
      url: 'http://www.steves-internet-guide.com/feed/',
      title: 'http://www.steves-internet-guide.com',
      category: 'IoT',
    })
    expect(feeds[1]).toEqual({
      url: 'https://www.hivemq.com/feed.xml',
      title: 'HiveMQ',
      category: 'IoT',
    })
    expect(feeds[2]).toEqual({
      url: 'https://news.ycombinator.com/rss',
      title: 'Hacker News',
      category: '',
    })
  })
})

describe('OPML generator', () => {
  it('generates valid OPML from feed exports', () => {
    const feeds = [
      { url: 'https://hnrss.org/frontpage', title: 'Hacker News', siteURL: 'https://news.ycombinator.com', category: 'Tech' },
      { url: 'https://feeds.bbci.co.uk/news/rss.xml', title: 'BBC', siteURL: 'https://bbc.com', category: 'News' },
      { url: 'https://example.com/feed.xml', title: 'Uncategorized', siteURL: 'https://example.com', category: '' },
    ]

    const opml = generateOPML('TSRSS Export', feeds)

    expect(opml).toContain('<title>TSRSS Export</title>')
    expect(opml).toContain('xmlUrl="https://hnrss.org/frontpage"')
    expect(opml).toContain('xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"')
    expect(opml).toContain('xmlUrl="https://example.com/feed.xml"')

    // Verify category grouping
    const techIndex = opml.indexOf('text="Tech"')
    const newsIndex = opml.indexOf('text="News"')
    expect(techIndex).toBeGreaterThan(0)
    expect(newsIndex).toBeGreaterThan(techIndex)

    // Roundtrip: parse generated OPML back
    const parsed = parseOPML(opml)
    expect(parsed).toHaveLength(3)
  })
})
