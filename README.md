# RS Setups

**RS Setups** is a 100% local on-device iPhone & web setup assistant for **EA Sports F1 25** (**2025 Cars** and **2026 Season Pack**).

- **100% On-Device & Account-Free:** Starts completely clean from scratch with zero accounts, driver names, team names, or external servers.
- **Folders & Custom Organization:** Automatic `2025` and `2026` folders plus custom folders, setup naming, parameter review & editing before saving, and multi-criteria sorting.
- **Self-Coded Setup AI + 200 MB Memory Guard:** Custom TypeScript setup engine & live optimizer (`src/engine/setupAi.ts` + `src/storage/storageOptimizer.ts`) with a strict 200 MB storage cap.
- **Phone-First Experience & Direct `.IPA` Download:** Always presented in native iPhone format (393px frame on desktop with Website Admin & `.IPA` download companion; edge-to-edge iOS app on phone).

## Quick Commands

```bash
npm install
npm test        # Unit tests (engine, coded AI, parser, IPA resolver, localStore, 200MB optimizer)
npm run lint    # TypeScript typecheck
npm run build   # Build production frontend + offline PWA
npm run dev     # Start local preview on http://localhost:3000
```

## Dutch Guides

- [`docs/INSTALLATIE-NL.md`](docs/INSTALLATIE-NL.md) — Google AI Studio → GitHub → GitHub Pages & iPhone `.IPA`
- [`docs/IPA-GUIDE-NL.md`](docs/IPA-GUIDE-NL.md) — Sideloading & `.IPA` details
