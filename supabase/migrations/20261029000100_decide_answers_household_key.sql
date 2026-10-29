-- 05.2 review WR-04: the decide_answers live key includes the household.
-- RLS and the client query are per household, so after a household move the old live row is invisible while the
-- old (created_by, kind, key) index still collides with it (23505 on a different row). Additive: the new index is
-- created first and is strictly looser than the old one, so it cannot fail on existing data; then the old one is dropped.
create unique index if not exists decide_answers_live_key_household
  on public.decide_answers (created_by, household_id, kind, key) where deleted_at is null;
drop index if exists public.decide_answers_live_key;
