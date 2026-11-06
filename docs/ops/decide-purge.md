# Decide purge job (CMP-F06)

`public.purge_deleted_decide_rows(p_older_than interval default '30 days')` permanently deletes Decide rows that were soft-deleted more than 30 days ago.

- **What it deletes:** soft-deleted rows (`deleted_at` set and older than the cut-off) in `decide_links`, `decide_changes`, `decide_answers` and `decide_checks`, in that order. Live rows are never touched. Grow-owned tables (`debts`, `savings_goals`) are not touched; they belong to a later requirement (CMP-F23).
- **When:** nightly at 03:41 UTC, by the pg_cron job `decide-purge-nightly`.
- **Who can run it:** `service_role` only. It is `security definer` with an empty `search_path`; anon and authenticated cannot execute it.
- **What it returns:** one row per table with the number of rows deleted. Counts only.
- **Undo:** soft delete exists so Undo works. The undo window is far shorter than 30 days, so a purged row can no longer be undone.

## Checking that it ran

```sql
select jobid, status, return_message, start_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'decide-purge-nightly')
 order by start_time desc
 limit 5;
```

Run it by hand (service role only): `select * from public.purge_deleted_decide_rows();`

## Not covered here

The wording of the retention policy shown to people is Phase 11. The data export that includes these tables is Phase 10.
