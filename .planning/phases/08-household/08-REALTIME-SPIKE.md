# 08-08 Realtime spike results

Date: 2026-11-15. Local stack: Supabase CLI 2.117.0, Realtime image v2.130.0, Postgres 17.6.1.167, supabase-js (repo pin).
Harness: `npm run test:realtime` (two real supabase-js clients A and B, A owns the household, B is a member). Published tables confirmed from `pg_publication_tables`: accounts, transactions, household_events only.

Method notes: shared lines are inserted with the service role (the sharing RPCs arrive in 08-10); edits in d and e go through the real `apply_patches` as the signed-in member. In d the line is created by A with `paid_by` = B so B is allowed to edit it and the refusal reaches the version check.

- a. Shared line written by A reaches B within 2000 ms. PASS (steady state 485-522 ms over three runs; cold-start first event 303-631 ms)
- b. Personal line written by A never reaches B within 3000 ms. PASS (A saw its own personal line, so the stream was live)
- c. Shared line made personal: B receives the made_private household_event and no line event after the flip. PASS (0 line events after flip)
- d. B offline mid-edit: refetch on reconnect shows v+1 and A's note; B's queued write at the old version is refused with status conflict, reason changed, updated_by = A; final note is A's. PASS
- e. A's own-write echo arrives with version v+1 and `reconcile` returns drop. PASS
- f. Out-of-order versions [5, 4] leave the cache at 5. PASS
- g. After B is removed from the household, a new shared line is not delivered to B in 3000 ms (0 events). PASS

Findings
- One cold-start failure: the very first run after the stack was restarted missed the 2000 ms window in scenario a (event arrived later). Two later runs, plus a warm-up insert added to `beforeAll`, were clean. The app should treat the first event after SUBSCRIBED as possibly late and refetch on SUBSCRIBED, which is already the rule scenario d uses.
- RLS-authorised delivery works for both flips: a line made personal stops producing events to B, and a removed member stops receiving events at once (membership is read live, no stale grant).
- `apply_patches` refuses a stale write from a non-creator payer with the version conflict naming `updated_by`. A non-payer non-creator would instead be refused earlier with `shared_line_creator_only` (08-05), which is the intended D-14 order.
- The local stack needs auth, kong, rest and realtime running. `supabase start -x studio,imgproxy,vector,edge-runtime,logflare,pgadmin-schema-diff,postgres-meta` brings them up; plain `start` reports a running stack when only db is up.

Decision: reconciler design confirmed. All four cases (no pending write, write still queued, own-write echo, genuine version conflict) behaved as designed with two clients and one offline mid-edit.
