import { Hono } from 'hono'

import type { DBEnv } from './db/types'
import { upsertUser } from './db/queries'
import {
  handleGetFeeds, handleSubscribe, handleUpdateFeed, handleUnsubscribe,
} from './handlers/feeds'
import {
  handleGetCategories, handleCreateCategory, handleReorderCategories,
} from './handlers/categories'
import { handleGetArticles, handleGetArticle } from './handlers/articles'
import {
  handleMarkRead, handleMarkUnread, handleStar, handleUnstar,
  handleMarkFeedRead, handleMarkReadBatch, handleMarkAllRead,
} from './handlers/articles-actions'
import { handleGetCounts } from './handlers/counts'
import { handleSearchArticles } from './handlers/search'
import { handleRefresh } from './handlers/refresh'
import { handleExportOPML, handleImportOPML } from './handlers/opml'
import { handleReorderFeeds } from './handlers/feeds-reorder'

// Re-export the scheduled handler for cron triggers
export { scheduled } from './cron/refreshFeeds'

export type Env = DBEnv & {
  SESSIONS: KVNamespace
  ASSETS: Fetcher
  TSRSS_AUTH_MODE: 'none' | 'password' | 'proxy'
  TSRSS_PASSWORD?: string
  TSRSS_PURGE_DAYS: string
  TSRSS_VERSION: string
}

const app = new Hono<{ Bindings: Env }>()

// ── CSP middleware ──────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
  await next()
})

// ── Auth middleware ─────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const mode = c.env.TSRSS_AUTH_MODE === 'password' && !c.env.TSRSS_PASSWORD ? 'none' : c.env.TSRSS_AUTH_MODE || 'none'
  const path = new URL(c.req.url).pathname

  if (
    path === '/health' ||
    path === '/login' ||
    path.startsWith('/static/') ||
    path === '/favicon.ico' ||
    path.startsWith('/apple-touch-icon')
  ) {
    return next()
  }

  switch (mode) {
    case 'none':
      return next()
    case 'password': {
      const password = c.env.TSRSS_PASSWORD
      if (!password) return c.text('authentication misconfigured', 500)
      const cookie = c.req.header('Cookie') || ''
      const match = cookie.match(/tsrss_session=([^;]+)/)
      if (match) {
        const valid = await c.env.SESSIONS.get(match[1])
        if (valid !== null) return next()
      }
      return c.redirect('/login', 302)
    }
    case 'proxy': {
      const userID = c.req.header('X-ExeDev-UserID')
      if (!userID) return c.text('Unauthorized - proxy auth required', 401)
      return next()
    }
    default:
      return next()
  }
})

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok' }))

// ── Auth routes ─────────────────────────────────────────────────────────────

app.get('/login', (c) => c.html(renderLoginPage('', c.env.TSRSS_VERSION || 'dev')))

app.post('/login', async (c) => {
  const password = c.env.TSRSS_PASSWORD
  const formData = await c.req.formData()
  const submitted = (formData.get('password') as string) || ''

  if (submitted.length !== (password || '').length || !password) {
    return c.html(renderLoginPage('Invalid password', c.env.TSRSS_VERSION || 'dev'), 200)
  }
  let match = true
  for (let i = 0; i < submitted.length; i++) {
    if (submitted.charCodeAt(i) !== password.charCodeAt(i)) match = false
  }
  if (!match) {
    return c.html(renderLoginPage('Invalid password', c.env.TSRSS_VERSION || 'dev'), 200)
  }

  const sessionID = crypto.randomUUID()
  const ttl = 30 * 24 * 60 * 60
  await c.env.SESSIONS.put(sessionID, '1', { expirationTtl: ttl })
  c.header('Set-Cookie', `tsrss_session=${sessionID}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}`)
  return c.redirect('/', 302)
})

app.get('/logout', async (c) => {
  const cookie = c.req.header('Cookie') || ''
  const match = cookie.match(/tsrss_session=([^;]+)/)
  if (match) await c.env.SESSIONS.delete(match[1])
  c.header('Set-Cookie', 'tsrss_session=; Path=/; HttpOnly; Max-Age=0')
  return c.redirect('/login', 302)
})

// ── Root (app shell) ────────────────────────────────────────────────────────

app.get('/', async (c) => {
  // Ensure user exists (matches Go HandleRoot behavior)
  const userID = c.req.header('X-ExeDev-UserID') || 'anonymous'
  const email = c.req.header('X-ExeDev-Email') || ''
  try { await upsertUser(c.env.DB, userID, email || null) } catch {}

  const res = await c.env.ASSETS.fetch(new URL('/views/app.html', c.req.url))
  const html = await res.text()
  const mode = c.env.TSRSS_AUTH_MODE === 'password' && !c.env.TSRSS_PASSWORD ? 'none' : c.env.TSRSS_AUTH_MODE || 'none'
  const authDisplay = (mode === 'password' || mode === 'proxy') ? '' : 'none'
  const rendered = html
      .replace(/\{\{\.Version\}\}/g, c.env.TSRSS_VERSION || 'dev')
    .replace(/\{\{\.AuthMode\}\}/g, mode)
    .replace(/\{\{\.AuthModeDisplay\}\}/g, authDisplay)
  return c.html(rendered)
})

// ── Feed routes ─────────────────────────────────────────────────────────────

app.get('/api/feeds', handleGetFeeds)
app.post('/api/feeds', handleSubscribe)
app.put('/api/feeds/:id', handleUpdateFeed)
app.delete('/api/feeds/:id', handleUnsubscribe)
app.put('/api/feeds/reorder', handleReorderFeeds)

