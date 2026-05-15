import { describe, it, expect } from 'vitest'
import { extractAttr, esc } from '../opml/parser'

describe('extractAttr', () => {
  it('extracts attribute value from tag', () => {
    expect(extractAttr('<outline text="Hello World" xmlUrl="http://example.com/feed"/>', 'text')).toBe('Hello World')
  })

  it('extracts xmlUrl attribute', () => {
    expect(extractAttr('<outline text="Test" xmlUrl="http://example.com/feed"/>', 'xmlUrl')).toBe('http://example.com/feed')
  })

  it('returns empty string for missing attribute', () => {
    expect(extractAttr('<outline text="Test"/>', 'missing')).toBe('')
  })

  it('extracts title attribute', () => {
    expect(extractAttr('<outline title="My Title" text="My Title"/>', 'title')).toBe('My Title')
  })
})

describe('esc', () => {
  it('escapes ampersands', () => {
    expect(esc('AT&T')).toBe('AT&amp;T')
  })

  it('escapes less-than', () => {
    expect(esc('a < b')).toBe('a &lt; b')
  })

  it('escapes greater-than', () => {
    expect(esc('a > b')).toBe('a &gt; b')
  })

  it('escapes double quotes', () => {
    expect(esc('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('escapes all special characters', () => {
    expect(esc('<hello & "world">')).toBe('&lt;hello &amp; &quot;world&quot;&gt;')
  })

  it('returns plain string unchanged', () => {
    expect(esc('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(esc('')).toBe('')
  })
})
