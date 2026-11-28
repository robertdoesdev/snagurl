# SnagUrl 2.0

SnagUrl checks a media link, shows what is behind it, downloads the file when the host allows it, and can convert direct media files (audio extraction, MP4 renditions, GIF, image formats) through a separate FFmpeg worker. Built with Next.js (App Router), TypeScript and Tailwind CSS. The worker is a dependency-free Node service.

## What actually works

| Source | Detect | Preview | Download | Convert | Basis |
|---|---|---|---|---|---|
| Direct media links | yes | yes | yes | yes, if the worker is configured | Fetched server-side through the guarded client, streamed to the browser |
| YouTube | yes | title, channel, thumbnail | no | no | Public oEmbed. YouTube's developer policies prohibit downloading or storing its video without written approval |
| TikTok | yes | oEmbed details | no | no | Public oEmbed. The Display API only covers a signed-in user's own videos |
| X | yes | author and post confirmation | no | no | Public oEmbed. No thumbnail, no media |
| Instagram | yes | no | no | no | Meta's public oEmbed returns only embed markup, with no title, thumbnail or media |
| Facebook | yes | no | no | no | Same as Instagram |
| Pinterest | yes | no | no | no | Pin data is only offered through an OAuth API for approved apps. No permitted way to fetch a pin from a link alone |

"Detect" means the link is recognised and validated (for example a YouTube channel page is rejected as "not a video link" before any request is made). Platform downloads are intentionally not implemented. Doing so would mean circumventing access controls or breaching platform terms, which the project rules out. SnagUrl says so in the interface instead of showing fake download buttons.

Conversion is only ever offered for direct media links. A platform link can never reach the worker.

### Provider research (what was checked, and how reliable it is)

| Finding | Source | Confidence |
|---|---|---|
| YouTube Data API v3: default 10,000 units per day, `videos.list` costs 1 unit | Google's quota documentation, fetched during development | Read directly |
| X API: pay-per-use, $0.005 per post read, 3 million post reads per month cap on that plan | X developer documentation, fetched during development | Read directly. Prices change |
| TikTok Display API: `video.list` and `user.info.basic` permissions to read a user's public videos; no fields for downloading | TikTok developer documentation, fetched during development | Read directly, but the page did not state the OAuth and review requirements |
| Pinterest developer rules: bring-your-own-key apps must keep user credentials client-side; apps must not solicit passwords or session cookies | Pinterest developer guidelines excerpt | Read directly. The excerpt did not contain scraping or caching rules, and the API v5 pin endpoints and access tiers could not be fetched, so the Pinterest conclusion above is cautious rather than confirmed |
| Meta oEmbed returns embed markup only for Instagram and Facebook | Meta documentation and earlier probing | Read directly |

No provider listed here has been exercised with real credentials, because none is implemented. SnagUrl contains no licensed third-party provider integration.

## Architecture

```
Browser ──▶ Next.js app on Vercel ─────────────────────────────┐
              /api/resolve   provider registry ─▶ adapters      │
              /api/download  signed, streamed direct downloads  │ HMAC-signed
              /api/jobs      create / poll / cancel conversions ├──────────────▶ Worker (Docker host)
              /api/status    provider and worker status         │                 queue ▶ guarded fetch ▶
              /api/health                                       │                 ffprobe ▶ ffmpeg ▶ temp file
Browser ◀── signed file link ───────────────────────────────────┴─────────────────  GET /files/:id (signed)
```

- **Provider registry** (`src/lib/media/providers`). Every platform has an adapter implementing `MediaProvider`: `validate(url)` (shape check and reference id), `availability()` (active or restricted, with the reason), and `resolve(url)` (metadata, thumbnail, formats and signed download paths). Platform identification is `detectSource` in `sources.ts` (exact host or real subdomain, so look-alike domains do not match). API routes call `resolveMedia` and contain no platform logic. Adding a provider means writing one adapter, registering it in `providers/index.ts` and adding its `SourceDefinition` in `sources.ts`.
- **Web app on Vercel.** Resolving and previews are short requests. Direct downloads stream through a function, so plan duration limits cap the largest file.
- **Worker** (`worker/`). Needed because FFmpeg runs for tens of seconds to minutes and needs a binary, disk and CPU, which do not fit ordinary serverless functions. It is deployed independently as a container. The browser never talks to it except to download a finished file through a signed link, so no CORS and no change to the web app's CSP are needed.
- **Job queue.** In-memory inside the worker, bounded by `WORKER_MAX_CONCURRENT` and `WORKER_MAX_QUEUED`. No external queue or object storage is used, so run exactly one worker instance (see Known limitations).

