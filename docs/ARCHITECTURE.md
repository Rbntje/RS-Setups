# Architecture Overview — RS Setups

RS Setups shares a single TypeScript codebase across three delivery targets:
1. **GitHub Pages Web Preview** (static Vite bundle communicating with Cloudflare Workers).
2. **Progressive Web App (PWA)** (installable shell with service worker caching only static assets).
3. **Native iOS App (`RS Setups`)** via **Capacitor** (`ios/`), packaged into an unsigned `.ipa` by GitHub Actions.

## System Diagram

```text
[ iPhone Capacitor App ]   [ GitHub Pages Preview / PWA ]
            \                         /
             \  HTTPS + Bearer Token /
              v                     v
      [ Cloudflare Worker API (worker/src/index.ts) ]
              |                     |
              | SQL                 | Respectful HTTP + robots.txt
              v                     v
     [ Cloudflare D1 ]     [ Public Setup Sources / RSS / URLs ]
```

## Shared Deterministic Setup Engine (`src/engine/`)

- **Zero External AI Calls:** All calculations run locally in deterministic TypeScript (`src/engine/generator.ts`).
- **Strict Version Separation:** `GAME_VERSIONS` in `src/engine/specs.ts` defines separate datasets and notes for `f1_25_2025` (original 2025 cars) and `f1_25_2026_pack` (2026 Season Pack cars inside EA Sports F1 25).
- **Iterative Feedback Loop:** `applyFeedbackToSetup()` modifies only parameters relevant to the driver's reported handling issue, logs parameter-level diffs, preserves previous versions, and adjusts the driver's profile incrementally.

## Shared Backend Logic (`worker/src/router.ts`)

- In production, `worker/src/index.ts` handles Cloudflare Worker `fetch` and `scheduled` cron triggers using Cloudflare's `DB` (`D1Database`) binding.
- In local development and automated tests (`server.ts` and `worker/src/api.test.ts`), `worker/src/d1-sqlite-shim.ts` exposes the identical `D1Database` interface over Node.js built-in `node:sqlite`, executing the exact `worker/migrations/0001_init.sql` file.

## Data Storage & Security Rules

- No user setups, feedback, or driving profiles are stored in `localStorage` or `IndexedDB`.
- Passwords are hashed using Web Crypto PBKDF2-SHA256 (`100,000` iterations + random 16-byte salt).
- Session tokens are randomly generated 256-bit hex tokens stored as SHA-256 hashes in the `sessions` D1 table.
- Every user-owned query enforces `WHERE user_id = ?`.
