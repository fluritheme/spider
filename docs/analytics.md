# Private website analytics

[spider.fluri.xyz/dashboard](https://spider.fluri.xyz/dashboard) uses the same operator access key as the Fluri dashboard, with a separate host-only session and separate EU-jurisdiction D1 database (`spider-analytics`). The Spider package never reports visits or installations. This service measures only this demonstration website.

The Worker aggregates successful HTML navigations to `/` and `/privacy/` by UTC date, fixed page and allowlisted referral category. Query strings, full referrers, visitor identifiers, IP addresses and user agents are not persisted. DNT/GPC requests, common bots, prefetches, assets, errors and private routes are excluded. Totals are approximate requests including repeats, not unique visitors. No browser analytics script or cookie is used. Collection starts with the first eligible request; there is no historical backfill.

The dashboard also fetches official npm daily download reports for `@fluritheme/spider`. npm totals include automation and repeat installs, not package-page views. Pending/unavailable reports are shown explicitly, never as zero. Validated reports are cached on the server for one hour, pending reports for five minutes, failures for one minute. GitHub traffic stays on GitHub behind collaborator access. No GitHub token is deployed.

## Operation

1. Apply `pnpm exec wrangler d1 migrations apply spider-analytics --remote` before deploying.
2. Store only a SHA-256 hex digest of the high-entropy operator key in Worker secret `DASHBOARD_PASSWORD_HASH`. `.dev.vars` is ignored. Do not set Vite environment variables for credentials.
3. `pnpm run deploy` builds the home, dashboard and privacy pages and deploys the Worker.
4. The daily `Analytics retention` GitHub workflow uses repository secret `SPIDER_MAINTENANCE_KEY`. Only its SHA-256 digest is in Worker secret `MAINTENANCE_KEY_HASH`. Run it manually to verify after setup; monitor failures and paused schedules. It removes counts older than the latest 90 UTC days and expired admin sessions. D1 backups follow Cloudflare Time Travel retention. Reapply deletions after restoring a backup.

Login accepts same-origin JSON only, has a 1 KiB streamed body limit and a 5/minute Cloudflare network-local rate limit. Other API requests are limited to 60/minute. Eight-hour random sessions are stored only as hashes. The `__Host-spider_session` cookie is Secure, HttpOnly, SameSite=Strict and scoped to this host. The dashboard/API use `no-store` and `noindex`. Missing bindings or secrets fail closed; database errors never prevent public page delivery.

Rotate the operator key by updating `DASHBOARD_PASSWORD_HASH`; revoke existing sessions with `DELETE FROM admin_sessions` through an authenticated D1 operator session. The dashboard has refresh, authenticated JSON export and sign-out. Keys are never stored in browser local storage or included in URLs. The daily digest used for rate limiting is separate from analytics storage.

The maintenance key permits only retention cleanup. Rotate it by updating both the Worker digest and repository secret. It cannot read analytics. Production bindings and rate-limit namespaces are in `wrangler.jsonc`. Keep the dashboard out of the sitemap. The public privacy notice is at `/privacy/`.
