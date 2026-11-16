# Phase 8 DPIA draft: household sharing (CMP-F21)

**Status:** draft for lawyer sign-off in Phase 11 (Compliance). Not legal advice and not final.
**Written:** 2026-11-16 by plan 08-26, from the Phase 8 code on branch `phase/08-household` (migrations `20261122000100..000900`, pgTAP 100-110).
**Scope:** the household feature: shared lines and accounts, splits, balances and settle-ups, invites and joining, leaving and removal, account deletion, and the Realtime live updates that carry all of it. The read-only household summary link (HH-12) is not built (D-45) and is out of scope until it returns.

---

## 1. Purpose and lawful basis

- **Purpose.** Household record-keeping between people who have chosen to share it: a member marks a line or an account as shared, the app splits it, shows who owes whom, and records settle-ups the two people confirm between themselves.
- **FincWin holds no money.** It moves no money, executes no payments, and offers no loans or advice. A settle-up is a record that two people say they paid each other, nothing more.
- **Lawful basis (proposed, for legal review).** Contract (GDPR Art. 6(1)(b)): sharing is the service the member asks for, and each member joins by redeeming an invite the owner created. Nothing is shared by default: every row a person creates is personal until they share it (D-13), and a person who joins keeps every existing row personal (HH-02).
- **Consent between members.** Each person joins on purpose (typed code or invite link) and can leave at any time, even with an open balance (D-25).

## 2. Data categories

| Category | Examples | Where |
|---|---|---|
| Money records | shared lines (amount, date, note, category, payer), joint accounts and their balance | `transactions`, `accounts`, `recurring_series` |
| Shares | split rule, each member's share, per-member category, category default splits | `transaction_splits`, `transaction_member_categories`, `household_split_defaults` |
| Settle-ups | amount, the two parties, status (waiting, confirmed, lapsed, cancelled), the lines it covered | `settlements`, `settlement_lines`, `settlement_nudges` (server only) |
| Member identity shown to others | display name **or** colour name (member's choice, D-32), colour, role label (up to 24 characters), weight | `household_members` |
| Former members | display name (erased on account deletion), colour, a random key | `household_former_members` |
| Notices | "Sam changed the split", "You're no longer in [household]", settle-up reminders | `household_events`, `household_event_reads` |
| Invites and joining | hashed code, owner who made it, expiry, failed-attempt counter | `household_invites`, `redeem_attempts` |
| Departures | who left or was removed, by whom, the 24-hour undo window | `member_departures` |

Special-category data (Art. 9) is not collected on purpose. Free-text notes on a shared line could contain anything a member types; this is listed as a risk below.

## 3. Who sees what

- **Personal unless shared, enforced in the database.** Row-level security decides visibility on every table; the app never filters on its own. The two-user privacy suite (pgTAP `101_household_privacy_two_user`) proves member B cannot read, update, delete, RPC-read or view-read any of A's personal rows on every household table; `102_household_table_coverage` fails if a new `household_id` table is added without being listed in 101; `103_household_shared_line_guard` proves only the creator (or the named payer) can change a shared line's amount, date and note (D-14).
- **Refused like missing.** A row the caller cannot see answers exactly like a row that does not exist (`not_found`), so members cannot probe for each other's personal records (08-10, 08-11).
- **Settle-ups are pair-private.** Only the two parties see a settle-up; a third member gets `not_found` (108).
- **Names.** `profiles.full_name` and email are never shown to other members. Members see the display name the member chose, or their colour name if they hid it (D-32); every string that names a member goes through one resolver.
- **Decide checks are never shared.** Decide rows stay personal for every member; household data reaches Decide only as "my share" of shared lines.
- **Statement periods** follow their card account's visibility and are not published to Realtime (D-43).

## 4. Invites

- **Code.** 12 symbols, Crockford base 32: 60 bits. Stored as a sha256 hash; the plain code has no client grant and is kept only while the invite is open and only for the owner who made it (nulled on use, expiry, or 24 hours after a cancel).
- **Life.** Owner-only, 7 days, single use, cancellable, at most 6 members counting open invites.
- **Guessing.** Per-user limits: 5 failed attempts in an hour or 20 in a day, then `slow_down` even for a valid code. The counter is written before the call returns, so it persists. At 20 attempts a day the chance of hitting a live code is below 1e-16 (105 asserts it).
- **No global lock-out.** The global failure rate is logged for alerting only (service role reads it; a log line fires at 200 or more failures an hour) and never blocks, so other accounts cannot lock genuine joiners out.
- **Links.** `fincwin://` scheme plus the typed code (D-38). No web landing page, so the code is not exposed to a web server in this phase.

## 5. Realtime

- **Only shared-capable tables are published:** `transactions`, `accounts`, `household_events` (migration 000400), then `settlements`, `settlement_lines`, `household_former_members`, `member_departures` (migration 000900). `pg_publication_tables` is checked by pgTAP `104_household_realtime_publication`.
- **Not published, on purpose:** `households`, `household_members` (membership changes travel as notices, so deletes never broadcast member keys), `statement_periods`, every Decide and Grow table, `transaction_splits` (a split change bumps the published parent line instead), `household_split_defaults` (changes travel as notices), `settlement_nudges` (no client access), `household_invites` (codes).
- **RLS per subscriber.** Insert and update events are filtered by each subscriber's row-level security, with membership read live: the 08-08 two-client spike showed a personal line never reaches the other member, a line made personal stops producing events, and a removed member stops receiving events at once. Realtime also honours column grants, so `household_former_members` and `member_departures` deliver only their granted columns.
- **Deletes carry bare ids.** Delete events bypass RLS and carry primary keys only. Clients soft-delete published rows, so hard deletes come only from the retention purge, cascades and the account-deletion purge; those broadcast bare uuids, never amounts, notes or names.
- **settlement_lines is published** (owner decision 2026-11-16: keep it published). Its cascade deletes broadcast bare settlement and line ids only, with no amounts or names.

## 6. Leaving and removal

- A person who leaves or is removed moves their personal records into a new household of one (D-26). Each shared line they were on becomes a **personal copy** of it in their new household, so their own history stays correct; the household keeps the originals with the split unchanged, so nobody else's balance moves.
- Leaving is allowed with an open balance; the leaver sees what is owed read-only and can say "I paid", which the person who stayed confirms (owner answers 10-11). A waiting settle-up is cancelled at departure and the other person is told.
- **Removal can be undone for 24 hours** by re-inviting (D-28); the reconnect removes the copies and puts the lines back. After 24 hours the departure is final. A removed person sees "You're no longer in [household]".
- The settle-up history and the household's originals stay in the household after departure (they are the other members' records too).

