-- Keep all Data API access to these application tables limited to the
-- server's service_role. No policy is granted to anon or authenticated.
create policy "service_role_all" on public.profiles
  for all to service_role using (true) with check (true);
create policy "service_role_all" on public.games_catalog
  for all to service_role using (true) with check (true);
create policy "service_role_all" on public.user_games
  for all to service_role using (true) with check (true);
create policy "service_role_all" on public.play_logs
  for all to service_role using (true) with check (true);
create policy "service_role_all" on public.games
  for all to service_role using (true) with check (true);

-- This legacy event-trigger function only runs as a registered DDL trigger;
-- clients do not need to invoke it via PostgREST.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
