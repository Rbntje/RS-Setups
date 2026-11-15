# Database Structure & Migrations (`worker/migrations/`)

RS Setups uses **Cloudflare D1** (SQLite-compatible serverless relational database) as its single permanent online source of truth.

## Wrangler Binding Configuration

Defined in `worker/wrangler.toml`:
- **Binding name:** `DB`
- **Database name:** `rs-setups-db`
- **Migrations folder:** `worker/migrations`

## Tables in `0001_init.sql`

| Table | Purpose |
| :--- | :--- |
| `users` | Registered driver accounts, PBKDF2 password hashes, team name, last version/circuit |
| `sessions` | Hashed active session tokens with expiration timestamps |
| `user_settings` | Per-user research interval, motion preference, and default game version |
| `driving_profiles` | Separate driving preference rows per `(user_id, game_version)` |
| `circuits` | 24-track EA Sports F1 25 calendar with physics ratings |
| `setups` | Saved user setups, favourite flag, current version, latest parameters & analysis |
| `setup_versions` | Immutable version snapshots (`v1`, `v2`, ...) with diff summaries & feedback notes |
| `setup_feedback` | Chronological log of driver feedback tags and notes per setup |
| `circuit_notes` | Private user notes per `(user_id, game_version, circuit_id)` |
| `research_sources` | Enabled public setup URLs/RSS adapters and their last reachability status |
| `research_results` | Parsed public setup references deduplicated by `content_hash` |
| `research_runs` | Audit trail of automatic, manual, and scheduled research checks |

## Applying Migrations

```bash
# Local Wrangler D1 test database
npx --prefix worker wrangler d1 migrations apply rs-setups-db --local

# Remote production Cloudflare D1 database
npx --prefix worker wrangler d1 migrations apply rs-setups-db --remote
```

## Backing Up & Exporting Data

```bash
# Export full D1 database to a local SQL backup file
npx --prefix worker wrangler d1 export rs-setups-db --remote --output=backup-rs-setups.sql
```
