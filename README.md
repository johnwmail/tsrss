# TSRSS - RSS Reader

A self-hosted RSS/Atom feed reader, ported to TypeScript for Cloudflare Workers + D1.

## Development

```bash
npm install
npx wrangler d1 migrations apply tsrss-db --local
npx wrangler dev
```

## Setup (One-Time)

### GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Required | Where to find |
|--------|----------|---------------|
| `CLOUDFLARE_API_TOKEN` | ✅ | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) — use "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare dashboard → right sidebar → Account ID |
| `TSRSS_PASSWORD` | Optional | Your choice. Without it, auth falls back to `none` |
| `TSRSS_PREVIEW_PASSWORD` | Optional | Separate password for preview environment |

### CI Workflows

| Workflow | Description |
|----------|-------------|
| **Setup** | Create D1 database, KV namespace, apply migrations |
| **Deploy** | Deploy to preview or production |
| **Test** | Run typecheck and unit tests |

### Setup Workflow

Run the **Setup** workflow to create Cloudflare resources. It supports two inputs:

| Input | Description |
|-------|-------------|
| `db_name` | `tsrss-db` (prod) or `tsrss-preview-db` (preview). Leave empty to list existing resources only |
| `recreate` | `true`/`yes` to delete existing DB+KV before creating. Default: `false` |

**Via GitHub UI:** Actions → Setup → Run workflow → fill inputs

**Via CLI:**
```bash
# Create preview DB (default)
gh workflow run Setup --field db_name=tsrss-preview-db

# Create production DB
gh workflow run Setup --field db_name=tsrss-db

# Recreate (delete first)
gh workflow run Setup --field db_name=tsrss-preview-db --field recreate=true

# Just list existing resources
gh workflow run Setup
```

Run Setup once for each environment before deploying.

## Deploy

### CI/CD Deploy (GitHub Actions)

| Trigger | Target | Version | How |
|---------|--------|---------|-----|
| Push tag `v*` (e.g. `v0.1.0`) | Production | Tag name | `wrangler deploy` |
| `workflow_dispatch` | Preview | Commit SHA (7 chars) | `wrangler deploy --env preview` |

**Trigger production deploy:**
```bash
git tag v0.1.0
git push origin v0.1.0
```

**Trigger preview deploy:**
```bash
gh workflow run Deploy
```

### Environment Separation

| | Production | Preview |
|---|---|---|
| Worker name | `tsrss` | `tsrss-preview` |
| D1 database | `tsrss-db` | `tsrss-preview-db` |
| KV namespace | `tsrss-sessions` | `tsrss-preview-sessions` |
| Cron trigger | Every 30 min | Disabled |
| Password secret | `TSRSS_PASSWORD` | `TSRSS_PREVIEW_PASSWORD` |

### Manual Deploy

```bash
# Set password for auth
npx wrangler secret put TSRSS_PASSWORD
npx wrangler secret put TSRSS_PASSWORD --env preview

# Deploy to production
npx wrangler deploy

# Deploy preview
npx wrangler deploy --env preview
```

## Cron (Feed Refresh)

Feeds are automatically refreshed every 30 minutes via the cron trigger in `wrangler.toml`:
```toml
[triggers]
crons = ["*/30 * * * *"]
```

Cron runs only on the **production** worker. Preview cron is disabled to avoid duplicate refreshes against the preview database.

To change the interval, update the cron expression and redeploy.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TSRSS_AUTH_MODE` | `password` | Auth: `none`, `password`, `proxy`. Falls back to `none` if `TSRSS_PASSWORD` is unset |
| `TSRSS_PASSWORD` | — | Password for `password` auth mode. If missing, falls back to `none` |
| `TSRSS_PURGE_DAYS` | `30` | Auto-purge read articles older than N days |
| `TSRSS_VERSION` | `vDev` | Cache-buster for static assets |

### Auth Modes

- **`none`** — Open access, no authentication.
- **`password`** — Password-protected. Set `TSRSS_PASSWORD` as a secret. Falls back to `none` if `TSRSS_PASSWORD` is not set.
- **`proxy`** — Authenticated via upstream reverse proxy. Expects `X-ExeDev-UserID` and `X-ExeDev-Email` headers.

For production, set secrets via `wrangler secret`:
```bash
npx wrangler secret put TSRSS_PASSWORD
npx wrangler secret put TSRSS_PASSWORD --env preview
```

Or via GitHub Actions by adding `TSRSS_PASSWORD` and `TSRSS_PREVIEW_PASSWORD` to repo secrets.

## API Endpoints

### Non-API (HTML pages)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | Login page (HTML) |
| POST | `/login` | Password login, creates session |
| GET | `/logout` | Destroy session, redirect to login |
| GET | `/` | SPA shell (app.html) |
| GET | `/mobile`, `/mobile/*` | Redirect to `/` (legacy) |

### Feeds & Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feeds` | List all feeds |
| POST | `/api/feeds` | Subscribe to RSS feed |
| PUT | `/api/feeds/:id` | Update feed title/URL |
| DELETE | `/api/feeds/:id` | Unsubscribe from feed |
| PUT | `/api/feeds/reorder` | Reorder feeds / move to category |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/reorder` | Reorder categories |
| GET | `/api/counts` | Unread/starred counts per feed |
| POST | `/api/refresh` | Refresh all feeds (background) |
| POST | `/api/feeds/refresh` | Refresh all feeds (alias) |
| GET | `/api/opml/export` | Export feeds as OPML |
| POST | `/api/opml/import` | Import feeds from OPML file |

### Articles

| Method | Path | Description |
|--------|------|-------------|
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

### Utilities & Debug

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Server status + recent cron runs |
| GET | `/api/debug` | Debug info (auth mode, DB/KV health, cron runs) |
| GET | `/__scheduled` | Manual cron trigger (refresh + purge) |
| GET | `/static/*` | Static assets (JS, CSS, favicons) |

## Test

```bash
npm test
```
