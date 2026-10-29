-- 05.2 D-03..D-05, 05.1 D-54/D-55: what each account is for, stored on the account (one source). Household-shared like every account column.
alter table public.accounts add column if not exists use text
  check (use is null or use in ('everyday', 'mixed', 'dedicated', 'untouched'));
alter table public.accounts add column if not exists use_purpose text
  check (use_purpose is null or use_purpose in ('emergency', 'envelope'));
alter table public.accounts add column if not exists use_envelope_id uuid references public.savings_goals(id) on delete set null;
alter table public.accounts add column if not exists use_extra_set_aside bigint
  check (use_extra_set_aside is null or use_extra_set_aside between 0 and 10000000000000);

-- An envelope purpose with a null envelope id is allowed: the envelope was deleted and the snapshot reads it as unanswered.
alter table public.accounts drop constraint if exists accounts_use_shape;
alter table public.accounts add constraint accounts_use_shape check (
  coalesce(use = 'dedicated', false) = (use_purpose is not null)
  and (use_envelope_id is null or use_purpose = 'envelope')
  and (use_extra_set_aside is null or use = 'mixed')
);

create or replace function public.guard_account_use()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.use_envelope_id is not null and not exists (
       select 1 from public.savings_goals g where g.id = new.use_envelope_id and g.household_id = new.household_id) then
    raise exception 'accounts: envelope is not in this household' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_account_use() from public, anon, authenticated;

drop trigger if exists guard_account_use on public.accounts;
create trigger guard_account_use before insert or update of use_envelope_id on public.accounts
  for each row execute function public.guard_account_use();

grant insert (use, use_purpose, use_envelope_id, use_extra_set_aside) on public.accounts to authenticated;
grant update (use, use_purpose, use_envelope_id, use_extra_set_aside) on public.accounts to authenticated;
