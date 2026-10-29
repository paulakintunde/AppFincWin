-- 05.2 D-06..D-10, DSU-15: income tag and refund link. Engine view only; balances never change.
alter table public.transactions add column if not exists income_kind text
  check (income_kind is null or (char_length(income_kind) between 1 and 40 and income_kind ~ '^[a-z0-9_-]+$'));
alter table public.transactions add column if not exists counts_as text
  check (counts_as is null or counts_as in ('available', 'kept'));
alter table public.transactions add column if not exists refund_of uuid references public.transactions(id) on delete set null;

alter table public.transactions drop constraint if exists transactions_refund_of_shape;
alter table public.transactions add constraint transactions_refund_of_shape
  check (refund_of is null or (is_refund and original_amount > 0 and transfer_id is null and refund_of <> id));

create index if not exists transactions_refund_of_idx on public.transactions (refund_of) where refund_of is not null;

create or replace function public.guard_transaction_refund()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_target record;
begin
  if new.refund_of is null then return new; end if;
  select household_id, original_amount, transfer_id into v_target
    from public.transactions where id = new.refund_of;
  if not found or v_target.household_id <> new.household_id then
    raise exception 'transactions: refund target is not in this household' using errcode = '42501';
  end if;
  if v_target.original_amount >= 0 or v_target.transfer_id is not null then
    raise exception 'transactions: a refund must link to a purchase' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_transaction_refund() from public, anon, authenticated;

drop trigger if exists guard_transaction_refund on public.transactions;
create trigger guard_transaction_refund before insert or update of refund_of on public.transactions
  for each row execute function public.guard_transaction_refund();

grant insert (income_kind, counts_as, refund_of) on public.transactions to authenticated;
grant update (income_kind, counts_as, refund_of) on public.transactions to authenticated;
