-- Record fields on transactions and accounts (D-01, D-16, D-30, D-37, D-39,
-- D-45, D-48, D-50, D-54, Phase 1 D-26/D-27).
--
-- Every change here is additive: new nullable or defaulted columns only, no
-- drop, no type change, no narrowing -- an installed app that still sends
-- and selects an explicit column list is unaffected (FND-10).
--
-- Adds the fields REC-01..04/07/REC-14..18/ACT-03 need: a payee name and
-- descriptive payment_type, a pending/paid/skipped status, soft delete,
-- import batch tagging, the (not-yet-existing) recurring series link, an
-- occurrence date, and updated_by. Also adds this phase's statement-import
-- extension in the same migration, because plan 02-09's read RPCs and the
-- apply_patches allowlist reference these columns: raw amount/balance
-- provenance, an OFX FITID (external_id), a short import_format code, a
-- transfer link, and optional account overdraft/credit limits.

-- 1. Additive columns on transactions. recurring_series_id gets its foreign
-- key and uniqueness constraint in plan 02-08 (the recurring_series table
-- does not exist yet); adding the column now means transactions_active
-- (below) already carries it.
alter table public.transactions
  add column name text check (name is null or char_length(name) between 1 and 200),
  add column category_id uuid references public.categories(id) on delete set null,
  add column payment_type text check (payment_type is null or payment_type in (
    'card', 'bank_transfer', 'direct_debit', 'standing_order', 'cash',
    'direct_deposit', 'invoice', 'transfer', 'card_payout'
  )),
  add column status text not null default 'paid' check (status in ('pending', 'paid', 'skipped')),
  add column deleted_at timestamptz,
  add column import_batch_id uuid,
  add column recurring_series_id uuid,
  add column occurrence_date date,
  add column updated_by uuid references auth.users(id) on delete set null;

-- 1b. Statement-import provenance and the transfer link (D-39, D-45, D-50,
-- D-54). Kept alongside the columns above rather than a later migration
-- because 02-09's read RPCs and apply_patches allowlist (migrations
-- 0500/0600) reference them; the transfer-pair trigger and import_profiles
-- table are plan 02-38 (migrations 0700/0800).
alter table public.transactions
  add column raw_amount    text check (raw_amount    is null or char_length(raw_amount)  <= 64),
  add column raw_balance   text check (raw_balance   is null or char_length(raw_balance) <= 64),
  add column external_id   text check (external_id   is null or char_length(external_id) between 1 and 255),
  add column import_format text check (import_format is null or import_format ~ '^[a-z]{2,8}$'),
  add column transfer_id   uuid;
create index transactions_external_id_idx on public.transactions (account_id, external_id) where external_id is not null;
create index transactions_transfer_id_idx on public.transactions (transfer_id) where transfer_id is not null;
-- FITIDs repeat across statements from the same bank, so this index allows duplicates (D-54, RESEARCH §A1).
-- import_format uses a short-code check instead of an enum list so Phase 2.1 can write 'pdf' without a constraint change.

-- 2. Account limits and updated_by (D-48). No check couples a limit to
-- kind: kind is updatable, and a coupled check would turn a kind change
-- into a rejected write; the engine ignores whichever limit is irrelevant
-- to the account's current kind (RESEARCH §A6). opening_balance already
-- allows negatives; nothing changes there (D-49).
alter table public.accounts
  add column updated_by uuid references auth.users(id) on delete set null,
  add column overdraft_limit bigint check (overdraft_limit is null or (overdraft_limit >= 0 and overdraft_limit <= 10000000000000)),
  add column credit_limit bigint check (credit_limit is null or (credit_limit >= 0 and credit_limit <= 10000000000000));

-- 3. updated_by stamping (set_updated_by() is defined in the categories
-- migration, earlier in this same wave).
create trigger set_updated_by before update on public.transactions
  for each row execute function public.set_updated_by();
create trigger set_updated_by before update on public.accounts
  for each row execute function public.set_updated_by();

-- 4. A transaction can only reference a category the actor owns, or that
-- the row's creator owns -- so a household member editing another member's
-- row, or the 02-08 materialiser writing a series' rows, keeps the
-- creator's category (Phase 8 adds per-member overrides on top of this).
create or replace function public.guard_transaction_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and (c.owner_id = (select auth.uid()) or c.owner_id = new.created_by)
  ) then
    raise exception 'unknown category' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_transaction_category() from public, anon, authenticated;

create trigger guard_transaction_category
  before insert or update of category_id on public.transactions
  for each row execute function public.guard_transaction_category();

-- 5. Indexes: category lookups, import-batch grouping, the active-rows
-- household/date listing, tombstone housekeeping, and cross-month name
-- search (ACT-03) via a trigram GIN index (unindexed `ilike '%term%'`
-- would force a sequential scan at scale, RESEARCH.md Pitfall 6).
create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;
create index transactions_active_household_date_idx on public.transactions (household_id, local_date desc) where deleted_at is null;
create index transactions_tombstones_idx on public.transactions (deleted_at) where deleted_at is not null;

create extension if not exists pg_trgm with schema extensions;
create index transactions_name_trgm_idx on public.transactions using gin (name extensions.gin_trgm_ops);

-- 6. The client read path. Every client read goes through this view, which
-- hides soft-deleted rows under the caller's own RLS (security_invoker
-- means the view carries no elevated privilege of its own -- RLS on the
-- underlying table still applies). Single-row conflict lookups (undo,
-- version checks) read the table directly so tombstones stay visible to
-- that logic.
create view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
grant select on public.transactions_active to authenticated;

-- 7. Additive column grants. recurring_series_id, occurrence_date and
-- updated_by stay server-only (written by the 02-08 materialiser, 02-09
-- RPCs and the stamping trigger above). raw_amount, raw_balance,
-- external_id and import_format are insert-only so provenance never
-- drifts from the original file (D-45).
grant insert (
  name, category_id, payment_type, status, import_batch_id,
  raw_amount, raw_balance, external_id, import_format, transfer_id
) on public.transactions to authenticated;
grant update (name, category_id, payment_type, status, deleted_at, transfer_id) on public.transactions to authenticated;

grant insert (overdraft_limit, credit_limit) on public.accounts to authenticated;
grant update (overdraft_limit, credit_limit) on public.accounts to authenticated;