### Worker behaviour

- Job states: `queued`, `fetching`, `processing`, `done`, `failed`, `cancelled`, `expired`.
- Auth: every job request carries `x-snagurl-timestamp` and `x-snagurl-signature`, an HMAC-SHA256 over timestamp, method, path and body hash, valid within 60 seconds. Comparison is constant time.
- Source fetching uses the same SSRF defences as the web app (copied into the worker so it deploys on its own): one DNS resolution, rejection if any address is private or reserved, connection to the validated address, redirects re-validated and capped at three, no credentials or custom ports.
- Retry: transient fetch failures (network, timeout, 5xx, 429) retry with exponential backoff up to `WORKER_FETCH_RETRIES`. Conversion failures are not retried.
- Timeout: `WORKER_JOB_TIMEOUT_SECONDS` for the whole job; ffmpeg is killed on timeout.
- Cancel: aborts the fetch, kills ffmpeg and deletes the job directory. The web app also cancels a job when the user leaves the card.
- Isolation: one directory per job (random 128-bit id, mode 0700), ffmpeg spawned without a shell and with a minimal environment, `-protocol_whitelist file`, and ffprobe must report an allowed container (MP4/MOV, Matroska/WebM, AVI, MP3, Ogg, WAV, FLAC, AAC, GIF and common image formats). HLS and concat playlists are rejected, so a crafted file cannot make ffmpeg read other local files or reach the network.
- Limits: input size, output size (also passed to ffmpeg as `-fs`), media duration, queue depth.
- Cleanup: the job directory is deleted on failure or cancel, the input is deleted on success, finished jobs are swept after `WORKER_RETENTION_MINUTES`, and leftover job directories are removed at start-up.
- Delivery: `GET /files/:id?exp=&sig=` with an HMAC signature over the job id and expiry. Responses use `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.

### Conversions

| Id | Output | From |
|---|---|---|
| `mp3` | MP3, 192 kbps | video, audio |
| `m4a` | AAC in M4A, 192 kbps | video, audio |
| `mp4-720`, `mp4-480` | H.264 + AAC MP4, never upscaled | video |
| `gif` | first 15 s, up to 480 px wide, 12 fps | video |
| `jpg`, `png`, `webp` | single image | image |

Only these are offered, and only where the source actually has the needed streams. The interface lists them from the resolved media, and the worker re-checks with ffprobe. Audio/video merging of separate streams is not offered because no supported source delivers separate streams.

## Run locally (Windows, cmd)

Requires Node.js 22.18 or newer (the worker runs TypeScript directly) and, for conversion, FFmpeg on your PATH (`winget install Gyan.FFmpeg`, then open a new cmd window).

```
cd C:\path\to\snagurl
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000. Direct downloads and previews work without any variables. If the project is two folders deep (`snagurl\snagurl`), `cd` into the inner folder that contains `package.json`.

To try conversion locally, in a second window:

```
cd C:\path\to\snagurl\worker
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
set SNAGURL_WORKER_SECRET=<paste the value>
npm start
```

