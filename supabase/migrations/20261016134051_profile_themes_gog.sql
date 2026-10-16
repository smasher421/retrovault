-- GOG credentials are private to the Express service. The browser uses the
-- existing Steam session, never a Supabase service role or a GOG bearer token.
alter table public.profiles add column bio text not null default '' check (char_length(bio) <= 500);
alter table public.profiles drop constraint profiles_preferred_theme_check;
alter table public.profiles add constraint profiles_preferred_theme_check check (preferred_theme in (
  'vgui-olive', 'source-obsidian', 'hev-hazard', 'lan-party-98',
  'aperture', 'tf2-red', 'tf2-blu', 'left4dead', 'counter-strike', 'dota2'
));
alter table public.games_catalog add column gog_product_id bigint unique;
alter table public.user_games drop constraint user_games_source_check;
alter table public.user_games add constraint user_games_source_check check (source in ('manual', 'steam', 'gog'));
alter table public.play_logs drop constraint play_logs_source_check;
alter table public.play_logs add constraint play_logs_source_check check (source in ('manual', 'steam', 'gog'));
alter table public.user_games add column provider_account_id text;
alter table public.user_games add column playtime_synced_at timestamptz;

create table public.gog_connections (
  user_id text primary key references public.profiles(steam_id) on delete cascade,
  gog_user_id text not null check (gog_user_id ~ '^[0-9]+$'),
  username text not null,
  avatar_url text,
  tokens_encrypted text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_summary jsonb not null default '{}'::jsonb
);
alter table public.gog_connections enable row level security;
revoke all on public.gog_connections from public, anon, authenticated;
grant select, insert, update, delete on public.gog_connections to service_role;
create policy "Service role manages GOG connections" on public.gog_connections
  for all to service_role using (true) with check (true);

-- An atomic batch preserves reviews/status and only logs new playtime after
-- the first baseline for this GOG account. Unknown stats never erase a total.
create function public.sync_gog_library(p_user_id text, p_gog_user_id text, p_games jsonb)
returns integer language plpgsql set search_path = '' as $$
declare item jsonb; previous public.user_games%rowtype; saved public.user_games%rowtype;
  total integer; known boolean; baseline boolean; changed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 1));
  if not exists (select 1 from public.gog_connections where user_id = p_user_id and gog_user_id = p_gog_user_id) then
    raise exception 'GOG connection changed. Reconnect before syncing.';
  end if;
  for item in select value from jsonb_array_elements(p_games) loop
    select * into previous from public.user_games where user_id = p_user_id and catalog_id = (item->>'catalog_id')::bigint for update;
    known := item->>'playtime_minutes' is not null;
    baseline := previous.source = 'gog' and previous.provider_account_id = p_gog_user_id and previous.playtime_synced_at is not null;
    total := case when known then greatest(0, (item->>'playtime_minutes')::integer)
      when previous.provider_account_id = p_gog_user_id then coalesce(previous.playtime_minutes, 0) else 0 end;
    insert into public.user_games (user_id, catalog_id, status, platform_played, playtime_minutes, last_played_at, source, provider_account_id, playtime_synced_at)
    values (p_user_id, (item->>'catalog_id')::bigint, coalesce(previous.status, case when total > 0 then 'Playing' else 'Backlog' end),
      'GOG', total, coalesce((item->>'last_played_at')::timestamptz, case when previous.provider_account_id = p_gog_user_id then previous.last_played_at end),
      'gog', p_gog_user_id, case when known then now() when previous.provider_account_id = p_gog_user_id then previous.playtime_synced_at end)
    on conflict (user_id, catalog_id) do update set
      platform_played = excluded.platform_played, playtime_minutes = excluded.playtime_minutes,
      last_played_at = excluded.last_played_at, source = excluded.source,
      provider_account_id = excluded.provider_account_id, playtime_synced_at = excluded.playtime_synced_at, updated_at = now()
    returning * into saved;
    if baseline and known and total > previous.playtime_minutes then
      insert into public.play_logs (user_id, user_game_id, catalog_id, source, delta_minutes, total_playtime_minutes)
      values (p_user_id, saved.id, saved.catalog_id, 'gog', total - previous.playtime_minutes, total)
      on conflict (user_game_id, total_playtime_minutes) do nothing;
    end if;
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;
revoke all on function public.sync_gog_library(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_gog_library(text, text, jsonb) to service_role;
