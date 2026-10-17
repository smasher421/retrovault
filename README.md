# RetroVault

RetroVault is a game collection, discovery, and playtime tracker for Steam, GOG, and manually added games from any platform. Steam OpenID signs players in; a GOG account can then be linked to the same vault. The Express API talks to the stores, while Supabase holds the shared catalog, private collections, profiles, reviews, and playtime activity.

## Features

The RetroVault brand uses the supplied pixel-art vault logo in [`public/retrovault-logo.png`](public/retrovault-logo.png). The original transparent PNG is used in the header/Home link, Home dashboard, sign-in screen, profile avatar fallback, and browser icon. Its artwork and colors are preserved across all themes.

- **Steam sign-in:** Steam OpenID 2.0 is verified server-side. The backend issues a 30-day HMAC-signed, `HttpOnly`, `SameSite=Lax` session cookie; production cookies use `Secure`.
- **Steam library sync:** imports owned games, app IDs, total playtime and last-played times. Re-syncing preserves the player's status, rating, notes and favorites. A sync records increases in Steam playtime as activity deltas.
- **Cross-platform game discovery:** browse GameDB/IGDB platform and genre recommendations, combined with the RetroVault catalog. The **Add Games** search merges RetroVault, GameDB and RAWG results when `RAWG_API_KEY` is configured.
- **Platform and store directories:** browse PC, PlayStation, Xbox, Nintendo, Sega, handheld and arcade platforms, or choose from major game storefronts.
- **Steam Store:** see live Top Sellers, Most Played, New Releases, and Specials for Romania. Open product details or add Steam products directly to Backlog; current prices and chart positions refresh from Steam.
- **GOG Store:** paginated Bestsellers, Classics, New on GOG, and Deals shelves. See current prices, original prices and discounts, open game dossiers with GOG images/screenshots, and add a title to Backlog without owning it. New on GOG is ordered by its store arrival date; Classics uses GOG's own classic tag.
- **Prices:** Steam and GOG prices are displayed in the currency returned by the store for Romania, with a crossed-out original price and discount when applicable. Explicitly free games say Free; missing prices say Price unavailable. Store feeds cache for 10 minutes. Other entries in the store directory remain external links.
- **GOG account sync:** link your GOG account from My Profile and import owned GOG games plus available Galaxy playtime. The sync runs in the background with progress and a retryable summary; your GOG username/avatar appear separately from your Steam identity. Reviews, ratings, notes, favorites and chosen statuses survive repeat syncs.
- **Home:** the logo and Home sidebar entry open a dedicated dashboard with recent games, backlog picks, collection statistics, and direct store/profile/achievement shortcuts. Home is the default after sign-in.
- **My Profile:** identity, editable bio, recorded playtime, completion, ratings, favorites, platform/genre breakdowns, most played games, recent activity, paginated own reviews with sorting, connected accounts, and theme previews.
- **Separate Steam sync:** Steam import stays in the Library and continues tracking Steam playtime. Manually added console and PC editions use the same catalog, with the selected platform stored on your collection entry.
- **Personal collection:** add manually, track a status, set a 1–10 rating, favorite a title, edit notes, or remove it from your collection.
- **Collection views:** poster grid or compact list, search and status filters, completion totals, backlog size and Steam playtime.
- **Paged library:** 24 games per page, with page controls that follow the active search and status filters.
- **Game dossiers and artwork:** descriptions, platforms, release details, Metacritic, RAWG ratings, developer/publisher and screenshots appear first, followed by personal actions and community reviews. Open screenshots in an in-site theater viewer with next/previous navigation and keyboard controls. Existing covers survive RAWG enrichment; affected GameDB entries recover their original IGDB covers on opening. Landscape artwork keeps its aspect ratio. RAWG, GameDB/IGDB, and SteamGridDB supply metadata and artwork when available.
- **Player reviews:** write a 1–10 rating and text review for any game in your collection, or use **Add & write review** from a catalog dossier. Both Steam and RetroVault reviews show **5 per page**, with **Read more / Show less** for long text. Steam reviews are English and sortable by helpfulness, newest, or recently updated, with positive/negative filters. RetroVault reviews have rating filters and newest/highest/lowest sorting. Its pagination counts only public reviews and the current player's own reviews. The Reviews page also lets you choose a game.
- **Achievements:** inspect unlocked and locked achievements for a selected synced Steam game, or connect a RetroAchievements username to browse classic game progress and unlock dates. Steam uses [ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats); classic game progress comes from the [RetroAchievements Web API](https://api-docs.retroachievements.org/). Details load on demand and are cached by the API; the RetroAchievements key stays server-side.
- **VGUI interface:** ten skins: VGUI Olive, Source Obsidian, HEV Hazard, LAN Party 98, Aperture After Hours (Portal), RED Industries and BLU Engineering (TF2), Safe Room (Left 4 Dead), Dust & Steel (Counter-Strike), and Ancient Ember (Dota 2). Profile preview cards apply a skin across the sidebar and all new pages. Choosing a preset clears custom overrides; Settings also offers custom background, panel, accent and text colors. These are fan-made palettes, not official Valve artwork.
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
| `public.gog_connections` | Private per-player GOG identity, encrypted OAuth tokens, connection/sync dates and sync summary. Accessible only to the server service role. |

Migration `20261016134051_profile_themes_gog.sql` adds `profiles.bio`, the six new theme IDs, `games_catalog.gog_product_id`, the `gog` collection/activity source, and GOG sync provenance. Its service-only `sync_gog_library` function writes one batch atomically, locks by player, preserves personal fields, and records positive playtime deltas only after an initial baseline. Steam and GOG editions have distinct catalog keys, so their account playtimes are not combined into one edition.

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
   - [`supabase/migrations/20261016134051_profile_themes_gog.sql`](supabase/migrations/20261016134051_profile_themes_gog.sql)

   The original migrations preserve the legacy collection and introduce the normalized catalog, service-only RLS, indexes, and game artwork. The latest migration adds profile bios, Valve-inspired skins and private GOG account/sync storage. These migrations have been applied to the configured project; use the files for another environment.

4. Set Steam **Profile → Edit Profile → Privacy Settings → Game details** to **Public**.

5. Start the API and frontend together:

   ```sh
   npm run dev:all
   ```

6. Open the Vite URL printed in the terminal, sign in through Steam, then choose **Sync Steam**.

Vite proxies `/api/*` and `/auth/*` to Express on port `3001`. The frontend defaults to port `5173` and selects another free port if needed.

## Connecting GOG

1. Sign in to RetroVault through Steam and open **My Profile → Connected accounts → Connect GOG**.
2. Choose **Open secure GOG sign-in**. Enter credentials only on GOG's own page.
3. After login, GOG redirects to its `embed.gog.com/on_login_success` page. Copy the full address from that tab and paste it in RetroVault's **GOG success URL** field. The connection attempt expires after ten minutes.
4. **Connect & sync library** links the account and starts the first import. Subsequent imports use **Sync GOG library**; no new login is needed while the refresh token remains valid.

The web app uses a manual redirect handoff because the desktop GOG client redirects to GOG's domain, which RetroVault cannot read across browser origins. Account linking is bound to the current Steam session and a short-lived connection attempt. The server exchanges the one-time code, keeps AES-256-GCM-encrypted access/refresh tokens in `gog_connections`, and returns only account display fields. Tokens are bound to the owner through authenticated encryption. The encryption key derives from `GOG_TOKEN_SECRET`, or `SESSION_SECRET` when unset. Keep that secret stable; rotating it requires connecting GOG again.

GOG does not provide this as a registered, supported RetroVault OAuth integration. The desktop protocol is based on the primary implementation in [Heroic gogdl authentication](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/main/gogdl/auth.py), [Heroic GOG library](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/main/src/backend/storeManagers/gog/library.ts), and [Heroic GOG game sessions](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/main/src/backend/storeManagers/gog/games.ts). These interfaces may change independently of RetroVault. A complete login/sync requires the player's interactive GOG sign-in.

### GOG data and sync behavior

- All Galaxy library pages are fetched; only owned GOG entries are imported. Other stores linked inside Galaxy are excluded. Products identified as DLC rather than games/packs are skipped.
- Product artwork, descriptions and screenshots come from GOG. Product metadata is reused for seven days; store offers cache for ten minutes. New store prices are never written into a player's historical purchase price.
- Playtime comes from Galaxy's `time_sum`, in minutes. Games never tracked by Galaxy, private data, and unavailable endpoints may have **Playtime unavailable**. Missing statistics do not erase a previously recorded total. Last-played time is used only when a returned session supplies a date.
- The initial total becomes a baseline, not a new lifetime-sized activity event. Later increases generate activity deltas. A partial failure reports counts and can be retried without duplicating collection entries.
- Sync progress is held by the running Express process. Restarting the API interrupts a running job; start another sync to finish it. Completed batches remain saved. Run one API instance for this first version's job coordinator.
- Disconnect removes saved GOG access, while imported games and reviews stay in the vault. Steam remains the login method. GOG names are shown in the private profile/header; the existing public-profile identity remains Steam.

### Additional GOG API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/store/gog?category=bestsellers&page=1` | GOG shelves: `bestsellers`, `classics`, `new`, `deals`. |
| POST | `/api/store/gog/:id/catalog` | Cache a GOG game's metadata and return its dossier. |
| GET | `/api/accounts/gog` | Sanitized linked account and current sync progress. |
| POST | `/api/accounts/gog/start` | Create a connection attempt and return the official GOG login URL. |
| POST | `/api/accounts/gog/connect` | Exchange the pasted success URL with its connection state. |
| POST | `/api/accounts/gog/sync` | Start/resume by retrying an idempotent import; responds immediately. |
| DELETE | `/api/accounts/gog` | Disconnect the account and remove saved tokens. |

All routes require the RetroVault session. Account/store mutations check the requesting origin. Vite preserves the browser Host header for these checks; deployed reverse proxies must preserve it too, or set `APP_URL` to the exact public origin.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL used by the backend. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database key. Do not expose it to the browser or commit it. |
| `SESSION_SECRET` | Yes | Long random secret used to sign session cookies. |
| `STEAM_API_KEY` | For profile details and library sync | Steam Web API key, used only by Express. Steam OpenID sign-in itself does not require this key. |
| `RETROACHIEVEMENTS_API_KEY` | Optional | RetroAchievements Web API key. Enables retro game achievement progress; keep it server-side in `.env`. |
| `RETROACHIEVEMENTS_USERNAME` | Optional | RetroAchievements username prefilled on the Achievements page. You can change it there. |
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
| `GET` | `/api/achievements/steam/:steamAppId` | Returns the caller's earned and locked achievements for a Steam game in their synced collection. |
| `GET` | `/api/achievements/retro?username=...&count=100&offset=0` | Lists a RetroAchievements user's game completion progress. |
| `GET` | `/api/achievements/retro/:gameId?username=...` | Returns individual RetroAchievements unlocks and earned dates for a retro game. |
| `GET` | `/api/games/:id/details` | Loads cached details and lazily enriches a game in the caller's collection. |
| `POST` | `/api/games` | Adds a manual title. Accepts `title`, `platform`, `genre`/`genres`, `year`, `status`, `notes` and `cover_image`. |
| `PATCH` | `/api/games/:id` | Changes `status`, or updates `rating`, `is_favorite`, `notes`, `review_text`, `purchase_price` or `platform_played`. |
| `DELETE` | `/api/games/:id` | Removes the caller's collection entry. |
| `GET` | `/api/profile` | Reads the current player's settings. |
| `PATCH` | `/api/profile` | Updates `preferred_theme`, `custom_theme`, `bio` (up to 500 characters), or `is_public`. |
| `POST` | `/api/catalog/rawg/:rawgId` | Loads and saves RAWG game metadata and screenshots into the shared catalog. |
| `GET` | `/api/catalog/search?q=...` | Merges RetroVault, GameDB, and configured RAWG title suggestions. |
| `GET` | `/api/catalog/discover?platform=...&genre=...&page=...` | Recommends games by platform or genre while excluding titles already in the caller's library. |
| `GET` | `/api/reviews?limit=...` | Returns recent reviews from public profiles and the caller's own reviews. |
| `GET` | `/api/catalog/:catalogId/reviews?page=1&sort=recent&rating=all` | Five reviews per page, totals and page count. Sort: recent/highest/lowest. Rating: all/positive/mixed/negative/unrated. Visibility is enforced before paging. |
| `GET` | `/api/reviews/page?page=1&sort=recent&rating=all` | The same paged public/own review feed across games; optional `catalog_id` filter. |
| `GET` | `/api/catalog/:catalogId/details` | Loads details and artwork for a catalog game before it is added to a user's collection. |
| `GET` | `/api/store/steam?category=top_sellers\|most_played\|new_releases\|specials` | Returns the selected Steam storefront shelf, including Romanian prices and the current player chart. |
| `POST` | `/api/store/steam/:steamAppId/catalog` | Loads a Steam product into the shared catalog so it can be viewed or added to Backlog. |
| `GET` | `/api/steam/reviews/:steamAppId?sort=helpful&sentiment=all&cursor=*` | Five English Steam reviews per page through IUserReviewsService. Returns `next_cursor` and matching count; URL-encode the cursor for the next request. Sort: helpful/recent/updated; sentiment: all/positive/negative. Cached 15 minutes. |
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
- **Supabase relation/table error:** apply every migration listed above in order. The client uses `profiles`, `games_catalog`, `user_games`, and `play_logs`; the server also uses the private `gog_connections` table.
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

## Coding agent skills

The installed skills, pinned upstream sources, custom workflows, and CLI/authentication status are documented in [docs/agent-skills.md](docs/agent-skills.md). Custom skill sources are maintained in `tooling/skills/`; they are development aids and are not shipped in the website bundle.
