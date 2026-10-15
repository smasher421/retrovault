-- PostgREST upsert uses ON CONFLICT (user_id, steam_app_id), which cannot infer
-- the old partial unique index. Replace it with a regular unique index.
drop index if exists public.games_user_steam_app_unique;

create unique index games_user_steam_app_unique
  on public.games (user_id, steam_app_id);
