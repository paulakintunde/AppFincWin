-- 10-30 (ALR-05; device check step 10): no alert_prefs save ever reached the server. The app saves with PostgREST
-- upsert, which sends INSERT ... ON CONFLICT (user_id) DO UPDATE SET user_id = excluded.user_id, ...; Postgres checks
-- UPDATE on every SET column at plan time, and user_id had INSERT but not UPDATE, so every save failed with 42501
-- ("permission denied for table alert_prefs"). Seen live: quiet hours could not be switched off, the time zone stayed
-- UTC, and a partner alert was held under the 22:00-07:00 UTC defaults. alert_settings has full grants and was fine.
-- Safe: alert_prefs_own_update checks user_id = auth.uid() in both USING and WITH CHECK, so a row can only ever be
-- "set" to its own owner. last_digest_date stays server-only.
grant update (user_id) on public.alert_prefs to authenticated;