// ── Category routes ─────────────────────────────────────────────────────────

app.get('/api/categories', handleGetCategories)
app.post('/api/categories', handleCreateCategory)
app.put('/api/categories/reorder', handleReorderCategories)

// ── Article routes ──────────────────────────────────────────────────────────

app.get('/api/articles', handleGetArticles)
app.get('/api/articles/search', handleSearchArticles)
app.get('/api/articles/:id', handleGetArticle)
app.post('/api/articles/:id/read', handleMarkRead)
app.post('/api/articles/:id/unread', handleMarkUnread)
app.post('/api/articles/:id/star', handleStar)
app.post('/api/articles/:id/unstar', handleUnstar)

// ── Article action routes ───────────────────────────────────────────────────

app.post('/api/feeds/:id/mark-read', handleMarkFeedRead)
app.post('/api/articles/mark-read-batch', handleMarkReadBatch)
app.post('/api/articles/mark-all-read', handleMarkAllRead)

// ── Counts ──────────────────────────────────────────────────────────────────

app.get('/api/counts', handleGetCounts)

// ── Refresh ─────────────────────────────────────────────────────────────────

app.post('/api/refresh', handleRefresh)
app.post('/api/feeds/refresh', handleRefresh)

// ── OPML ────────────────────────────────────────────────────────────────────

app.get('/api/opml/export', handleExportOPML)
app.post('/api/opml/import', handleImportOPML)

// ── Legacy mobile redirects ─────────────────────────────────────────────────

app.get('/mobile', (c) => c.redirect('/', 301))
app.get('/mobile/*', (c) => c.redirect('/', 301))

// ── Manual cron trigger (wrangler v4 cdn-cgi handler often returns "exception") ──

app.get('/__scheduled', async (c) => {
  const { refreshAllFeeds, purgeOldArticles } = await import('./feed/refresh')
  c.executionCtx.waitUntil(refreshAllFeeds(c.env, c.executionCtx))
  await purgeOldArticles(c.env)
  return c.json({ status: 'ok' })
})

export default app

// ── Login page renderer ─────────────────────────────────────────────────────

export function renderLoginPage(errorMsg: string, version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GoRSS - Login</title>
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link rel="icon" type="image/png" href="/static/favicon-32.png" sizes="32x32">
  <link rel="icon" type="image/x-icon" href="/static/favicon.ico" sizes="16x16 32x32">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/favicon-180.png">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #f5f5f5; --card-bg: white; --text: #333; --text-muted: #666;
      --primary: #1a73e8; --primary-hover: #1557b0; --border: #e0e0e0;
      --shadow: rgba(0,0,0,0.1); --error-bg: #ffebee; --error-text: #c62828;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #2b2d31; --card-bg: #36393f; --text: #dcddde; --text-muted: #999;
        --primary: #7bafe8; --primary-hover: #6a9fd8; --border: #4a4d52;
        --shadow: rgba(0,0,0,0.3); --error-bg: #442222; --error-text: #ff6b6b;
      }
    }
    [data-theme="dark"] {
      --bg: #2b2d31; --card-bg: #36393f; --text: #dcddde; --text-muted: #999;
      --primary: #7bafe8; --primary-hover: #6a9fd8; --border: #4a4d52;
      --shadow: rgba(0,0,0,0.3); --error-bg: #442222; --error-text: #ff6b6b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.3s, color 0.3s;
    }
    .login-box {
      background: var(--card-bg); padding: 40px; border-radius: 12px;
      box-shadow: 0 4px 20px var(--shadow); width: 100%; max-width: 400px;
      transition: background 0.3s;
    }
    h1 { color: var(--primary); margin-bottom: 8px; font-size: 28px; }
    .subtitle { color: var(--text-muted); margin-bottom: 24px; }
    .error { background: var(--error-bg); color: var(--error-text); padding: 12px; border-radius: 8px; margin-bottom: 16px; }
    input[type="password"] {
      width: 100%; padding: 14px; border: 2px solid var(--border); border-radius: 8px;
      font-size: 16px; margin-bottom: 16px; transition: border-color 0.2s;
      background: var(--bg); color: var(--text);
    }
    input[type="password"]:focus { outline: none; border-color: var(--primary); }
    button {
      width: 100%; padding: 14px; background: var(--primary); color: white;
      border: none; border-radius: 8px; font-size: 16px; font-weight: 500;
      cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: var(--primary-hover); }
    .version-link {
      display: flex; align-items: center; justify-content: center; gap: 4px;
      margin-top: 20px; font-size: 13px; color: var(--text-muted); text-decoration: none;
    }
    .version-link:hover { color: var(--primary); }
    h1 a { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1><a href="https://github.com/johnwmail/tsrss">TSRSS</a></h1>
    <p class="subtitle">Enter password to continue</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <form method="POST">
      <input type="password" name="password" placeholder="Password" autofocus required>
      <button type="submit">Login</button>
    </form>
    <a href="https://github.com/johnwmail/tsrss" class="version-link">${version}</a>
  </div>
  <script>
    (function() {
      var mode = localStorage.getItem('tsrss-theme-mode') || 'auto';
      if (mode === 'dark') document.documentElement.dataset.theme = 'dark';
      else if (mode === 'light') document.documentElement.dataset.theme = 'light';
      else { var h = new Date().getHours(); if (h < 6 || h >= 21) document.documentElement.dataset.theme = 'dark'; }
    })();
  </script>
</body>
</html>`
}
