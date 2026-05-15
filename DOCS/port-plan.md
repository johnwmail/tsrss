# GoRSS → TypeScript Port Plan

**Target**: Cloudflare Workers + D1 + Cron Triggers (every 30 min)

---

## 1. Project Structure

```
tsrss/
├── DOCS/
│   └── port-plan.md                      # this file
├── src/
│   ├── index.ts                          # Entry: Hono app, routes, middleware
│   ├── db/
│   │   ├── schema.ts                     # D1 schema (SQL CREATE TABLE)
│   │   ├── migrations.ts                 # D1 migration runner (reads schema.sql)
│   │   ├── queries.ts                    # All SQL queries as tagged template functions
│   │   └── types.ts                      # Row types (Article, Feed, Category, etc.)
│   ├── handlers/
│   │   ├── feeds.ts                      # GET/POST/PUT/DELETE /api/feeds
│   │   ├── articles.ts                   # GET /api/articles, GET /api/articles/:id
│   │   ├── articles-actions.ts           # mark-read, mark-unread, star, unstar, batch
│   │   ├── categories.ts                 # GET/POST /api/categories, reorder
│   │   ├── opml.ts                       # GET/POST /api/opml/export, /api/opml/import
│   │   ├── refresh.ts                    # POST /api/feeds/refresh
│   │   ├── counts.ts                     # GET /api/counts
│   │   ├── search.ts                     # GET /api/articles/search
│   │   ├── auth.ts                       # GET/POST /login, GET /logout
│   │   └── root.ts                       # GET / (render app shell)
│   ├── feed/
│   │   ├── fetcher.ts                    # FeedFetchResult, fetchWithCaching, isPrivateURL
│   │   └── refresh.ts                    # refreshAllFeeds, refreshFeedInternal, shouldSkipFeed, purgeOldArticles
│   ├── auth/
│   │   └── middleware.ts                 # AuthMiddleware, session store (KV), login/logout handlers
│   ├── opml/
│   │   └── parser.ts                     # ParseOPML, GenerateOPML
│   ├── views/
│   │   └── app.html                      # Same HTML template (copied from Go version)
│   ├── static/
│   │   ├── app.js                        # UNCHANGED (1500 lines, vanilla JS)
│   │   ├── app.css                       # UNCHANGED (1113 lines)
│   │   ├── purify.min.js                 # UNCHANGED
│   │   └── favicon.svg                   # UNCHANGED
│   └── cron/
│       └── refreshFeeds.ts               # Cron trigger handler (scheduled event)
├── migrations/
│   ├── 001-base.sql                      # Same schema (D1-compatible SQLite)
│   ├── 002-sort-order.sql
│   └── 003-feed-caching.sql
├── wrangler.toml                         # Cloudflare Workers config
├── package.json
├── tsconfig.json
└── .gitignore
```

## 2. File-by-File Mapping: Go → TypeScript

### Removed (no counterpart needed)

| Go File | Reason |
|---------|--------|
| `cmd/srv/main.go` | Entry point → `src/index.ts` (Hono app) |
| `Makefile` | Replaced by `wrangler.toml` + `package.json` scripts |
| `Dockerfile`, `docker-compose.yml`, `tsrss.service` | Not needed on Workers |
| `.golangci.yml`, `go.mod`, `go.sum` | Go tooling |
| `db/sqlc.yaml`, `db/dbgen/` | sqlc replaced by manual D1 queries |
| `db/backup.go`, `db/backup_test.go` | D1 has built-in export (wrangler d1 backup) |
| `srv/server_test.go` | Rewritten as Vitest/Wrangler tests |
| `srv/server.go` (lines 229-256 gzip) | CF Workers compress automatically |
| `srv/static/favicon.ico`, `favicon-32.png`, `favicon-180.png` | Optional; favicon.svg suffices |

### Mapped: Go → TypeScript

