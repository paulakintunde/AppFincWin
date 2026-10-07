# Decision: one undo removes a new entry and its series (2026-10-06)

**Decided by the user.** When someone adds a brand-new transaction with Repeats switched on and taps Undo, one undo removes both the new entry and its series. Before this, the server-recorded step only undid the series and left the entry behind (plan 02-18 dropped `anchorIsNew` because the server would not soft-delete the anchor).

## What changed

Server (migrations edited in place, not pushed; filenames unchanged):
- `20260926000400_recurring_materialisation.sql`: `create_recurring_series(p_series, p_anchor_transaction_id, p_link_transaction_ids, p_undo_step, p_anchor_is_new boolean default false)`. When true, the change set carries `anchor_created {id, version}`, read after the anchor is linked. `p_anchor_is_new` without an anchor is rejected (22023). Grants updated to the new signature. `search_path = ''`, household checks and the replay check are untouched.
- `20260926000500_undo_log.sql`: `series_change_inverse` adds one soft-delete op for `anchor_created` (right after the occurrence deletes, before the series delete) and leaves the anchor out of the unlink ops, so each row has exactly one op. The op uses the standard `expectedVersion` rule: if anyone edited the anchor since, `apply_undo_step` refuses and nothing is deleted. With the flag false, behaviour is unchanged (anchor is unlinked and survives).

Client:
- `src/db/recurringSeries.ts`: `createRecurringSeries` link option `anchorIsNew`; sends `p_anchor_is_new: true` only when true.
- `src/data/mutations/recurringSeries.ts`: `useCreateSeries().create({ anchorIsNew })` forwards it. The undo step id is still minted once and reused on replay.

## Tests
- pgTAP `supabase/tests/database/37_series_undo_anchor.test.sql` (15 tests): undo removes series, occurrences and anchor; edited anchor is refused and nothing is deleted; default false leaves the anchor; a replay of the create is `already-applied`; the flag without an anchor is rejected.
- Jest: new cases in `src/db/__tests__/recurringSeries.test.ts` and `src/data/mutations/__tests__/recurringSeries.test.tsx` (flag sent only when true, step id kept).

## For plan 02-21
Pass `anchorIsNew: true` when Repeats is set on a brand-new entry. Leave it off when an existing entry is made to repeat.
