# RetroVault

RetroVault is a personal game-library tracker built around Steam. Sign in with Steam, import the games Steam makes visible to your account, track your own completion status, and see library-wide counts and playtime. Your collection is stored in a Supabase Postgres database.

## What it includes

- **Steam sign-in:** Steam OpenID 2.0 login, verified by the Express backend. RetroVault stores the returned 64-bit Steam ID as the account identifier; it does not create a Supabase Auth user.
- **Steam library sync:** imports owned game names, Steam app IDs, cover images, total minutes played, and last-played timestamps through Steam's `GetOwnedGames` Web API. Syncing again updates imported game details while preserving the status you chose in RetroVault.
- **Personal collection tracking:** add a game manually, look up metadata with RAWG, change its status, add notes, or remove it.
- **Collection stats:** total entries, completed entries, currently playing entries, completion percentage, and total Steam playtime. Counts include both manually added and Steam-imported rows; playtime comes from Steam-imported rows.
- **Find and filter:** search by title or platform and filter by platform or status.
- **Persistent, per-account storage:** each row is scoped to its verified Steam ID in Supabase.

### Game statuses

`Backlog`, `Playing`, `Completed`, `100% Completed`, and `Abandoned`.

Steam imports initially use `Playing` when Steam reports any playtime and `Backlog` otherwise. RetroVault then preserves your chosen status during subsequent syncs.

## Tech stack

- React 19, Vite 8, Tailwind CSS 4
- Express 5 API
- Supabase Postgres through `@supabase/supabase-js`
- Steam OpenID 2.0 for login and the Steam Web API for owned games/playtime
- RAWG API for optional manual-entry metadata lookup

## Run locally

### Requirements

- Node.js with npm
- A Supabase project
- A Steam Web API key for library sync
- A Steam profile whose **Game details** are visible to the Steam Web API

### Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the server-side values described below. Keep `.env` private; it is ignored by Git.

3. In the Supabase SQL Editor, run the migrations in order:

   - [`supabase/migrations/202610150001_retro_vault_games.sql`](supabase/migrations/202610150001_retro_vault_games.sql)
   - [`supabase/migrations/202610150002_fix_steam_upsert_conflict_target.sql`](supabase/migrations/202610150002_fix_steam_upsert_conflict_target.sql)

   If migration `001` has already been applied, run `002` to replace the earlier partial index with the full unique index required by Steam sync.

4. In Steam, set **Profile â†’ Edit Profile â†’ Privacy Settings â†’ Game details** to **Public**. Steam's `GetOwnedGames` endpoint only returns the library when game details are visible to the API.

5. Start the API and Vite together:

   ```sh
   npm run dev:all
   ```

6. Open the Vite URL shown in the terminal (normally `http://localhost:5173`; Vite picks another port if that one is occupied). Select **Log in with Steam**, then **Sync Steam library**.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL used by the backend. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key for database access. Never expose it to Vite or the browser and never commit it. |
| `SESSION_SECRET` | Yes | Long random secret used to sign RetroVault's session cookie. |
| `STEAM_API_KEY` | For library sync | Steam Web API key used to retrieve owned games and playtime. Keep it on the server. |
| `RAWG_API_KEY` | Optional | Enables the **Fetch** metadata lookup for manually added games. |
| `APP_URL` | Production | Public HTTPS origin used to construct the Steam OpenID return URL, e.g. `https://vault.example.com`. |
| `PORT` | Optional | Express API port; defaults to `3001`. |
| `NODE_ENV` | Production | Set to `production` to mark the session cookie `Secure`. |

Steam login can work without `STEAM_API_KEY`; the key is needed only for library/playtime sync. RAWG is optional. Do not add secrets with a `VITE_` prefix: Vite variables are bundled into browser code.

## How authentication and data access work

1. The browser starts login at `GET /auth/steam`.
2. The backend creates a short-lived state cookie and redirects the browser to Steam OpenID.
3. Steam returns the claimed Steam ID and signed OpenID fields to `/auth/steam/callback`. The backend checks the state and asks Steam to verify the assertion.
4. On success, the backend issues a 30-day, HMAC-signed, `HttpOnly`, `SameSite=Lax` session cookie. In production, the cookie is also `Secure`.
5. The backend derives the Steam ID from that signed cookie and scopes every collection query to that ID. It never trusts an account ID sent in a request header.
6. The backend uses `SUPABASE_SERVICE_ROLE_KEY`; the key is not sent to the browser. The `games` table has RLS enabled and grants direct table access only to `service_role`.

