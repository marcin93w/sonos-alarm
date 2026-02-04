# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sonos Alarm is a Cloudflare Workers application that manages Sonos speaker alarms with automatic volume ramping. It gradually increases alarm volume over a time window. The app uses Sonos OAuth for authentication, Cloudflare KV for persistence, and runs cron jobs every minute to adjust volumes.

## Commands

- **Run tests:** `npm test` (uses Node.js built-in `node:test`, finds `test/*.test.js`)
- **Run single test:** `node --test test/alarm.test.js`
- **Local dev:** `npx wrangler dev` (requires Cloudflare credentials and KV namespace)
- **Deploy:** `npx wrangler deploy`

## Architecture

**Runtime:** Cloudflare Workers (ES modules, no TypeScript, no bundler)

**Entry point:** `src/worker.js` — exports `fetch` (HTTP handler) and `scheduled` (cron handler)

**Backend components (`src/`):**
- `worker.js` — Routes requests to `/auth/*`, `/alarms`, `/alarm-config`, and `/timezone` endpoints, serves static assets, runs scheduled alarm adjustments
- `alarm.js` — Alarm domain model with volume ramp calculation (linear interpolation from `initialVolume` to `maxVolume` over configurable duration). `initialVolume` is set from the Sonos alarm's own volume at creation time. `groupNames` is a comma-separated string of human-readable group names resolved from Sonos groups data at creation time.
- `alarm-store.js` — Alarm persistence with abstract base, KV and in-memory implementations (8h TTL)
- `alarm-config-store.js` — Per-alarm config persistence (rampEnabled, maxVolume, rampDuration) in KV key `user:{userId}:alarm-config`, no TTL
- `timezone-store.js` — Per-user timezone persistence in KV key `user:{userId}:timezone`, no TTL. Auto-detected from browser on first use.
- `session.js` — Cookie-based session management (maps session ID → user ID in KV)
- `user-registry.js` — Tracks registered user IDs in a single KV entry for cron iteration
- `sonos/client.js` — Sonos Control API wrapper with OAuth token management
- `sonos/http.js` — HTTP client with timeout (8s default), retry on 5xx/429/408, exponential backoff
- `sonos/token-store.js` — OAuth token persistence (KV and in-memory implementations)
- `logger.js` — Console logger with automatic secret redaction

**Frontend (`public/`):** Vanilla JS, no framework. `app.js` checks auth status, fetches/renders alarms and per-alarm config. `api.js` provides fetch helpers. `ui.js` handles DOM rendering including per-alarm config controls.

**Key flow — Scheduled cron:**
1. Fetches all user IDs from `UserRegistry`
2. For each user: refreshes alarms from Sonos API (if TTL expired), loads per-alarm config, calculates volume by ramping from the alarm's `initialVolume` to `maxVolume` over `rampDuration` minutes, calls Sonos API to set volume

**Key flow — OAuth:**
`/auth/start` → Sonos OAuth → `/auth/callback` (exchanges code for tokens, creates session, registers user)

## Code Patterns

- **Dependency injection** in constructors throughout
- **Abstract base classes** (`AlarmStore`, `AlarmConfigStore`, `TokenStore`) with KV and memory implementations
- **Private methods** use `#` syntax
- **Timezone handling:** Sonos returns local times; converted to UTC using `Intl.DateTimeFormat` with the user's configured timezone (auto-detected from browser, stored in KV, defaults to `Europe/Paris`)

## Environment Variables

Required: `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET`
KV binding: `TOKEN_KV` (configured in `wrangler.toml`)
Optional: `SONOS_OAUTH_BASE`, `SONOS_API_BASE`, `SONOS_REDIRECT_URI`, `HTTP_TIMEOUT_MS`, `HTTP_RETRIES`

## Guidelines

This is a simple pet-project proof-of-concept application. Code simplicity matters the most. It is ok to not cover all the edge cases, especially if it would complicate the code too much.
Unit tests are reqired only for the business logic part. Integration is tested manually.
Avoid obvious code comments.