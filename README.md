# Product Video Discovery Dashboard

Type a product name, paste a product link, or upload a photo. The app reads the product image, collects short-form videos from **Instagram Reels** and the **Meta Ad Library** (TikTok optional), scores every video 0-100 against the product with a one-line reason, removes duplicates and anything you have already seen, and shows the results in a React dashboard.

**Demo video:** [demo/product-demo.mp4](demo/product-demo.mp4) (4:44: search by name, search by link, 20 + 20 target, repeat search with new videos)
**Test evidence:** [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) (5 products, live data)

## Status, plainly

- Works end to end with **live data**: Apify (Instagram + Meta Ad Library) and Gemini vision scoring. Search by keyword, product link and photo all work.
- The **20 + 20 minimum is not reliably met.** In the 5-product test it was met fully once (generic keyword). Niche products and photo-based searches fall short, mainly because few relevant Meta *video* ads exist and the photo-based scorer is strict. The dashboard shows each shortfall and why instead of hiding it. Details in [Test evidence](#test-evidence) and [Known limitations](#known-limitations).
- TikTok is implemented but has **not been run** against the real actor.

## Quick start

```bash
cp .env.example .env        # fixtures mode runs with no keys (synthetic videos)
docker compose up --build   # open http://localhost:8080
```

Without Docker (Node 22 and a Redis on `localhost:6379`):

```bash
docker run -d -p 6379:6379 redis:7-alpine
cd backend  && npm install && npm run dev      # API on :8080
cd frontend && npm install && npm run dev      # UI on :5173 (proxies /api)
```

Use either Docker (UI on :8080) or the dev servers (UI on :5173), not both at once: they share port 8080 and keep separate databases.

**Going live**: in `.env` set `SOURCE_MODE=live`, `APIFY_TOKEN`, and one vision option:

| Vision option | Cost | Setup |
|---|---|---|
| Google Gemini (default if key set) | free tier | `GEMINI_API_KEY` from https://aistudio.google.com/apikey |
| Ollama (local model) | free, no account | `ollama pull qwen2.5vl:7b`, `OLLAMA_URL=http://localhost:11434` |
| Anthropic Claude | paid | `ANTHROPIC_API_KEY` |

Without any vision option the app still runs but scores on caption text only and says so in the UI. Keys live only in `.env` (git-ignored); `.env.example` is committed. Optional: `ENABLE_TIKTOK=true`.

Apify actors used (all configurable, see `.env.example`): `apify~instagram-hashtag-scraper`, `apify~facebook-ads-scraper`, `clockworks~tiktok-hashtag-scraper`. Apify bills per result (roughly $0.003 per Instagram result and $0.006 per ad); one live search cost about $0.45 in testing. `MAX_ROUNDS` and `CANDIDATES_PER_ROUND` bound the spend.

Tests: `cd backend && npm test` (48 tests: de-duplication, near-duplicate detection, scoring, query rotation, SSRF guard, page extraction, batch vision scoring against a mock provider). Evidence run: `npm run eval`.

## Architecture

```
React (Vite) -- POST /api/search --> Fastify -- enqueue --> BullMQ (Redis) --> worker: runSearch()
     ^                                  |                                       |
     | SSE /api/search/:id/events       v                                       v
     +------- GET /api/search/:id    SQLite <-- results, history, seen IDs   1 resolve product (URL -> title/desc/image, cached)
              GET /api/history                                                2 image brain -> attributes, queries, hashtags (cached)
              GET /api/thumb (proxy)                                          3 Instagram | Meta | TikTok? in parallel
              /api/shortlist[...]                                                (each: fetch -> dedup -> score -> widen)
                                                                              4 persist, emit "done"
```

| Piece | Choice | Why |
|---|---|---|
| API | Fastify + zod | Schema validation, fast, easy SSE |
| Queue | BullMQ on Redis | Long searches do not block requests; Redis also backs the analysis cache |
| Store | SQLite (better-sqlite3) | History, seen-video IDs and perceptual hashes fit a few indexed tables; WAL mode. Swap to Postgres for multiple API instances |
| Frontend | React + Vite, plain CSS | Working features over polish; `EventSource` for live progress |
| Vision | Pluggable (`brain/vision.ts`): Gemini, Ollama, Anthropic | One vision-language model does attribute extraction and per-video judging with structured JSON. Gemini's free tier makes the project runnable without paid keys; several thumbnails are judged per call and calls are paced to fit free-tier limits |

`backend/src`: `routes/` HTTP, `pipeline/` orchestration and query rounds, `collectors/` one adapter per source, `brain/` analysis and scoring, `dedup/`, `resolver/` page extraction, `net/` SSRF guard and retry/timeout helpers, `queue.ts`, `db.ts`.

The worker runs inside the API process and progress events use an in-memory bus. Fine for one instance; scaling out would need a Redis pub/sub bus.

## Video sources

| Source | Method | Why |
|---|---|---|
| Instagram Reels | Apify hashtag scraper, `resultsType: reels` | Instagram has no public search API; the Graph API only covers your own account and limited hashtag access, and scraping with a personal login risks bans and ToS problems |
| Meta Ad Library | Apify Ad Library scraper over the public library, `media_type=video` | The official Ad Library API only returns political/issue ads (and all ads only in the EU/UK) and gives a snapshot URL rather than media, so it cannot supply commercial product video ads for most markets |
| TikTok (bonus) | Apify TikTok hashtag scraper behind `ENABLE_TIKTOK` and a per-search toggle | Isolated: its failure never touches the required sources |
| Fixtures | `SOURCE_MODE=fixtures` | Deterministic offline demo and testing, clearly labelled in the UI |

**Failure handling** (`pipeline/collectSource.ts`, `net/resilience.ts`): per-source timeout and up to 2 retries with exponential backoff and jitter; 429, 5xx and timeouts retry. Auth, missing-actor and out-of-credit errors (401/403/402/404) are *fatal*: no retry, the source is marked `failed` or `blocked`, and the other sources continue. Sources run in parallel and never throw, so one failing source cannot fail the search. Rows with no video, thumbnail or ID are dropped as missing data. Every source reports a state (`ok | partial | blocked | failed`) with notes, shown in the UI.

**Fewer than 20 usable videos:** the loop widens the query for up to `MAX_ROUNDS` rounds (specific phrase, alternate phrasing, broader hashtags, bare product type). If it still falls short, clearly marked **weak matches** top the list up, and the UI shows a shortfall banner with what was fetched, removed and discarded. It never fails silently and never pads with unmarked results.

## Image brain

1. **Analyse the product once** (cached by image hash and title): type, colours, prints, logos, text on the product, material, shape, plus search queries, hashtags and Meta Ad Library keywords. With no photo (keyword input) it works from text only and keeps only attributes the text supports, so it cannot invent a colour you did not ask for. With no vision provider it falls back to a keyword heuristic, labelled as such.
2. **Queries come from the analysis**, not the raw input: hashtags for Instagram/TikTok, keyword phrases for Meta.
3. **Score each candidate**: the model sees the product photo and the video thumbnail (caption only as a weak hint) and returns `{score, sameProduct, reason}` under a strict rubric. With a photo it judges *the same product* (same print, colour, logo, shape = 90+; same category but different design = 40-69). With no photo it judges fit to the text description. Eight thumbnails are judged per model call.
4. **Final score** = `0.9 x visual + up to 10 points of caption/term overlap`; if the model says it is *not* the same product the score is capped at 59, so a similar-but-different item can never show as a match.
5. **Thresholds** (`MATCH_THRESHOLD=60`, `WEAK_THRESHOLD=40`): 60+ match, 40-59 weak (shown, badged, only used to fill a shortfall), below 40 discarded. These are starting values I did not tune quantitatively.
6. The `reason` is stored and shown on every card.

Only the thumbnail is compared, not sampled frames, so a product that appears later in a video is missed, and thumbnails often show a face or text overlay.

## De-duplication

Applied per candidate, in order (`dedup/dedupe.ts`):

1. **Exact**: key = `platform:videoId`; with no ID, `platform:h_` + SHA-1 of the media URL with tracking and CDN-signature params stripped and query params sorted.
2. **Across searches**: any video shown in an earlier search is filtered out (rows in `search_results`), also when its thumbnail hash is within 4 bits of an earlier shown video. The **"Show previously seen"** toggle turns this off; such videos are tagged.
3. **Near-duplicates inside a set**: a 64-bit **dHash** of the thumbnail (Hamming distance 8 or less) catches reposts and re-uploads; **caption similarity** (trigram Jaccard on normalised text, 0.85 or more) **and** the same advertiser catches one ad running under several IDs. Near-uniform thumbnails (black first frames) are excluded from hash comparison because they would all look identical.
4. **Top-up and repeat searches**: when dedup and threshold leave fewer than 20, more rounds fetch with expanded queries. A repeat of the same input **rotates to later hashtag/query groups**, because the sources cannot be paged by offset and reusing the first query would return the same videos again.

Every returned video is stored with the search that returned it.

## Security

- Product URLs: http(s) only, no credentials in URL, DNS resolved and **every** address checked against loopback, private, link-local, CGNAT and metadata ranges, re-checked on each redirect, with redirect, size and time caps. The thumbnail proxy uses the same guard. Residual risk: DNS rebinding between lookup and connect; use an egress proxy in production.
- Input validated with zod; uploads limited to 5 MB images and re-encoded with sharp; the search endpoint is rate-limited.
- All keys come from environment variables; `.env` is git-ignored.
- Structured logs (pino) with `searchId`; errors return `{error, message}`.

## Dashboard

Search bar (name or link) plus photo upload; product panel with detected attributes; tabs per source with live `n/20` meters; per-source status and shortfall explanation; sorting and filters (score, newest, minimum score, hide weak); cards with thumbnail, platform badge, score, reason, caption and a link to the original (inline play for ads); live pipeline progress over SSE; history; shortlist with CSV export; loading, empty and error states; responsive, light and dark.

## Test evidence

Live run, 5 products (3 keywords, 2 product links), strong matches out of a target of 20 per source. Full table, settings and good/bad examples in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

| Product | Instagram | Meta | Note |
|---|---|---|---|
| oversized graphic tee | 37 | 20 | target met; repeat run: 36 videos, 0 repeated |
| protein dark chocolate | 10 (+10 weak) | 0 (+1 weak) | few relevant Meta video ads; repeat: 21 videos, 0 repeated |
| insulated stainless steel tumbler | 9 (+11 weak) | 4 (+13 weak) | |
| Allbirds Tree Runner (link) | 2 (+8 weak) | 3 | same colourway scores 87-89, other models/colourways 45 |
| Glossier Balm Dotcom (link) | 1 (+3 weak) | 0 | most posts show several products or an unconfirmable variant |

Run with `MAX_ROUNDS=2` and `CANDIDATES_PER_ROUND=25` to stay inside a free Apify plan (code defaults are 4 and 40, which I have not measured).

## Known limitations

- **The 20 + 20 target is often missed** for niche products (see above). Reliable 20 + 20 would need deeper fetching (more Apify credit), more source providers, or relaxing the match threshold.
- **Single-thumbnail scoring** is the main accuracy limit: generic products give false positives and products shown mid-video are missed. Next step: sample 2-3 frames per video.
- **Repeat searches are weaker** than the first run because the best matches were already shown.
- **Gemini free tier** is rate limited and Google may use free-tier inputs to improve its products, so do not send private images. Calls are paced and retried, so a live search takes about 1.5-3 minutes.
- Instagram video URLs usually cannot be hot-linked, so the UI links out; thumbnails go through the SSRF-guarded proxy because CDN URLs expire.
- Apify actor output fields were checked against real responses for Instagram and Meta only. Actor schemas can change.
- Match thresholds were not tuned on a labelled set; there is no accuracy number beyond the examples in the test results.
- The worker and event bus are in one process.
- TikTok is untested against the real actor.

## What I would build next

Frame sampling and an embedding pre-filter (CLIP/SigLIP) to cut model cost and improve accuracy; a labelled eval set to tune thresholds; a Redis-backed event bus and separate worker; Postgres; provider failover (a second actor or RapidAPI source); a per-video score cache; deployment with health checks.