| Go Source | TS Target | Notes |
|-----------|-----------|-------|
| `srv/server.go` (core) | `src/index.ts` | Hono app, route registration, middleware, env vars |
| `srv/auth.go` | `src/auth/middleware.ts` | Auth modes, KV session store, login/logout |
| `srv/handlers.go` (all Handle* ) | `src/handlers/*.ts` | One file per domain, ~80 LOC each avg |
| `srv/feed.go` | `src/feed/fetcher.ts` + `src/feed/refresh.ts` | Fetch + background refresh split |
| `srv/opml.go` | `src/opml/parser.ts` | Pure functions, parse/generate OPML |
| `db/db.go` | `src/db/schema.ts` + `src/db/migrations.ts` | Schema as SQL string + manual migration runner |
| `db/migrations/*.sql` | `migrations/*.sql` | Same files, copied verbatim |
| `db/queries/visitors.sql` | `src/db/queries.ts` | All raw SQL queries as functions |
| `db/dbgen/models.go` | `src/db/types.ts` | TypeScript interfaces for rows |
| `srv/templates/app.html` | `src/views/app.html` | Copied verbatim, served as static asset |
| `srv/static/*` | `src/static/*` | Copied verbatim, served via Workers Static Assets |

## 3. Dependencies (npm)

```json
{
  "dependencies": {
    "hono": "^4.x",
    "rss-parser": "^3.x"
  },
  "devDependencies": {
    "wrangler": "^4.x",
    "vitest": "^3.x",
    "typescript": "^5.x",
    "@cloudflare/workers-types": "^4.x"
  }
}
```

**Rationale**:
- **hono** — lightweight, fast, Cloudflare-native router (replaces `net/http` + `http.NewServeMux`)
- **rss-parser** — RSS/Atom feed parser (replaces `gofeed`)
- No need for `fast-xml-parser`: OPML is simple enough to parse with native `DOMParser` on Workers
- No need for ORM: D1 client + raw SQL is sufficient (the app already has direct SQL with `queryArticles()`)

## 4. Wrangler Configuration

```toml
# wrangler.toml
name = "tsrss"
main = "src/index.ts"
compatibility_date = "2026-05-01"

# D1 database binding
[[d1_databases]]
binding = "DB"
database_name = "tsrss-db"
database_id = "<uuid>"

# KV namespace for sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "<uuid>"

# Cron trigger: refresh feeds every 30 minutes
[triggers]
crons = ["*/30 * * * *"]

# Static assets
[site]
bucket = "./src/static"

# Environment variables
[vars]
TSRSS_AUTH_MODE = "none"
TSRSS_PURGE_DAYS = "30"
```

## 5. Database: D1 Schema

**The 3 existing SQL migration files (`001-base.sql`, `002-sort-order.sql`, `003-feed-caching.sql`) are 100% compatible with D1.** Copy them into `migrations/` and run via `wrangler d1 migrations apply tsrss-db`.

The `migrations` tracking table works on D1 since D1 is SQLite under the hood.

## 6. Key Architectural Differences

### 6a. Background Refresh: Goroutine → Cron + Queue

**Current (Go)**:
```go
go func() {
    ticker := time.NewTicker(interval)
    for range ticker.C { refreshAllFeeds(ctx) }
}()
```

**Target (Workers)**:

1. **Cron trigger** fires every 30 minutes → calls `src/cron/refreshFeeds.ts`
2. Each cron execution:
   - Queries `SELECT * FROM feeds ORDER BY last_updated ASC NULLS FIRST LIMIT 100`
   - For each feed NOT in error backoff: fetches, parses, upserts articles
   - Uses `Promise.allSettled` with a concurrency limit (5 at a time, 1s delay between batches)
   - Note: 30 min × 60s = 1800 seconds. With 5 concurrent fetches at ~2s each, can refresh ~900 feeds per cron run. But need to stay under CF Workers CPU time limit (30s on free, unbounded on paid with "unbound" usage model). If feed count is large, use D1 Queues.

