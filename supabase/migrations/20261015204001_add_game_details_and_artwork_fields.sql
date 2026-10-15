alter table public.games_catalog
  add column if not exists metacritic_score smallint,
  add column if not exists metacritic_url text,
  add column if not exists screenshots text[] not null default '{}'::text[],
  add column if not exists artwork_grid_url text,
  add column if not exists artwork_hero_url text,
  add column if not exists artwork_logo_url text,
  add column if not exists details_updated_at timestamptz;

alter table public.games_catalog
  add constraint games_catalog_metacritic_score_check
  check (metacritic_score is null or metacritic_score between 0 and 100);
