-- 05.5-27 / 05.5-28 (Q11 = A, owner 2026-11-15): the server records when the spare-money anchor was confirmed.
-- Band A2 (expand), second file of the A2 push. Proven by supabase/tests/database/99_decide_unspent_anchor_set_at.test.sql.
--
-- Decide counts what is spent after the confirm day. A line logged later the same day (an "I bought it") was missed until
-- the next confirm. unspent_anchor_set_at is the moment of the confirm, so 05.5-28 can count lines logged after it on that
-- day. It is stamped here, by a trigger, and never by a client: no insert or update grant is given, the apply_patches
-- column map does not know it (a patch naming it is refused with 22023), and the trigger overwrites anything an insert
-- carries. Older confirms stay null and keep today's rule.
--
-- Undo of a confirm restores the anchor through apply_patches, which re-stamps the restore time. Accepted: the restored
-- anchor then only rolls forward lines logged after the undo on its own day, which is the cautious side (the old rule).
--
-- Additive: one nullable column and one trigger. Nothing is dropped or renamed.

alter table public.decide_settings add column if not exists unspent_anchor_set_at timestamptz;

comment on column public.decide_settings.unspent_anchor_set_at is
  'Server-stamped moment unspent_anchor / unspent_anchor_at last changed; null when no anchor or confirmed before this column existed. Clients cannot write it.';

create or replace function public.stamp_unspent_anchor_set_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.unspent_anchor_set_at := case
      when new.unspent_anchor is not null or new.unspent_anchor_at is not null then now()
      else null end;
  elsif new.unspent_anchor is null and new.unspent_anchor_at is null then
    new.unspent_anchor_set_at := null;
  elsif new.unspent_anchor is distinct from old.unspent_anchor
        or new.unspent_anchor_at is distinct from old.unspent_anchor_at then
    new.unspent_anchor_set_at := now();
  else
    new.unspent_anchor_set_at := old.unspent_anchor_set_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.stamp_unspent_anchor_set_at() from public, anon, authenticated;

drop trigger if exists stamp_unspent_anchor_set_at on public.decide_settings;
create trigger stamp_unspent_anchor_set_at before insert or update on public.decide_settings
  for each row execute function public.stamp_unspent_anchor_set_at();
