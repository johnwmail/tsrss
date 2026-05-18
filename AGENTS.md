# Agent rules

## Cloudflare operations
- NEVER use curl to operate Cloudflare assets (D1, KV, etc.)
- Always use `npx wrangler` or `cloudflare/wrangler-action@v3` for all Cloudflare operations
