-- pgTAP: corrective migration 20261007000200_currencies_clear_false_end_dates.
--
-- Frankfurter v2 began returning end_date = latest data date for ACTIVE
-- currencies, and fx-sync copied it into currencies.end_date, hiding every
-- currency from the picker (which filters end_date is null). The migration
-- nulls end_date where end_date >= current_date - 30, and leaves genuinely
-- discontinued currencies (older end dates) alone.
--
-- The migration already ran once at db reset against an empty table, so this
-- test seeds rows and re-applies the migration's statement (psql runs in a
-- container, so \i of the migration file is not reachable). Keep the UPDATE
-- below identical to the one in the migration.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into public.currencies (code, name, end_date) values
  ('ZZA', 'Recent today',       current_date),
  ('ZZB', 'Recent yesterday',   current_date - 1),
  ('ZZC', 'Boundary 30 days',   current_date - 30),
  ('ZZD', 'Old 31 days',        current_date - 31),
  ('ZZE', 'Long discontinued',  date '2021-01-01'),
  ('ZZF', 'Active already',     null);

update public.currencies
   set end_date = null
 where end_date >= current_date - 30;

select extensions.is((select end_date from public.currencies where code = 'ZZA'), null, 'end_date = today is cleared');
select extensions.is((select end_date from public.currencies where code = 'ZZB'), null, 'end_date = yesterday is cleared');
select extensions.is((select end_date from public.currencies where code = 'ZZC'), null, 'end_date 30 days old is cleared (boundary)');
select extensions.is((select end_date from public.currencies where code = 'ZZD'), current_date - 31, 'end_date 31 days old is kept');
select extensions.is((select end_date from public.currencies where code = 'ZZE'), date '2021-01-01', 'a long-discontinued end_date is kept');
select extensions.is((select end_date from public.currencies where code = 'ZZF'), null, 'an already-active currency stays null');

-- Idempotent: a second application changes nothing.
update public.currencies
   set end_date = null
 where end_date >= current_date - 30;
select extensions.is((select end_date from public.currencies where code = 'ZZD'), current_date - 31, 'second run keeps the 31-day-old end_date');
select extensions.is((select count(*)::int from public.currencies where code like 'ZZ%' and end_date is null), 4, 'second run leaves exactly the 4 active rows');

select * from extensions.finish();
rollback;