3. **Error backoff** logic stays identical (stored in feed row `error_count`):
   ```typescript
   function shouldSkipFeed(feed: Feed): boolean {
     if (feed.error_count === 0 || !feed.last_updated) return false;
     const backoffHours = Math.min(1 << Math.min(feed.error_count, 5), 24);
     const nextAllowed = new Date(feed.last_updated.getTime() + backoffHours * 3600000);
     return new Date() < nextAllowed;
   }
   ```

4. **Manual refresh** (via `POST /api/feeds/refresh`) is the same function, just invoked synchronously.

### 6b. Session Store: In-Memory → KV

**Current (Go)**:
```go
var sessions = map[string]time.Time{}
```

**Target (Workers KV)**: Use KV with 30-day TTL:
```typescript
const sessionTTL = 30 * 24 * 60 * 60; // 30 days in seconds

async function createSession(env: Env): Promise<string> {
  const sessionID = crypto.randomUUID();
  await env.SESSIONS.put(sessionID, "1", { expirationTtl: sessionTTL });
  return sessionID;
}
```

### 6c. Dynamic SQL Builder: queryArticles()

The most complex SQL in the app — used by `HandleGetArticles` with cursor pagination, view filters, sort direction. Ported directly as a template-string builder:

```typescript
function buildArticlesQuery(opts: ArticleQueryOpts): { sql: string, bindings: any[] } {
  const filters: string[] = [];
  const bindings: any[] = [userID, userID];
  // ... same filter logic ...
  return { sql, bindings };
}
```

D1's `prepare().bind().all()` API maps cleanly to the current `sql.DB.QueryContext()` pattern.

### 6d. Middleware Stack

**Current**: `gzipMiddleware(AuthMiddleware(cspMiddleware(mux)))`

**Target** (Hono, each built into the `app.use()` pipeline):
- Gzip: **Automatic** (CF Workers compresses all responses)
- CSP: Hono `c.header()` in middleware
- Auth: Hono middleware checking session/KV or proxy header
- CORS: Not needed (same origin)

### 6e. Template Serving

**Current**: Go `html/template` renders `app.html` with server-side data injection (feeds, counts, user info)

**Target**: Serve `app.html` as static HTML (the template has `{{.Version}}` and `{{.AuthMode}}` placeholders). Replace placeholders at serve time via string replacement, or better — make them optional (the JS already handles all data loading). Two approaches:

1. **Simplest**: Serve `app.html` as-is from static assets. The few `{{.}}` tokens become invisible on the page. JS fetches `/api/articles`, `/api/feeds`, `/api/counts` on init.
2. **Cleaner**: Serve the HTML from a Hono route, read the file, do `.replace('{{.Version}}', version)`. This is the same approach but simpler.

**Recommendation**: Approach 1 (static HTML) is sufficient since the JS already calls the same APIs on page load. The template variables were nice-to-haves (version in CSS cache-buster, auth mode for logout button). Replace version with a build-time constant, and check auth via `/api/me` or JS logic.

### 6f. Feed Fetching: gofeed → rss-parser

**Current**:
```go
parser := gofeed.NewParser()
feed, _ := parser.Parse(io.LimitReader(resp.Body, maxFeedBodySize))
```

**Target**:
```typescript
import Parser from 'rss-parser';
const parser = new Parser();
const feed = await parser.parseString(body);
```

The `rss-parser` npm package handles both RSS 2.0 and Atom, same as gofeed. The data mapping (GUID, title, link, content, published date) is nearly identical.

## 7. API Route Mapping

All 20+ routes map 1:1 from Go ServeMux to Hono:

