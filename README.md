# SnagUrl

SnagUrl checks a media link, shows what is behind it and downloads the file when the host allows it. Built with Next.js (App Router), TypeScript and Tailwind CSS.

## What works

| Source | Capability | How |
|---|---|---|
| Direct links (MP4, WebM, QuickTime, MP3, M4A, AAC, Ogg, WAV, FLAC, JPEG, PNG, GIF, WebP, AVIF) | Preview and download | Fetched server-side through the guarded client, then streamed to the browser |
| YouTube | Preview only | Public oEmbed endpoint: title, channel, thumbnail |
| TikTok | Preview only | Public oEmbed endpoint |
| X | Preview only | Public oEmbed endpoint: author, no thumbnail |
| Instagram, Facebook | Not available | Meta's public oEmbed returns only embed markup |

Platform downloads are intentionally not implemented. YouTube's developer policies prohibit downloading or storing its video without written approval, and TikTok's, X's and Meta's public embed services provide previews, not files. Adding extraction would mean circumventing access controls, which the project rules out.

Not implemented: format conversion and audio-only extraction (they need a transcoding worker, see Infrastructure), and in-page download progress (native browser downloads report progress in the browser's own download UI).

## Run locally

Requires Node.js 20.9 or newer.

```
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed in development; a temporary signing secret is generated.

Optional: copy `.env.example` to `.env.local` and fill it in.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint (Next.js core-web-vitals and TypeScript rules) |
| `npm test` | Unit and handler tests (Node's built-in test runner) |
| `npm run check` | Typecheck, lint and tests |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Production | Final domain, used for canonical URLs, sitemap, robots and social cards |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Recommended | Shows the Contact link and the contact line on the legal pages |
| `SNAGURL_SIGNING_SECRET` | Production | 16+ characters (use 32 random bytes). Signs download links. Downloads and `/api/health` fail closed without it |
| `SNAGURL_MAX_FILE_BYTES` | No | Download size cap in bytes. Default 250000000 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Recommended | Shared rate limiting across instances. Without them, limits are per instance |

Variables starting with `NEXT_PUBLIC_` are baked in at build time, so redeploy after changing them. Never commit `.env*` files; `.gitignore` already excludes them.

## Deploy to Vercel

1. Push the project to GitHub and import it at vercel.com. `vercel.json` already selects the Next.js framework.
2. In Project Settings, Environment Variables, add the variables above for Production.
3. Optional but recommended: create a free Upstash Redis database and add its REST URL and token.
4. Deploy, then check `https://your-domain/api/health`. It returns `{"status":"ok","signing":true,"rateLimit":"shared"}` when configured correctly and a 503 when the signing secret is missing.
5. Point a monitor (Vercel, UptimeRobot, Better Stack) at `/api/health`.

Errors are written as single-line JSON to the function logs (`instrumentation.ts` and the API error handler), so they appear in Vercel's log search and can be forwarded to any log drain.

## Infrastructure notes

- Resolving links and previews are short requests and suit serverless functions.
- Downloads stream through a function, so function duration and plan limits cap the largest file that can complete. Lower `SNAGURL_MAX_FILE_BYTES` to match your plan's maximum duration, or raise the function's `maxDuration` if your plan allows.
- The concurrency cap and the in-memory rate limiter are per instance. The Upstash limiter is global.
- Format conversion and audio extraction would require a separate worker (for example a small container running ffmpeg behind a job queue and object storage with expiry). It was not built because no source currently provides media that may legitimately be converted, and nothing here pretends otherwise.

## Security model

- **URL validation.** Only `http` and `https`, no credentials, no custom ports, length limit, and numeric hosts normalized before checks.
- **SSRF and DNS rebinding.** All outbound requests use a custom DNS lookup that resolves the hostname once, rejects the request if any returned address is private, loopback, link-local, reserved, multicast, or an IPv4-mapped equivalent, and connects to that validated address. There is no second resolution.
- **Redirects.** Capped at three, and every hop goes through the same validation.
- **Fixed provider hosts.** Platform providers contact only their own oEmbed host. The user's link is passed as a query parameter, never as the destination.
- **Limits.** Connect, idle and total timeouts, a response size cap for JSON, a file size cap for downloads (declared and counted while streaming), and a MIME allowlist checked at resolve time and again at download time.
- **Signed downloads.** Download links are HMAC-signed over the URL and expiry and last 15 minutes. `/api/download` is not an open proxy.
- **Abuse controls.** Per-client rate limits, a concurrent download cap, same-origin and JSON content-type checks on `POST /api/resolve`.
- **Headers.** CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS are set in `next.config.ts`.
- **Storage.** Nothing is written to disk. Files stream through memory. The only persisted data is rate-limit counters (expiring) and the user's own browser storage.
- **Credentials.** The only secrets are server-side environment variables. None reach client code.

Rate limiting trusts `x-real-ip` and `x-forwarded-for`, which Vercel sets. If you deploy elsewhere, put it behind a proxy that overwrites them.

## Advertising

Configured in `src/config/ads.ts`. Ads are off (`enabled: false`) and no network is integrated, so no ad containers or test ads render. Three labelled placements exist: below the navigation, between sections away from results, and above the footer. Each reserves its height to avoid layout shift.

To add a network later: set `enabled: true`, load the network's script only when `useAdConsent()` (in `src/lib/consent.ts`) returns `"granted"` or the network provides a non-personalized mode, mount its code in the matching `ad-<placement>` container, and extend the Content Security Policy in `next.config.ts` for the network's domains. When ads are enabled and `consentRequired` is true, a compact consent bar appears with equal Allow and Decline choices.

## Project structure

```
src/
  app/            pages, metadata routes, sitemap, robots, Open Graph images
    api/          resolve, download, health
  components/     interface components
  config/         site and ads configuration
  lib/
    api/          request guards and error responses
    media/        URL parsing, source registry, providers, MIME and filename helpers
      providers/  direct.ts, oembed.ts, index.ts
    security/     IP rules, guarded fetch, JSON fetch, signing, rate limits, concurrency
  instrumentation.ts
```

Adding a provider means writing a `MediaProvider` in `src/lib/media/providers`, registering it in `index.ts` and defining its capability in `src/lib/media/sources.ts`.

## Legal

The Privacy and Terms pages are drafts that describe the current behavior. They have not been reviewed by a lawyer and must be before public launch.
