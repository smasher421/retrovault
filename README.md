# RetroVault

RetroVault is a Steam-connected game collection and playtime tracker. Steam OpenID signs players in, the Express API verifies the identity and syncs the visible Steam library, and Supabase stores a shared game catalog plus each user's private collection, profile preferences, and playtime activity.

## Features

- **Steam sign-in:** Steam OpenID 2.0 is verified server-side. The backend issues a 30-day HMAC-signed, `HttpOnly`, `SameSite=Lax` session cookie; production cookies use `Secure`.
- **Steam library sync:** imports owned games, app IDs, total playtime and last-played times. Re-syncing preserves the player's status, rating, notes and favorites. A sync records increases in Steam playtime as activity deltas.
- **Cross-platform game discovery:** browse GameDB/IGDB platform and genre recommendations, combined with the RetroVault catalog. The **Add Games** search merges RetroVault, GameDB and RAWG results when `RAWG_API_KEY` is configured.
- **Platform and store directories:** browse PC, PlayStation, Xbox, Nintendo, Sega, handheld and arcade platforms, or choose from major game storefronts.
- **Steam Store:** see live Top Sellers, Most Played, New Releases, and Specials for Romania. Open product details or add Steam products directly to Backlog; current prices and chart positions refresh from Steam.
- **Separate Steam sync:** Steam import stays in the Library and continues tracking Steam playtime. Manually added console and PC editions use the same catalog, with the selected platform stored on your collection entry.
- **Personal collection:** add manually, track a status, set a 1–10 rating, favorite a title, edit notes, or remove it from your collection.
- **Collection views:** poster grid or compact list, search and status filters, completion totals, backlog size and Steam playtime.
- **Paged library:** 24 games per page, with page controls that follow the active search and status filters.
- **Game dossiers and artwork:** inspect descriptions, platforms, release details, Metacritic, RAWG community ratings, developer/publisher, screenshots and store links. Open screenshots in an in-site theater viewer with next/previous navigation and keyboard controls. RAWG enriches cross-platform catalog matches when its key is configured; GameDB/IGDB remains available for discovery, and SteamGridDB provides community grids, heroes and logos.
- **Player reviews:** write a 1-10 rating and text review for any game in your collection. The Reviews page includes public RetroVault reviews with game and rating filters, plus English Steam community reviews for owned Steam games. Sort Steam reviews by helpfulness, newest, or recently updated and filter positive or negative recommendations.
- **VGUI interface:** four selectable skins—VGUI Olive, Source Obsidian, HEV Hazard and LAN Party 98—with optional custom background, panel, accent and text colors.
- **Activity:** a chronological feed of playtime increases recorded during sync.
- **Public profiles:** profiles are private by default. A player can opt in to a public collection page and a dynamic SVG completion badge.
- **LAN matcher:** compare a player's collection with another public profile and find shared co-op or multiplayer titles.
- **Backlog roulette:** choose a random Backlog entry and launch Steam games with the `steam://run/<appId>` link.
- **Vault audit:** shows backlog size and, when purchase prices are recorded, total cost and cost per tracked play hour.

### Collection statuses

`Backlog`, `Playing`, `Completed`, `100% Completed`, and `Abandoned`.

Steam sync initially assigns `Playing` when Steam reports playtime and `Backlog` when it reports none. Later syncs keep the player's existing status.

## Architecture

```text
Browser (React + Vite)
        │ /api/* and /auth/*
        ▼
Express 5 ───── Steam OpenID / Steam Web API / Steam Store
        │ server-only service role
        ▼
Supabase Postgres
  profiles ─ games_catalog ─ user_games ─ play_logs
```

The browser never receives the Supabase service-role key. Steam IDs from signed sessions are the account IDs; RetroVault does not use Supabase Auth. Every private collection query is scoped by the verified Steam ID in Express. The new tables have RLS enabled and grant Data API access only to `service_role`.

## Data model

The migrations preserve the original `public.games` table and its 366 imported rows. Migration `20261015202324` copies those records to the normalized schema and leaves the legacy table available as a rollback/reference source.

| Table | Purpose |
| --- | --- |
| `public.profiles` | Steam identity, avatar, profile URL, theme settings and public/private preference. Public sharing is off by default. |
| `public.games_catalog` | Shared game metadata keyed by Steam, IGDB, legacy, or manual catalog keys; includes title, release details, genres, artwork, co-op flags and catalog rating rollups. |
| `public.user_games` | Per-player status, rating, platform, playtime, last played time, favorite, notes, review and purchase price. A player can have a title once. |
| `public.play_logs` | Positive playtime deltas linked to a player's collection entry and catalog title. A unique total-playtime constraint makes repeated syncs idempotent. |
| `public.games` | Original schema retained with its existing data; the current application writes to the normalized tables above. |

