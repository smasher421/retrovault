-- Sourced public metadata and private planning data have separate ownership.
alter table public.games_catalog add column discovery_metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(discovery_metadata) = 'object');
alter table public.user_games add column tracking jsonb not null default '{}'::jsonb
  check (jsonb_typeof(tracking) = 'object');
alter table public.user_games add column achievements_summary jsonb
  check (achievements_summary is null or jsonb_typeof(achievements_summary) = 'object');
alter table public.user_games add column recent_playtime_minutes integer
  check (recent_playtime_minutes is null or recent_playtime_minutes >= 0);
alter table public.profiles add column saved_searches jsonb not null default '[]'::jsonb
  check (jsonb_typeof(saved_searches) = 'array' and jsonb_array_length(saved_searches) <= 25);
alter table public.user_games drop constraint user_games_status_check;
alter table public.user_games add constraint user_games_status_check
  check (status in ('Backlog', 'Playing', 'Paused', 'On Hold', 'Completed', '100% Completed', 'Abandoned', 'Endless', 'Waiting for Update'));
-- Existing owner checks and RLS continue to apply. No public grants are added.
notify pgrst, 'reload schema';