| Method | Path | Go Handler | TS Handler |
|--------|------|------------|------------|
| GET | `/login` | HandleLogin | `src/handlers/auth.ts` |
| POST | `/login` | HandleLogin | `src/handlers/auth.ts` |
| GET | `/logout` | HandleLogout | `src/handlers/auth.ts` |
| GET | `/` | HandleRoot | `src/handlers/root.ts` |
| GET | `/health` | HandleHealth | inline in `src/index.ts` |
| GET | `/api/feeds` | HandleGetFeeds | `src/handlers/feeds.ts` |
| POST | `/api/feeds` | HandleSubscribe | `src/handlers/feeds.ts` |
| PUT | `/api/feeds/:id` | HandleUpdateFeed | `src/handlers/feeds.ts` |
| DELETE | `/api/feeds/:id` | HandleUnsubscribe | `src/handlers/feeds.ts` |
| GET | `/api/articles` | HandleGetArticles | `src/handlers/articles.ts` |
| GET | `/api/articles/search` | HandleSearchArticles | `src/handlers/search.ts` |
| GET | `/api/articles/:id` | HandleGetArticle | `src/handlers/articles.ts` |
| POST | `/api/articles/:id/read` | HandleMarkRead | `src/handlers/articles-actions.ts` |
| POST | `/api/articles/:id/unread` | HandleMarkUnread | `src/handlers/articles-actions.ts` |
| POST | `/api/articles/:id/star` | HandleStar | `src/handlers/articles-actions.ts` |
| POST | `/api/articles/:id/unstar` | HandleUnstar | `src/handlers/articles-actions.ts` |
| POST | `/api/feeds/:id/mark-read` | HandleMarkFeedRead | `src/handlers/articles-actions.ts` |
| POST | `/api/refresh` | HandleRefresh | `src/handlers/refresh.ts` |
| POST | `/api/feeds/refresh` | HandleRefresh | `src/handlers/refresh.ts` |
| POST | `/api/articles/mark-read-batch` | HandleMarkReadBatch | `src/handlers/articles-actions.ts` |
| POST | `/api/articles/mark-all-read` | HandleMarkAllRead | `src/handlers/articles-actions.ts` |
| GET | `/api/categories` | HandleGetCategories | `src/handlers/categories.ts` |
| POST | `/api/categories` | HandleCreateCategory | `src/handlers/categories.ts` |
| PUT | `/api/categories/reorder` | HandleReorderCategories | `src/handlers/categories.ts` |
| PUT | `/api/feeds/reorder` | HandleReorderFeeds | `src/handlers/categories.ts` |
| GET | `/api/opml/export` | HandleExportOPML | `src/handlers/opml.ts` |
| POST | `/api/opml/import` | HandleImportOPML | `src/handlers/opml.ts` |
| GET | `/api/counts` | HandleGetCounts | `src/handlers/counts.ts` |
| GET | `/static/*` | FileServer | Workers Static Assets |

## 8. Cron Trigger Flow

```
ScheduledEvent (every 30 min)
    │
    ▼
GET all feeds (ORDER BY last_updated ASC NULLS FIRST LIMIT 100)
    │
    ▼
For each feed in parallel batches (5 concurrent):
    │
    ├── shouldSkipFeed? ──YES──▶ skip (update nothing)
    │
    ├── FetchConditional (ETag / If-Modified-Since)
    │   ├── 304 Not Modified ──▶ UpdateMeta (reset error_count)
    │   └── Error ──▶ UpdateMeta (increment error_count)
    │
    └── Success ──▶ UpdateMeta + UpsertArticles (batch)
```

**CPU budget**: Each cron execution has 30s CPU time (free) or unbounded (paid). With 5 concurrent fetches at ~2s each, 30s handles ~75 feeds. If the user has more feeds, increase concurrency or use **D1 Queues** to fan out.

**Queue fallback** (for > 100 feeds):
```typescript
// In cron handler:
for (const feed of feeds) {
  await env.QUEUES.send({ feedId: feed.id }, { delaySeconds: i }); // stagger 1s apart
}
// In queue consumer:
export default { async queue(batch, env) { ... process each feed ... } }
```