Add the same value to `.env.local` as `SNAGURL_WORKER_SECRET` and set `SNAGURL_WORKER_URL=http://localhost:8080`, then restart `npm run dev`. The worker refuses loopback and private addresses, so test with a public direct media URL, not a file served from your own machine.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint (Next.js core-web-vitals and TypeScript rules) |
| `npm test` | Web unit and handler tests (Node's built-in runner) |
| `npm run test:worker` | Worker tests, including real ffmpeg pipelines (skipped if ffmpeg is absent) |
| `npm run typecheck:worker` | Worker type check |
| `npm run check` | Typecheck, lint and tests for the web app |

## Environment variables

See `.env.example` (web) and `worker/.env.example`.

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | web | Production | Canonical URLs, sitemap, robots, social cards |
| `NEXT_PUBLIC_CONTACT_EMAIL` | web | Recommended | Contact link and legal pages |
| `SNAGURL_SIGNING_SECRET` | web | Production | 16+ characters (use 32 random bytes). Signs download links; downloads and `/api/health` fail closed without it |
| `SNAGURL_MAX_FILE_BYTES` | web | No | Direct download size cap. Default 250000000 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | web | Recommended | Shared rate limiting. Without them limits are per instance |
| `SNAGURL_WORKER_URL` | web | For conversion | Worker base URL. https in production |
| `SNAGURL_WORKER_SECRET` | web and worker | For conversion | 32+ characters, identical on both sides |
| `SNAGURL_WORKER_PUBLIC_URL` | web | No | Hostname browsers use to download finished files, if different |
| `PORT`, `HOST`, `WORKER_*`, `FFMPEG_PATH`, `FFPROBE_PATH` | worker | No | Capacity, limits and tool paths. Defaults in `worker/.env.example` |

Conversion is hidden in the interface, and `/api/jobs` answers 503 `not_configured`, until both `SNAGURL_WORKER_URL` and `SNAGURL_WORKER_SECRET` are valid. A short secret or an http (non-localhost) URL in production counts as not configured. No platform API keys are read by this release.

## API

All error bodies are `{ "error": { "code", "message", "source"? } }` with `Cache-Control: no-store`.

| Endpoint | Description |
|---|---|
| `POST /api/resolve` `{ "url" }` | Same-origin, JSON only, rate limited. Returns `{ "media": MediaInfo }` including `formats` and, when the worker is on, `conversions` |
| `GET /api/download?url&exp&sig` | Streams a file for a URL signed by `/api/resolve`. Signature, size and MIME are re-checked |
| `POST /api/jobs` `{ "url", "operation" }` | Starts a conversion. 202 with `{ "job": JobView }`. 422 if the operation does not fit the media or the source is a platform link. 503 `not_configured` without a worker |
| `GET /api/jobs/:id` | `JobView`: `status`, `progress` (0 to 1 or null), `error`, and `download` (`url`, `filename`, `mime`, `bytes`) once done. The signed link is renewed on each poll |
| `DELETE /api/jobs/:id` | Cancels a job (same-origin only) |
| `GET /api/status` | Provider availability and worker reachability (`ok`, `unreachable`, `not_configured`) |
| `GET /api/health` | `ok` or 503 if misconfigured; includes `conversion: "configured" | "off"` |

Worker endpoints (called by the web app, not by browsers): `POST /jobs`, `GET /jobs/:id`, `DELETE /jobs/:id` (signed requests), `GET /files/:id?exp&sig` (signed link), `GET /health` (public, returns only `status`).

A job id is an unguessable 128-bit capability. Anyone holding it can poll or cancel that job through the web app, so ids are never put in URLs the page shares or in history.

## Deploy the web app to Vercel

1. Create a GitHub repository, then from the project folder:
   ```
   git init
   git add .
   git commit -m "SnagUrl 2.0"
   git branch -M main
   git remote add origin https://github.com/<you>/snagurl.git
   git push -u origin main
   ```
   `.gitignore` already excludes `.env*` and `node_modules`.
2. At vercel.com choose Add New, Project, import the repository. Framework is detected as Next.js; leave the root as `/` (the `worker/` folder is excluded from the web build).
3. Project Settings, Environment Variables (Production): `NEXT_PUBLIC_SITE_URL`, `SNAGURL_SIGNING_SECRET`, optionally `NEXT_PUBLIC_CONTACT_EMAIL`, Upstash values, and the worker variables once the worker exists.
4. Deploy, then open `https://your-domain/api/health` and `https://your-domain/api/status`.
5. Variables starting with `NEXT_PUBLIC_` are baked in at build time, so redeploy after changing them.

## Deploy the worker

The worker is a container with Node 22 and FFmpeg. Any Docker host works. Fly.io is shown because `worker/fly.toml` is included; treat it as a starting point and confirm the settings against Fly's current documentation.

```
cd worker
fly launch --no-deploy --copy-config
fly secrets set SNAGURL_WORKER_SECRET=<32+ random characters>
fly deploy
```

Then in Vercel set `SNAGURL_WORKER_URL=https://<app>.fly.dev` and the same `SNAGURL_WORKER_SECRET`, and redeploy. Check `https://<app>.fly.dev/health` and the web app's `/api/status` (`worker: "ok"`).

Operational notes:

- Run exactly one instance. Jobs and files live in that instance's memory and disk; a restart drops in-flight jobs (users see a "job doesn't exist" error and can retry).
- Give it local disk for `maxConcurrent × (input + output)` at your size limits.
- Rotate the secret by changing it on both sides at once.
- Put the worker behind TLS (the platform does this). The signed finished-file links are valid for 15 minutes and are renewed by polling.

## Deployment checklist

- [ ] `SNAGURL_SIGNING_SECRET` set; `/api/health` returns ok.
- [ ] Upstash configured; `/api/health` shows `"rateLimit": "shared"`.
- [ ] `NEXT_PUBLIC_SITE_URL` set to the final domain.
- [ ] Worker deployed, secret identical on both sides, `/api/status` shows `worker: "ok"`.
- [ ] One real conversion tested end to end with a public direct MP4.
- [ ] Privacy and Terms reviewed by a lawyer.
- [ ] Monitor pointed at `/api/health` and the worker's `/health`.

## Testing

Run `npm test` (web), `npm run test:worker`, and `npm run typecheck:worker`. What each layer actually covers:

| Area | How it is tested | Status |
|---|---|---|
| URL parsing, IP blocking, DNS-rebinding lookup guard, redirects, signing, rate limits | Unit tests against real code | Fully tested |
| Direct provider and download route | Handler tests with the network layer replaced by fakes | Mocked network |
| YouTube, TikTok, X oEmbed adapters | Tests with mocked oEmbed responses. Never called against the live services in this build environment | Mocked |
| Instagram, Facebook, Pinterest adapters | Tests that they validate URL shapes and refuse to resolve with the stated reason | Fully tested (they make no network calls) |
| Adapter registry, platform identification, look-alike hosts | Unit tests | Fully tested |
| Worker auth, queue, concurrency, retry, cancel, cleanup, limits, HTTP server and signed delivery | Unit and HTTP tests with the source fetch and ffmpeg replaced by fakes | Fully tested logic, mocked processing |
| Worker FFmpeg pipelines (mp3, m4a, mp4-480, mp4-720 no-upscale, gif, jpg, png, webp, rejection of text-as-media, HLS-as-media, wrong streams) | Real ffmpeg and ffprobe on generated media, outputs verified by ffprobe. The network fetch is replaced by a local copy, because the real fetcher correctly refuses loopback | Real ffmpeg, stubbed fetch |
| Worker SSRF guard | Unit tests on the guard, URL checks and rebinding lookup. No live fetch to a public host was run | Unit tested |
| Browser flow with the real worker | Playwright against the real web route handlers and a real worker process with real ffmpeg; the first resolve step and the source download are stubbed for the same loopback reason | Browser, real worker, stubbed source |
| Existing browser suite (layouts at desktop and phone widths, keyboard, themes, history, errors) | Playwright | Fully tested |
| Platform downloads (YouTube, TikTok, X, Instagram, Facebook, Pinterest) | Not implemented | Provider-restricted |
| Live calls to platform oEmbed endpoints, real public direct URLs, Vercel, Fly | Not run in the build environment (no outbound network) | Untested |

The build environment had no npm registry access, so `next build`, ESLint and the TypeScript check of the React components were not run there. `npm run check` and `npm run build` must be run once on a machine with network access, and CI (`.github/workflows/ci.yml`) runs them for both packages. TypeScript was checked for the library and API code and for the worker.

## Security model

- **URL validation.** Only `http` and `https`, no credentials, no custom ports, length limit, numeric hosts normalised before checks, and per-platform shape validation.
- **SSRF and DNS rebinding.** Outbound requests (web and worker) use a custom DNS lookup that resolves once, rejects if any returned address is private, loopback, link-local, reserved, multicast or an IPv4-mapped equivalent, and connects to that validated address.
- **Redirects.** Capped at three; each hop is re-validated.
- **Fixed provider hosts.** Platform adapters contact only their own oEmbed host and pass the user's link as a query parameter.
- **Limits.** Connect, idle and total timeouts, JSON size caps, file size caps (declared and counted while streaming), MIME allowlist at resolve and download, and ffprobe content checks in the worker.
- **Signed links.** Direct downloads and worker files use HMAC links that expire after 15 minutes. Worker job requests are HMAC-signed with a 60 second window. A request signature is not valid as a file signature.
- **Abuse controls.** Per-client rate limits on resolve, download, job creation and polling, concurrent download cap, worker queue cap, same-origin checks on state-changing routes, JSON content-type checks.
- **Filenames.** Sanitised on the web side and again in the worker; downloads are always `attachment` with `nosniff`.
- **Secrets.** Server-side environment variables only. Worker URL and secret never appear in responses, and worker errors are mapped to generic messages.
- **Headers.** CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS in `next.config.ts`.
- **Replay.** A captured signed worker request could be replayed inside its 60 second window. The worker's operations are idempotent in effect (they create a job), so the exposure is limited to extra jobs; use TLS and keep the secret private.

Rate limiting trusts `x-real-ip` and `x-forwarded-for`, which Vercel sets. Elsewhere, put the app behind a proxy that overwrites them.

## Estimated recurring costs

These are estimates from general knowledge of public pricing, not quotes. Confirm on each provider's pricing page.

| Item | Estimate |
|---|---|
| Vercel | Hobby is free but limited to non-commercial use. Commercial or ad-supported use needs Pro, about $20 per month per seat |
| Worker host | A small always-on container, roughly $5 to $15 per month depending on CPU and memory. Converting video needs CPU, so size it to your concurrency |
| Upstash Redis | Free tier covers light use |
| Domain | About $10 to $15 per year |
| Bandwidth | Converted files leave the worker host and direct downloads leave Vercel, so heavy use raises both |
| Platform APIs and licensed providers | $0. None are integrated. X's pay-per-use API ($0.005 per post read) and others are not used |

## Known limitations

- Platform downloads (YouTube, TikTok, X, Instagram, Facebook, Pinterest) are not provided. Previews exist for YouTube, TikTok and X only.
- Images, GIFs, carousels and audio from platforms are not available for the same reason. Conversion applies to direct media links only.
- oEmbed endpoints can change or rate limit. TikTok's oEmbed has carried a deprecation warning.
- One worker instance only. No persistence across restarts, no object storage, no horizontal scale.
- Conversion progress depends on ffmpeg reporting time, which is approximate for GIFs and images.
- The conversion UI and components could not be type-checked or linted where this was built.
- The Privacy and Terms pages are drafts, not legal advice.

## Advertising

Configured in `src/config/ads.ts`. Ads are off and no network is integrated, so nothing renders. To add a network later: set `enabled: true`, load its script only when `useAdConsent()` returns `"granted"` or the network offers a non-personalised mode, and extend the Content Security Policy for its domains.

## Project structure

```
src/
  app/             pages, metadata routes
    api/           resolve, download, jobs, status, health
  components/      interface components (resolver, result card, convert panel, ...)
  config/          site and ads configuration
  lib/
    api/           request guards and error responses
    media/         URL parsing, source definitions, MIME and filename helpers, resolve
      providers/   adapters: direct, oembed (youtube, tiktok, x), restricted (instagram, facebook, pinterest), validators
    security/      IP rules, guarded fetch, signing, rate limits, concurrency
    worker/        worker client, request signing, conversion catalogue
worker/
  src/             server, job manager, guarded fetch, ffmpeg wrappers, auth, tests
  Dockerfile, fly.toml, .env.example
```

## Legal

The Privacy and Terms pages describe the current behaviour. They have not been reviewed by a lawyer and must be before public launch.
