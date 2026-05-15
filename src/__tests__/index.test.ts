import { describe, it, expect } from 'vitest'
import { renderLoginPage } from '../index'

describe('renderLoginPage', () => {
  it('renders login form with version', () => {
    const html = renderLoginPage('', 'v1.0.0')
    expect(html).toContain('TSRSS')
    expect(html).toContain('v1.0.0')
    expect(html).toContain('type="password"')
    expect(html).toContain('type="submit"')
  })

  it('includes error message when provided', () => {
    const html = renderLoginPage('Invalid password', 'vDev')
    expect(html).toContain('Invalid password')
  })

  it('does not include error div when no error', () => {
    const html = renderLoginPage('', 'vDev')
    expect(html).not.toContain('class="error"')
  })
})
