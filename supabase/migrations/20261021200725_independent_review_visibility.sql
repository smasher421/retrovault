-- Existing reviews keep following profile privacy until the author changes them.
alter table public.user_games
  add column review_visibility text not null default 'profile'
  check (review_visibility in ('profile', 'public', 'private'));

comment on column public.user_games.review_visibility is
  'profile: follow profile privacy; public: community review even with a private profile; private: only the author';

notify pgrst, 'reload schema';