## 9. Migration: Database Schema

**No changes needed.** The 3 existing migration SQL files are valid SQLite and work on D1. Run:

```bash
wrangler d1 migrations create tsrss-db 001-base
wrangler d1 migrations apply tsrss-db
```

## 10. Removed Features (Not Ported)

| Go Feature | Reason |
|------------|--------|
| **Backup/Restore** (`db/backup.go`) | D1 has `wrangler d1 backup` natively |
| **CLI flags** (`--backup`, `--restore`, `--version`) | No CLI on Workers |
| **Gzip middleware** | Workers compress automatically |
| **File system backup** | Use D1 export instead |

## 11. Testing Strategy

| Type | Tool | What to Test |
|------|------|-------------|
| Unit tests | Vitest | `shouldSkipFeed`, `filterOldItems`, OPML parse/generate, SQL builder |
| Integration | Wrangler + Vitest | Each API handler with `miniflare` D1 bindings |
| E2E | Wrangler dev + manual | Full browser flow: subscribe → articles appear → mark read → refresh |
| Cron | Wrangler `--test-scheduled` | `wrangler dev --test-scheduled` with `?__scheduled=true` |

**Key test patterns from Go to replicate**:
- `newTestServer()` → `createTestEnv()` (miniflare D1 + KV)
- `authReq()` → helper that sets `X-ExeDev-UserID` header
- `seedFeed()` → D1 `INSERT` helper
- Article list strips content (regression test)
- Cursor pagination correctness
- OPML roundtrip

## 12. Implementation Order

| Phase | Files | Effort |
|-------|-------|--------|
| **0. Scaffold** | `wrangler.toml`, `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts` (empty app) | 30 min |
| **1. Database** | `src/db/types.ts`, `src/db/queries.ts`, `src/db/migrations.ts` | 2h |
| **2. Auth** | `src/auth/middleware.ts`, `src/handlers/auth.ts` | 1h |
| **3. Feed fetch** | `src/feed/fetcher.ts`, `src/feed/refresh.ts` | 2h |
| **4. Handlers** | All `src/handlers/*.ts` (8 files) | 4h |
| **5. OPML** | `src/opml/parser.ts` | 1h |
| **6. Static assets** | Copy `app.js`, `app.css`, `purify.min.js`, `favicon.svg` | 15 min |
| **7. App shell** | `src/handlers/root.ts` + `src/views/app.html` | 30 min |
| **8. Cron** | `src/cron/refreshFeeds.ts` | 1h |
| **9. Testing** | Vitest tests | 3h |
| **10. Deploy** | Wrangler deploy, D1 create + migrations, KV create | 30 min |

**Total**: ~15 hours for a single developer on a first pass.

## 13. Files That Remain UNCHANGED from Go Version

| File | Lines | Reason |
|------|-------|--------|
| `src/static/app.js` | 1500 | 100% vanilla JS, no backend dependency |
| `src/static/app.css` | 1113 | Just CSS custom properties |
| `src/static/purify.min.js` | (minified) | Third-party lib |
| `src/static/favicon.svg` | 6 | Just SVG |
| `migrations/001-base.sql` | 77 | D1-compatible SQLite |
| `migrations/002-sort-order.sql` | 7 | Same |
| `migrations/003-feed-caching.sql` | 8 | Same |

**Everything else is rewritten from Go to TypeScript.**

## 14. TypeScript Compilation & Deployment Workflow

```bash
# Development
npm install
wrangler d1 migrations apply tsrss-db --local
wrangler dev

# Deploy
wrangler d1 migrations apply tsrss-db
wrangler deploy

# Test cron locally
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

`wrangler.toml` `main` points to `src/index.ts` — wrangler handles TypeScript compilation automatically using `esbuild`.

---

*End of port plan. Ready for review before implementation begins.*