The rating trigger recalculates a catalog game's average and rating count when a user changes their rating. The `pg_trgm` extension and title index support catalog title search. GameDB's searchable title buckets and per-game records provide the external cross-platform catalog; discovery filters a curated selection of popular games by platform and genre, then combines it with the shared RetroVault catalog. If a release is missing, search GameDB or add it manually.

GameDB publishes lightweight name-search buckets and per-game JSON records; RetroVault fetches a bucket during search and requests platform/game details as needed. The source data is based on IGDB and is credited in the Add Games and Discover screens alongside [LizardByte GameDB](https://github.com/LizardByte/GameDB).

## Run locally

### Requirements

- Node.js and npm
- A Supabase project
- A Steam Web API key for Steam profile details and library sync
- Steam **Game details** privacy set to **Public** so Steam returns owned games/playtime

### Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and enter server-side values. `.env` is ignored by Git. Keep every key server-only; do not add a `VITE_` prefix to secrets.

3. Run the migrations in order in the Supabase SQL Editor, if they have not already been run:

   - [`supabase/migrations/202610150001_retro_vault_games.sql`](supabase/migrations/202610150001_retro_vault_games.sql)
   - [`supabase/migrations/202610150002_fix_steam_upsert_conflict_target.sql`](supabase/migrations/202610150002_fix_steam_upsert_conflict_target.sql)
   - [`supabase/migrations/20261015202324_retrovault_2_catalog_profiles_play_logs.sql`](supabase/migrations/20261015202324_retrovault_2_catalog_profiles_play_logs.sql)
   - [`supabase/migrations/20261015203007_service_role_rls_policies_and_revoke_public_event_function.sql`](supabase/migrations/20261015203007_service_role_rls_policies_and_revoke_public_event_function.sql)
   - [`supabase/migrations/20261015203022_index_catalog_foreign_keys.sql`](supabase/migrations/20261015203022_index_catalog_foreign_keys.sql)
   - [`supabase/migrations/20261015204001_add_game_details_and_artwork_fields.sql`](supabase/migrations/20261015204001_add_game_details_and_artwork_fields.sql)

   Migration 001/002 are the original schema. Migration 003 installs the normalized 2.0 tables and carries forward the old collection data. Migration 004 adds service-role-only RLS policies and revokes public execute on an older event-trigger function; migration 005 indexes catalog foreign keys; migration 006 adds game detail and artwork fields. Migrations 003–006 have been applied to the configured project; use the files for another environment.

4. Set Steam **Profile → Edit Profile → Privacy Settings → Game details** to **Public**.

5. Start the API and frontend together:

   ```sh
   npm run dev:all
   ```

6. Open the Vite URL printed in the terminal, sign in through Steam, then choose **Sync Steam**.

Vite proxies `/api/*` and `/auth/*` to Express on port `3001`. The frontend defaults to port `5173` and selects another free port if needed.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL used by the backend. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database key. Do not expose it to the browser or commit it. |
| `SESSION_SECRET` | Yes | Long random secret used to sign session cookies. |
| `STEAM_API_KEY` | For profile details and library sync | Steam Web API key, used only by Express. Steam OpenID sign-in itself does not require this key. |
| `RAWG_API_KEY` | Optional | Enables RAWG cross-platform search and game details. Keep it server-side in `.env`; RetroVault displays RAWG attribution in catalog search and game details. |
| `STEAMGRIDDB_API_KEY` | Optional | Enables SteamGridDB grid, hero and logo artwork for Steam and non-Steam games. Keep it on the Express server. |
| `APP_URL` | Production | Public origin used to construct Steam's OpenID callback, e.g. `https://vault.example.com`. |
| `PORT` | Optional | Express port; defaults to `3001`. |
| `NODE_ENV` | Production | Set to `production` to use `Secure` cookies. |

`SUPABASE_URL` can alternatively be supplied as `VITE_SUPABASE_URL`, but only the URL is public; database writes still require the server-side service key. Never use `VITE_SUPABASE_SERVICE_ROLE_KEY`.

## API routes

Private routes require the signed Steam session cookie unless noted.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows whether required server configuration is present; returns booleans, never secrets. |
| `GET` | `/auth/steam` | Starts Steam OpenID sign-in. |
| `GET` | `/auth/steam/callback` | Validates state and asks Steam to verify the OpenID assertion. |
| `GET` | `/api/auth/me` | Returns the current Steam identity and profile. |
| `POST` | `/api/auth/logout` | Clears the session cookie. |
| `GET` | `/api/games` | Lists the caller's collection joined with catalog metadata. |
| `GET` | `/api/games/:id/details` | Loads cached details and lazily enriches a game in the caller's collection. |
| `POST` | `/api/games` | Adds a manual title. Accepts `title`, `platform`, `genre`/`genres`, `year`, `status`, `notes` and `cover_image`. |
| `PATCH` | `/api/games/:id` | Changes `status`, or updates `rating`, `is_favorite`, `notes`, `review_text`, `purchase_price` or `platform_played`. |
| `DELETE` | `/api/games/:id` | Removes the caller's collection entry. |
| `GET` | `/api/profile` | Reads the current player's settings. |
| `PATCH` | `/api/profile` | Updates `preferred_theme`, `custom_theme`, or `is_public`. |
| `POST` | `/api/catalog/rawg/:rawgId` | Loads and saves RAWG game metadata and screenshots into the shared catalog. |
| `GET` | `/api/catalog/search?q=...` | Merges RetroVault, GameDB, and configured RAWG title suggestions. |
| `GET` | `/api/catalog/discover?platform=...&genre=...&page=...` | Recommends games by platform or genre while excluding titles already in the caller's library. |
| `GET` | `/api/reviews?limit=...` | Returns recent reviews from public profiles and the caller's own reviews. |
| `GET` | `/api/catalog/:catalogId/reviews` | Returns reviews for a title, respecting each profile's public/private setting. |
| `GET` | `/api/catalog/:catalogId/details` | Loads details and artwork for a catalog game before it is added to a user's collection. |
| `GET` | `/api/store/steam?category=top_sellers\|most_played\|new_releases\|specials` | Returns the selected Steam storefront shelf, including Romanian prices and the current player chart. |
| `POST` | `/api/store/steam/:steamAppId/catalog` | Loads a Steam product into the shared catalog so it can be viewed or added to Backlog. |
| `GET` | `/api/steam/reviews/:steamAppId?sort=helpful&sentiment=all` | Loads English Steam reviews, sortable by helpfulness, recency, or last update and filterable by sentiment. |
| `GET` | `/api/steam/library` | Imports visible Steam games, writes playtime deltas and performs bounded Steam Store enrichment. |
| `GET` | `/api/activity?limit=100` | Lists recent playtime delta records. |
| `GET` | `/api/public/profiles/:steamId` | Public profile summary and collection; only available after the owner opts in. |
| `GET` | `/u/:steamId` | Frontend public profile page. |
| `GET` | `/api/badge/:steamId.svg` | Dynamic SVG completion badge for a public profile. |
| `GET` | `/api/lan-matches/:steamId` | Lists shared co-op/multiplayer games; the other profile must be public. |

## Security and privacy

- OpenID state is checked against a short-lived, HttpOnly cookie; the OpenID assertion is verified with Steam before a session is issued.
- User IDs are derived from the signed session, never from a request body or arbitrary account header.
- The service-role key stays in the Express process. RLS is enabled on the normalized tables, and `anon`/`authenticated` have no table grants.
- Public profiles are opt-in. A public profile route and badge return 404 when the owner is private.
- Steam game library visibility is controlled by Steam's Game details privacy setting; RetroVault cannot import a hidden library.

## Troubleshooting

- **Steam login cannot be verified:** Express needs outbound HTTPS access to `steamcommunity.com`; start both services through `npm run dev:all` and sign in from the Vite origin.
- **Sync returns no games:** check `STEAM_API_KEY`, make Steam Game details public, and restart Express after editing `.env`.
- **Supabase relation/table error:** confirm all three migrations exist in that project, especially migration 003. The current client reads `profiles`, `games_catalog`, `user_games` and `play_logs`.
- **Unique conflict target error:** migration 002 replaces the original partial index with the full `(user_id, steam_app_id)` index required by the legacy upsert path. The normalized 2.0 sync uses the catalog and user-collection constraints from migration 003.
- **Missing Steam covers:** Steam does not publish every artwork variant. RetroVault falls back to the backdrop when available and to a title initial otherwise.
- **Profile not visible:** the owner must enable public sharing in **Social**. Steam profile visibility and RetroVault's own public setting are separate.
- **LAN matcher shows no result:** both accounts need a collection entry for the same game, the game must be marked co-op or multiplayer in the catalog, and the other RetroVault profile must be public.

## Production deployment

Run the Express API and built Vite frontend behind one HTTPS origin, proxy `/api/*` and `/auth/*` to Express, and set `APP_URL` and `NODE_ENV=production`. Put `SUPABASE_SERVICE_ROLE_KEY`, `STEAM_API_KEY` and `SESSION_SECRET` in the hosting provider's server secret store. Express currently exposes the API rather than serving `dist/`; configure the frontend static host or reverse proxy accordingly.

## NPM scripts

| Script | Action |
| --- | --- |
| `npm run dev` | Starts Vite. |
| `npm run server` | Starts Express on port 3001 by default. |
| `npm run dev:all` | Starts Vite and Express together. |
| `npm run build` | Builds the frontend into `dist/`. |
| `npm run preview` | Previews the Vite production build. |
| `npm run lint` | Runs ESLint. |
