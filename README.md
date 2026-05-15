# TSRSS - RSS Reader

A self-hosted RSS/Atom feed reader, ported to TypeScript for Cloudflare Workers + D1.

## Development

```bash
npm install
npx wrangler d1 migrations apply tsrss-db --local
npx wrangler dev
```

## Deploy

### Prerequisites

Create the required Cloudflare resources (run locally once):

```bash
# 1. Create D1 database
npx wrangler d1 create tsrss-db

# 2. Create KV namespace for sessions
npx wrangler kv:namespace create tsrss-sessions

# 3. Apply database migrations
npx wrangler d1 migrations apply tsrss-db
```

**No need to edit `wrangler.toml`** — resource IDs are auto-detected by name during CI deploy.

### Manual Deploy

```bash
# (Optional) Set password for auth
npx wrangler secret put TSRSS_PASSWORD

# Set version (replace with your tag or commit SHA)
sed -i 's/^TSRSS_VERSION = .*/TSRSS_VERSION = "v0.1.0"/' wrangler.toml

# Deploy to production
npx wrangler deploy

# Deploy preview (creates a new version, production untouched)
sed -i 's/^TSRSS_VERSION = .*/TSRSS_VERSION = "abc1234"/' wrangler.toml

npx wrangler versions upload --preview-alias preview
# → Preview URL: preview-tsrss.<subdomain>.workers.dev
```

### CI/CD Deploy (GitHub Actions)

| Trigger | Target | Version | How |
|---------|--------|---------|-----|
| Push tag `v*` (e.g. `v0.1.0`) | Production | Tag name | `wrangler deploy` |
| `workflow_dispatch` (manual) | Preview | Commit SHA (7 chars) | `wrangler versions upload --preview-alias preview` |

**Setup GitHub Secrets:**

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Required | Where to find |
|--------|----------|---------------|
| `CLOUDFLARE_API_TOKEN` | ✅ | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) — use "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare dashboard → right sidebar → Account ID |
| `TSRSS_PASSWORD` | Optional | Your choice. Without it, auth falls back to `none` |

**Trigger production deploy:**
```bash
git tag v0.1.0
git push origin v0.1.0
```

**Trigger preview deploy:** GitHub Actions UI → Deploy workflow → Run workflow.

Preview URL: `preview-tsrss.<subdomain>.workers.dev`

### Cron (Feed Refresh)

Feeds are automatically refreshed every 30 minutes via the cron trigger in `wrangler.toml`:
```toml
[triggers]
crons = ["*/30 * * * *"]
```

To change the interval, update the cron expression and redeploy.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TSRSS_AUTH_MODE` | `password` | Auth: `none`, `password`, `proxy` |
| `TSRSS_PASSWORD` | — | Password for `password` auth mode. If missing, falls back to `none` |
| `TSRSS_PURGE_DAYS` | `30` | Auto-purge read articles older than N days |
| `TSRSS_VERSION` | `vDev` | Cache-buster for static assets |

### Auth Modes

- **`none`** — Open access, no authentication.
- **`password`** — Password-protected. Set `TSRSS_PASSWORD` as a secret. If not set, auto-falls back to `none`.
- **`proxy`** — Authenticated via upstream reverse proxy. Expects `X-ExeDev-UserID` and `X-ExeDev-Email` headers.

For production, set secrets via `wrangler secret`:
```bash
npx wrangler secret put TSRSS_PASSWORD
```

Or via GitHub Actions by adding `TSRSS_PASSWORD` to repo secrets.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | Login page (HTML) |
| POST | `/login` | Password login, creates session |
| GET | `/logout` | Destroy session, redirect to login |
| GET | `/` | SPA shell (app.html) |
| GET | `/api/feeds` | List all feeds |
| POST | `/api/feeds` | Subscribe to RSS feed |
| PUT | `/api/feeds/:id` | Update feed title/URL |
| DELETE | `/api/feeds/:id` | Unsubscribe from feed |
| PUT | `/api/feeds/reorder` | Reorder feeds / move to category |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/reorder` | Reorder categories |
| GET | `/api/articles` | List articles (filter, cursor pagination) |
| GET | `/api/articles/search` | Full-text search |
| GET | `/api/articles/:id` | Get article detail |
| POST | `/api/articles/:id/read` | Mark article read |
| POST | `/api/articles/:id/unread` | Mark article unread |
| POST | `/api/articles/:id/star` | Star article |
| POST | `/api/articles/:id/unstar` | Unstar article |
| POST | `/api/feeds/:id/mark-read` | Mark all articles in a feed read |
| POST | `/api/articles/mark-read-batch` | Batch mark articles read |
| POST | `/api/articles/mark-all-read` | Mark all read (optional feed_id/category_id) |
| GET | `/api/counts` | Unread/starred counts per feed |
| POST | `/api/refresh` | Refresh all feeds (background) |
| POST | `/api/feeds/refresh` | Refresh all feeds (alias) |
| GET | `/api/opml/export` | Export feeds as OPML |
| POST | `/api/opml/import` | Import feeds from OPML file |
| GET | `/mobile`, `/mobile/*` | Redirect to `/` (legacy) |
| GET | `/__scheduled` | Manual cron trigger (refresh + purge) |
| GET | `/static/*` | Static assets (JS, CSS, favicons) |

## Test

```bash
npm test
```