## 7. Erasure (account deletion)

- In-app account deletion actually purges (CMP-F23). It runs through the `delete-account` Edge Function and a `before delete` rule on `auth.users` (migration `20261122000800`, pgTAP `110_household_account_deletion`, plus `36_account_deletion`).
- **Everything personal is erased.**
- **Shared records the person created stay, shown as "Former member"** with their name removed (D-29). Their splits, the payer of their lines and both sides of their settle-ups are stamped with a random key instead of their user id.
- **Balances are preserved.** 110 records every member's balance before the deletion and asserts the same values afterwards.
- Ownership passes to the member who joined earliest, who is told (D-27). A person alone has their whole household deleted. Deletion is never blocked: only data-integrity errors stop it.
- **For legal review:** keeping shared lines the deleted person created is a retention of their data on the ground of the other members' legitimate interest in their own records (Art. 17(3) / Art. 6(1)(f) balance). The name is removed; the amounts, dates and notes on shared lines remain. Notes are free text and may identify the person.

## 8. Retention

| Table | Retention as built |
|---|---|
| `household_events` (notices) | **No purge yet.** Kept for the life of the household; erased with the household. Open item. |
| `redeem_attempts` (failed-code counter) | **No purge yet.** Only the last 24 hours are read for the limit; older rows are never used but are not deleted. Open item. |
| `member_departures` | **No purge yet.** Needed for the 24-hour undo; kept afterwards as the departure record. Open item. |
| `household_invites` | Plain code nulled on use, expiry, or 24 hours after a cancel; the hashed row stays. |
| `household_former_members` | Kept while the household's shared records exist; display name erased on account deletion. |
| Shared lines and settle-ups | Follow the app's existing record retention (soft delete, then the retention purge). |

## 9. Processors

- **Supabase** (database, Auth, Realtime, Edge Functions, Storage), project hosted with Supabase. DPA with Supabase to be confirmed in Phase 11.
- No other processor receives household data. Sentry error reports must not carry row content (to confirm in Phase 11).

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation as built | Residual |
|---|---|---|---|---|
| A member sees another's personal records | Low | High | RLS on every table; 101 two-user suite; 102 coverage meta-test fails on any new unlisted table; refused-like-missing answers | Low |
| Live updates leak personal rows | Low | High | Only shared-capable tables published; RLS per subscriber; spike scenarios b, c, g | Low |
| Delete events leak content | Low | Medium | Deletes carry primary keys only; clients soft-delete; no amounts or names in any delete event | Low (bare ids are visible) |
| Invite code guessed | Very low | High | 60-bit code, hashed at rest, 5/hour and 20/day per user, single use, 7-day expiry | Very low |
| Attacker locks genuine joiners out | Low | Medium | No global brake; global rate only logged for alerting | Low |
| Real name exposed to members | Low | Medium | Display name or colour by member's choice; `profiles` name and email never exposed | Low |
| Deleted person identifiable from shared notes | Medium | Medium | Name removed; notes remain (free text) | Open, legal review |
| Notices and attempt logs kept indefinitely | Certain | Low | None yet | Open, retention item |
| Removed member's data stays with the household | Certain | Low | Personal copies go with them; only shared originals stay; 24-hour undo | Accepted by design (D-26) |
| Stale or forged edits overwrite a member's line | Low | Medium | Version checks name who changed it first; never last-write-wins (D-14) | Low |

## 11. Open items for legal review

1. Lawful basis for keeping a deleted person's shared lines (amounts, dates, free-text notes) as "Former member": legitimate interest of the remaining members, and whether notes should be cleared on deletion.
2. Retention periods for `household_events`, `redeem_attempts` and `member_departures`: none is purged today. Propose periods (for example 90 days for `redeem_attempts`, 24 months for notices).
3. Whether a removed member should be able to ask for the household's copies of shared lines they created to be anonymised before they delete their account.
4. Data portability: the export includes the household tables (export manifest, 08-15); confirm it covers what Art. 20 needs for shared lines created by others.
5. Supabase DPA and hosting region; GDPR as the standard everywhere.
6. Re-check App Store Guideline 3.2.1(viii) wording against the live text (CLAUDE.md caveat); settle-ups are records only.
7. HH-12 summary link (D-45): a new DPIA section is needed when it returns (a web page for people without the app).
