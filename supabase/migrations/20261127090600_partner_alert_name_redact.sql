-- 10-review L-2 (partner alert keeps the sender's name after account deletion): a partner_large alert stores the sender's
-- household display name in params.who on the OTHER members' alert_log and alert_outbox rows. Those rows belong to the
-- receivers, so they outlive the sender's account and kept naming a deleted person. Now, when an account is deleted,
-- every partner_large row that came from that person is redacted to the "A household member spent ..." form
-- (who = null, hidden = true), in the same transaction as the delete. The outbox copy is redacted too, so an unsent push
-- (queued, or claimed and retried) can never carry the old name: alerts-deliver builds the text from alert_outbox.params.
--
-- The link: ref_table = 'transactions' and ref_id = the line the sender created. This runs BEFORE DELETE, and its name
-- sorts before hh_before_user_delete (BEFORE triggers fire in name order), so the sender's lines are still there to
-- join on before hh_erase_personal_rows removes any of them. A line already gone (hard-deleted earlier) cannot be
-- joined, so as a fallback a partner_large row is also redacted when its receiver shares (or shared) a household with
-- the deleted person and its who equals a name that person carried there. Over-redacting a same-named member only
-- swaps a name for "A household member"; it never exposes anything.

create function public.alerts_redact_partner_on_account_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_redact constant jsonb := jsonb_build_object('who', null, 'hidden', true);
begin
  begin
    with names as (
      select m.household_id, m.display_name from public.household_members m
       where m.user_id = old.id and m.display_name is not null
      union
      select f.household_id, f.display_name from public.household_former_members f
       where f.user_id = old.id and f.display_name is not null
    ), receivers as (
      select m.user_id, n.display_name from names n join public.household_members m on m.household_id = n.household_id
      union
      select f.user_id, n.display_name from names n join public.household_former_members f on f.household_id = n.household_id
       where f.user_id is not null
    ), hits as (
      select l.id from public.alert_log l
       where l.kind = 'partner_large'
         and l.user_id <> old.id
         and l.params ->> 'who' is not null
         and ((l.ref_table = 'transactions'
               and exists (select 1 from public.transactions t where t.id = l.ref_id and t.created_by = old.id))
           or exists (select 1 from receivers r where r.user_id = l.user_id and r.display_name = l.params ->> 'who'))
    ), logs as (
      update public.alert_log l set params = l.params || v_redact
        from hits h where l.id = h.id
      returning l.id
    )
    update public.alert_outbox o set params = o.params || v_redact
      from logs where o.log_id = logs.id;
  exception
    when others then
      -- Never block a deletion (D-20); the name stays on the receivers' rows and the warning shows in the logs.
      raise warning 'alerts_redact_partner_on_account_delete: %, deletion continues', sqlerrm;
  end;
  return old;
end;
$$;
revoke all on function public.alerts_redact_partner_on_account_delete() from public, anon, authenticated;

create trigger alerts_before_user_delete_redact
  before delete on auth.users
  for each row execute function public.alerts_redact_partner_on_account_delete();

-- One-time catch-up for deletions before this migration: transactions.created_by is ON DELETE SET NULL, so a line whose
-- creator is null was written by an account that is now deleted. Redact the partner alerts that point at such a line.
with logs as (
  update public.alert_log l set params = l.params || jsonb_build_object('who', null, 'hidden', true)
   where l.kind = 'partner_large'
     and l.params ->> 'who' is not null
     and l.ref_table = 'transactions'
     and exists (select 1 from public.transactions t where t.id = l.ref_id and t.created_by is null)
  returning l.id
)
update public.alert_outbox o set params = o.params || jsonb_build_object('who', null, 'hidden', true)
  from logs where o.log_id = logs.id;