Steam IDs are stored as `user_id` text values in `public.games`. They are not foreign keys to `auth.users`, because this Steam OpenID flow is implemented by the RetroVault backend rather than Supabase Auth.

## Database

The migrations create or extend `public.games` with these columns:

| Column | Meaning |
| --- | --- |
| `id` | Identity primary key. |
| `user_id` | Verified 64-bit Steam ID, stored as text. |
| `title`, `platform`, `genre`, `year` | Game details. Steam imports use platform `Steam`, genre `Unknown`, and a null year. |
| `status` | One of the five supported collection statuses. |
| `notes`, `cover_image` | User notes and cover image URL. |
| `created_at` | Row creation time. |
| `steam_app_id` | Steam app ID; null for manual entries. |
| `playtime_minutes` | Total minutes reported by Steam; zero for manual entries. |
| `last_played_at` | Timestamp reported by Steam, if available. |
| `source` | `manual` or `steam`. |

The `(user_id, steam_app_id)` unique index lets PostgREST upsert imported Steam games. PostgreSQL permits multiple null `steam_app_id` values, so manual entries can coexist. The app does not automatically delete a previously imported row if it disappears from a later Steam response.

## API reference

All collection and metadata routes require a valid Steam session unless noted.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Unauthenticated configuration check. Returns booleans for Supabase, Steam API key, and session secret; never returns the secrets. |
| `GET /auth/steam` | Starts Steam OpenID login. |
| `GET /auth/steam/callback` | Verifies Steam's OpenID response and creates a session. |
| `GET /api/auth/me` | Returns the signed-in Steam ID or `null`. |
| `POST /api/auth/logout` | Clears the session cookie. |
| `GET /api/games` | Lists the signed-in user's collection. |
| `POST /api/games` | Adds a manual game. Required JSON field: `title`; supported optional fields: `platform`, `genre`, `year`, `status`, `notes`, `cover_image`. |
| `PATCH /api/games/:id` | Changes a game's `status`. |
| `DELETE /api/games/:id` | Deletes a game belonging to the signed-in user. |
| `GET /api/steam/library` | Fetches visible Steam-owned games and upserts them into Supabase. |
| `GET /api/metadata?title=...` | Looks up RAWG metadata for a title; requires `RAWG_API_KEY`. |

The Vite dev server proxies `/api/*` and `/auth/*` to Express on port `3001`.

## Troubleshooting

- **Steam login cannot be verified:** the backend must be able to make outbound HTTPS requests to `steamcommunity.com`. Start both services with `npm run dev:all` and retry login from the Vite URL shown in the terminal.
- **Steam sync says no visible games:** set Steam **Game details** to **Public**, confirm `STEAM_API_KEY` is in `.env`, and restart the server after changing `.env`.
- **Upsert says no matching unique/exclusion constraint:** run migration `002` in the Supabase SQL Editor. It replaces the earlier partial index with the full `(user_id, steam_app_id)` unique index.
- **Database access fails:** confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct, then run both SQL migrations. Check `http://localhost:3001/api/health` for configuration presence; it does not test the database connection.
- **Metadata fetch fails:** `RAWG_API_KEY` is optional, but required for that button. Manual game entry does not depend on RAWG.
- **Vite uses a port other than 5173:** another process is using 5173; open the alternate local URL printed by Vite. The API remains on port 3001 unless `PORT` is changed.

## Production deployment

Deploy the frontend and Express API behind the same HTTPS origin. Route `/api/*` and `/auth/*` to the Express server, set `APP_URL` to the public origin, and set `NODE_ENV=production`. Keep the service-role key, Steam API key, and session secret in the hosting provider's server-side secret store. The Express server currently exposes the API and does not itself serve the built Vite assets, so configure a static frontend host/reverse proxy as part of deployment.

## NPM scripts

| Script | Action |
| --- | --- |
| `npm run dev` | Starts Vite on port 5173 (or the next available port). |
| `npm run server` | Starts the Express API on port 3001 by default. |
| `npm run dev:all` | Starts Vite and Express together. |
| `npm run build` | Builds the frontend into `dist/`. |
| `npm run preview` | Serves the Vite production build locally. |
| `npm run lint` | Runs ESLint. |

