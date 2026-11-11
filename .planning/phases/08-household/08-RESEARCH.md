# Phase 8: Household - Research

**Researched:** 2026-11-10
**Domain:** Supabase Postgres RLS (personal vs shared rows), invite/redeem RPCs, Realtime reconciliation, split/settlement maths, account-deletion rule
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; Realtime reconciler and web invite hosting MEDIUM, spike required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 Joining moves the joiner's accounts and records into the new household; they stay personal. Joining never flips old records to shared.
D-02 Invites valid 7 days; owner can cancel; expiry enforced on the server.
D-03 One person per invite; once used it is dead.
D-04 A valid invite joins at once, no approval step; owner gets a notice and can remove.
D-05 Only the owner can send invites.
D-06 Someone in a household with other members must leave it first; a household-of-one joins freely.
D-07 Link without app installed shows a small web page (inviter, household name, App Store/Play buttons, the code). After install and sign-in the app asks for the code. Token and code long enough not to guess; redemption rate-limited (HH-15). Code length, token format, rate-limit numbers are Claude's discretion; follow ARCHITECTURE.md `redeem_invite` (security definer, `select ... for update`, empty `search_path`).
D-08 Members keep their own home currency for personal figures. Shared totals and settle-ups use the household currency (owner sets). Each settlement stores its FX rate.
D-09 After joining, one "what's shared" card, then into the app.
D-10 Max 6 members; 7th invite refused with a plain message.
D-11 Household has a name, default "[Owner first name]'s household", owner can rename.
D-12 Everything built for everyone; Pro locks wait for Phase 9, with one switch per feature (weight/amount splits, category defaults, summary link).
D-13 A record becomes shared via a "Shared" switch on a line, or via a Joint account whose new lines start shared and whose balance members see. Category default split rules apply once a line is shared. Categories do not auto-share lines. Bulk share is an explicit action showing a count.
D-14 Only creator and named payer (D-18) change amount, date, note. Any member changes the split or their own category. Every change named and undoable. Version checks refuse stale writes and name who changed what. Never last-write-wins.
D-15 Only the creator can make a shared line personal again, and only if no settle-up covers it. Others see "Paul made a line private".
D-16 Sharing one line of a repeating series asks "Share every month of this bill?". Yes shares this line and all future lines.
D-17 Shared lines paid from a Joint account count toward each person's share but create no owing. Owing comes only from shared lines one person paid from personal money. Top-ups not tracked.
D-18 Shared line has "Paid by", defaults to logger. Named payer sees "logged by Paul" and can edit the amount.
D-19 Settle-up started by payer is pending until receiver confirms ("Got it / Not yet"). On "Got it" lines lock and record appears both sides. Money owed to you not spendable until it arrives.
D-20 No answer: reminder at day 7, lapses at day 14; lines unlock, balance owed again, both told. Nothing settles silently.
D-21 Settle-up covers chosen lines (all unsettled start ticked). Amount is exactly the ticked lines. No free-amount part payments.
D-22 Settle-ups move account balances (payer picks source account, receiver picks destination on confirm). Settlement is neither spending nor income; one "is settlement" rule excludes it everywhere.
D-23 3+ people: balances per pair, no debt simplification.
D-24 Receiver can start a settle-up; it settles at once, payer told. Receiver can send an "Ask Sam to settle up" nudge.
D-25 Leaving with open balance allowed after a warning; balance stays both sides as "Sam (left)"; either can settle or write it off later.
D-26 Leaver/removed person's personal records move into a new household-of-one. Each shared line they were on becomes a personal copy of their share. Household keeps originals with split unchanged.
D-27 Owner leaving picks the new owner. Owner deleting their account: ownership passes automatically to the member who joined earliest, who is told. Deletion never blocked.
D-28 Removed member sees "You're no longer in [household]"; data handled as D-26. Removal can be undone for 24 hours by re-inviting, with lines reconnected.
D-29 (CMP-F23) On account deletion shared records the person created stay, attributed to "Former member". Everything personal is erased; remaining balances stay correct.
D-30 Weights are percentages summing to 100, rebalanced on change. 0% allowed; at least one member above 0. Schema `weight > 0` must allow 0; the all-zero guard from 04 D-15 stays.
D-31 Roles are labels only (Partner, Flatmate, Family, Housemate, Lodger, Owner, custom free text up to 24 chars). Default Flatmate. Only Owner carries powers (invite, remove, rename, household currency). `role in ('owner','member')` check changes to an owner flag plus a role label.
D-32 Each member decides whether others see their name or colour name. Default first name from sign-in in `household_members.display_name`. `profiles.full_name` and email never exposed. One resolver for every string naming a member, Decide included.
D-33 Next free colour of six (Green, Rust, Slate, Ochre, Plum, Teal); can swap to another free one.
D-34 Any member changes weights, household split rule, category defaults. Everyone told; undoable.
D-35 Weight/rule changes apply to new lines only. Each line stores the split it had when logged. Offer "Also apply to the N unsettled lines". Settled lines never change.
D-36 Safety net: each person has their own; a couple can mark one net shared.
D-37 Partner hasn't logged shared bills: Decide still answers with a named caveat; never a "not enough data" block. A normal month = your records + your share of shared lines.
Carried forward (locked): partner's money counts in Decide only with partner opt-in, off by default, one rounded total only. Decide checks never shared. Two partners' "Fits" on shared money never sum to more than the shared money. Split rules are the one source of "my share" (ARC-17); `decide_settings` share column moves to its owner and is removed. One income profile per member (ARC-19). Share setup step becomes Household's "Who do you share money with?" (ARC-20). Summary link leaves out Decide data and personal rows. UX-21 couples note, FIN-14, APP-08 steps 3-4, APP-22, CMP-F04, CMP-F21 DPIA draft are in this phase.
First wave, blocking: every record personal unless marked shared, enforced by the database, including `debts` and `statement_periods` household-wide read rule. Two-user tests green BEFORE the invite flow (HH-01) merges (CMP-F18, ARC-22).

### Claude's Discretion
Invite code/token length, character set, rate-limit thresholds (must make guessing futile, proven by pgTAP or edge test). Realtime reconciler design + required two-client spike with one client offline mid-edit. Split rounding (largest remainder, ties by join order, property test). Notification delivery (in-app minimum). Data model for joint accounts, paid-by, per-line stored split, pending settlements, "former member" attribution. Summary-link details beyond prototype (24h/7d/30d chips, default 7d, "Show what each line was for" toggle, read-only page).

### Deferred Ideas (OUT OF SCOPE)
Pro locks (Phase 9). Multiple households per person (HHX-01), per-account sharing levels (HHX-02). Top-up balancing for joint accounts. Debt simplification across 3+. Role-based permissions.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HH-01 | Invite with expiring link and code | `household_invites` + `create_invite`/`redeem_invite` RPCs; code/token design; web landing page hosting (Open Q1) |
| HH-02 | Joiner sees only that household's shared records | Personal/shared RLS rewrite (wave 1); D-01 move-in RPC; two-user pgTAP |
| HH-03 | Colour, role, weight, custom role | `household_members` schema changes (weight 0 allowed, `is_owner` + `role_label`, `colour_key`) |
| HH-04 | Mark transaction shared, split by active rule | `is_shared`, `paid_by`, `transaction_splits` table, extend `engine/split` |
| HH-05 | Household split rule: even / weight / amount / mine only | Pure `engine/split` rules + stored per-line split |
| HH-06 | Default rule per category | `household_category_rules` (household-scoped), applies at share time |
| HH-07 | Who owes / is owed | Per-pair balance engine function over splits, excludes joint-paid and settled lines |
| HH-08 | Settle up, matching record on other side | `settlements` + `settlement_lines`, confirm RPC, two settlement transactions, lapse job |
| HH-09 | Own vs household figures toggle | Selector over `transaction_splits` (my share) vs shared totals; client state |
| HH-10 | Hide real names, colour fallback | `household_members.display_name` + `name_hidden`; single `memberLabel` resolver; no profiles exposure |
| HH-11 | Shared record appears live on another device | Realtime `postgres_changes` on shared tables + reconciler + refetch-on-resubscribe |
| HH-12 | Read-only summary link that expires | `household_summary_links` + anon-callable aggregate RPC/edge function |
| HH-13 | Leave / remove / transfer ownership | Owner-only RPCs; D-26 re-homing; `households.owner_id` FK pitfall |
| HH-14 | Deletion rule | `before delete on auth.users` hook + ownership handoff + Former member attribution |
| HH-15 | Invite guessing futile, rate-limited | 60-bit code, hashed at rest, persisted failure counter (no raise-rollback trap) |
</phase_requirements>

## Summary

The codebase is ready for this phase in structure but not in policy. Every money table carries `household_id` and RLS is `household_id in (select user_household_ids())` (33 migrations reference it), so today any member of a household can read and write every row. `household_members` has no insert/update/delete grants at all (`revoke insert, update, delete` in `20260922000100`), so every membership change must be a security-definer RPC. Decide tables (`decide_checks`, `decide_links`, `decide_changes`, `savings_goals`, `decide_answers`) are already owner-private via `created_by = auth.uid()`, which is the pattern to extend. `debts` ("household debts", `for all`), `statement_periods`, `recurring_dismissals`, `income_payer_prompts`, `transactions`, `accounts`, `recurring_series` and the `transactions_active` / `statement_periods_live` views are the household-wide ones that must change in wave 1. There is **no Realtime code in `src/`** (grep for `postgres_changes` / `.channel(` finds nothing in app code) and no table is in the `supabase_realtime` publication, so HH-11 is greenfield. There is **no account-deletion edge function or RPC in the repo**; deletion today is only the FK cascade proven by pgTAP 36.

Two structural traps dominate planning. (1) `households.owner_id references auth.users on delete cascade`: deleting the owner's auth user cascades away the whole household and every other member's shared data, which breaks D-27/D-29, so a `before delete on auth.users` handoff must run first. (2) The Realtime reconciler as specified in ARCHITECTURE.md Pattern 4 can be simplified: the server's version-checked write (`apply_patches` expectedVersion, existing `versionChain.ts`, `failedWrites.ts`) already decides genuine conflicts; the reconciler only needs to decide whether to apply, ignore or drop an incoming event, keyed on `version`, plus a mandatory refetch after any resubscribe because Realtime does not replay missed events.

**Primary recommendation:** Wave 1 = one migration adding `is_shared` (plus `owner` semantics via `created_by`) to every money table and rewriting policies/views/RPCs to `(created_by = auth.uid() OR is_shared)`, with a two-user pgTAP suite that includes Realtime/export/view/RPC paths, gated as a required CI check before any invite code merges. Everything after builds on `security definer` RPCs (empty `search_path`) for every membership and settlement transition; Realtime is `postgres_changes` filtered by `household_id` on shared tables only, with a pure reconciler tested by fast-check and a two-client spike.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Personal vs shared visibility | Database (RLS) | — | CMP-F18/ARC-22: DB must enforce; client filters are cosmetic |
| Invite create/redeem/rate limit | Database (RPC) | Web landing page | Race + expiry + throttle must be transactional server-side |
| Split maths (rules, rounding, my share) | `engine/` (pure) | DB stores result | Property-tested; DB stores per-line result so history is stable (D-35) |
| Per-pair balances, countsForMe, settlement exclusion | `engine/` | Selector in `data/` | One "is settlement" rule shared by Decide and Activity |
| Settlement state machine (pending/confirm/lapse) | Database (RPC + cron) | Client shows | Lines lock and two records created atomically; lapse must not depend on a device being open |
| Live sync | Supabase Realtime | `data/realtime` reconciler | RLS filters events per subscriber |
| Member name resolution | Client resolver (one fn) | DB `display_name` | Real names never leave DB (no profiles policy for others) |
| Summary link | Database (anon RPC) or Edge Function | Static web page | Token-gated aggregate only |
| Deletion / leave / transfer | Database (RPC + auth.users trigger) | — | Must be atomic and cannot be blocked |
| Notices ("Sam joined") | Database `household_events` table | In-app list; push later (Phase 10) | Doubles as Realtime delivery channel |

## Standard Stack

No new runtime dependency is needed. Reuse what is installed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.117.0 installed [VERIFIED: package.json] | RPC calls, Realtime channels | Already the data layer |
| `@tanstack/react-query` + persister | installed | Cache, paused-mutation write queue | Existing queue; reconciler patches this cache |
| `fast-check` | ^4.10.2 [VERIFIED: package.json] | Property tests for split sums, reconciler | Already used in `engine/` |
| pgTAP via `supabase test db` | CLI 2.117.0 pinned in package.json; CI runs `supabase db start` + `supabase test db` [VERIFIED: ci.yml] | Two-user RLS tests | 88 existing test files; next free number is 89 |
| `pg_cron` | in use (`cron.schedule` in 5 migrations) [VERIFIED] | Settlement reminder (day 7) and lapse (day 14), invite expiry sweep | Existing pattern (`decide_purge_job`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `expo-linking` (SDK-locked) | check `npx expo install` | Parse `fincwin://` / https invite links, pass token to redeem screen | HH-01 deep link. App scheme is `fincwin` [VERIFIED: app.config.ts] |
| `expo-clipboard` (optional) | SDK-locked | "Copy code" on invite screen | Only if not already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `postgres_changes` | Broadcast from trigger via `realtime.broadcast_changes()` + private channels | Docs recommend Broadcast above ~3,000 concurrent subscribers on the same changes [CITED: supabase.com/docs/guides/realtime/postgres-changes]; irrelevant at 6 members/household. STACK.md already says "postgres_changes at launch". |
| Debt simplification | per-pair balances | Locked D-23 |

**Installation:** none beyond `npx expo install expo-linking` if absent. [ASSUMED: not checked whether expo-linking is already a dependency; planner to grep package.json.]

## Architecture Patterns

### System Architecture Diagram

```
Invitee taps link
   |-- app installed --> expo-linking -> RedeemScreen(token)
   |-- not installed --> web landing page (anon lookup RPC: inviter first name + household name + code)
                          -> store -> install -> sign-in -> RedeemScreen asks for code
RedeemScreen --supabase.rpc('redeem_invite', {code|token})--> [security definer, search_path='']
      1. rate-limit check (redeem_attempts, persisted even on failure)
      2. select ... for update invite; expiry/used/cancelled
      3. lock households row; count members <= 5
      4. caller must be in household-of-one (else 'in_other_household')
      5. move caller's rows into target household (D-01), colour, display_name, event row
      6. delete caller's empty household-of-one
      7. mark invite used

Writes (client)  --> mutation (optimistic, TanStack cache) --> paused queue --> apply_patches / RPC
                                                                 |
                      Postgres (RLS: created_by = me OR is_shared; version trigger)
                                                                 |
                 Realtime postgres_changes (filter household_id=eq.H, RLS checked per subscriber)
                                                                 |
          data/realtime reconciler: drop(echo/stale) | apply | hold(pending local) -> cache patch
          on (re)SUBSCRIBED or app foreground: invalidate shared queries (events are not replayed)

Settle up: payer proposes -> settlements(pending)+settlement_lines (lines locked)
   receiver 'Got it' -> confirm_settlement(): 2 settlement transactions (is_settlement) on chosen accounts
   cron day 7 -> reminder event; day 14 -> lapse: lines unlocked, event to both
Leave/remove/delete -> RPCs re-home personal rows, write personal copies of share (D-26), former-member attribution
```

### Recommended Project Structure
```
supabase/migrations/2026111x_household_privacy_wave1.sql   # is_shared, policies, views, RPC rewrites
supabase/migrations/..._household_members_v2.sql            # weight 0, owner flag, role label, colour, name_hidden
supabase/migrations/..._household_invites.sql               # invites, attempts, create/redeem/cancel/lookup RPCs
supabase/migrations/..._household_splits.sql                # transaction_splits, paid_by, category defaults, rules
supabase/migrations/..._household_settlements.sql           # settlements, lines, RPCs, cron
supabase/migrations/..._household_leave_remove_delete.sql   # leave/remove/transfer, auth.users before-delete hook
supabase/migrations/..._household_realtime.sql              # publication + replica identity + household_events
supabase/tests/database/89_*.test.sql ...                   # two-user pgTAP
src/engine/split/        # extend allocate.ts: rules even|weight|amount|mine, zero weights
src/engine/household/    # balances (per pair), mySharePicture, countsForMe, memberLabel (pure)
src/data/realtime/       # channel manager, reconcile.ts (pure), resubscribe refetch
src/db/household*.ts     # access functions (extend existing household.ts)
src/features/household/  # screens per 08-UI-SPEC
```

### Pattern 1: Personal-unless-shared RLS (wave 1, blocking)
**What:** Add `is_shared boolean not null default false` to `transactions`, `accounts` (joint = `is_shared`), `recurring_series`, `debts`, `recurring_dismissals`, `income_payer_prompts`, `category_rules` (already has `scope personal|shared`, reuse), and treat `created_by` as the owner. Replace each select policy with `household_id in (select user_household_ids()) and (is_shared or created_by = (select auth.uid()))`. Update/insert policies: insert requires `created_by = auth.uid()`; update on a shared row allowed to any member only for the columns D-14 permits, through `apply_patches`/RPC rather than raw table grants.
**Rows that cannot be matched to an owner:** `created_by` is nullable with `on delete set null`. After erasure a personal row with null owner is already deleted (D-29), so the policy never needs to expose null-owner personal rows. Keep `created_by is not distinct from` out of the policy.
**Derived data:** `statement_periods` has no creator; derive visibility from its account (`exists (select 1 from accounts a where a.id = account_id and (a.is_shared or a.created_by = auth.uid()))`) or add `created_by`. `transactions_active` and `statement_periods_live` are `security_invoker` views [VERIFIED: migration comments] so they inherit the table policies; re-check each `create or replace view` keeps `security_invoker = true`.
**Hidden bypass surfaces to test explicitly:** every `security definer` RPC from `record_read_rpcs`, `entry_list`, `add_activity_month`, `apply_patches` (reads `to_jsonb(t)` of any id and checks household only, see line ~107/214/235 of `20261028001100_apply_patches_v3.sql`: member B could patch or read the version/`record_name` refusal payload of A's personal transaction id), `undo_log`, sample data, export manifest. Patch refusal payloads that echo another user's `record_name` are a leak.
**Entities allow-list in `apply_patches`:** new patchable columns (`is_shared`, `paid_by`) must be added to the allow-list with the creator-only rules (D-14/D-15).

### Pattern 2: Membership changes only via security-definer RPCs
Because `household_members` has no write grants, add RPCs: `create_invite`, `cancel_invite`, `redeem_invite`, `leave_household`, `remove_member`, `undo_remove_member`, `transfer_ownership`, `update_member` (own colour/role label/display_name/name_hidden; weights), `rename_household`, `set_household_currency`. Each: `security definer`, `set search_path = ''`, fully qualified names, `revoke execute from public, anon`, `grant execute to authenticated`. Existing precedent: `handle_new_user` revokes everything and the pgTAP checks it. Owner-only checks read `household_members.is_owner` (new) not `households.owner_id` alone; keep both in sync inside the transfer RPC.

### Pattern 3: Invite design (HH-01, HH-15, D-02/03/05/10)
- `household_invites(id, household_id, created_by, token_hash, code_hash, expires_at default now()+7 days, used_at, used_by, cancelled_at)`. Store **hashes only** (sha256) so a DB read never yields a usable code.
- Token: 128-bit random (`gen_random_bytes(16)`, base64url, 22 chars) in the link. Code: 12 chars from Crockford base32 minus ambiguous characters (about 60 bits) shown grouped `XXXX-XXXX-XXXX`. [ASSUMED: exact numbers; planner may confirm with owner. At 60 bits plus a throttle, brute force is infeasible: 5 failures/hour/user gives about 2^-55 success per hour per account.]
- Throttle: `redeem_attempts(user_id, at, ok)`; refuse when more than 5 failures in 1 hour or 20 in 24 hours for that user, plus a global ceiling (e.g. more than 200 failures/hour overall flips a "slow mode") because an attacker can create many accounts. Return `jsonb {ok:false, reason}` for failures instead of `raise exception`. **Trap:** raising inside the RPC rolls back the attempt insert, so failures would never count. Model on the existing `fx_resolve_calls` / pgTAP 22 pattern [VERIFIED: file list].
- `redeem_invite`: `select ... for update` on the invite, expiry/used/cancelled checks use `now()` server time, then `select ... for update` on the household row and count members (race on the 6th seat), refuse with `reason='full'`, `'in_other_household'` (caller has a household with more than one member), `'expired'`, `'used'`. Return only generic `'invalid'` for unknown codes to avoid oracle leakage. Same user redeeming twice is idempotent-safe.
- Invalidate expired invites lazily (check `expires_at > now()` in every read) and by an optional cron cleanup. Never rely on cron for correctness (PITFALLS: expiry server-side).
- D-01 move-in: inside `redeem_invite`, `update ... set household_id = target` for every table where `created_by = caller` (accounts, transactions, recurring_series, debts, savings_goals, decide_* tables, dismissals, prompts, statement_periods via accounts, undo_log if household-keyed), then delete the empty household-of-one. Triggers that forbid `household_id` changes (decide_tables.sql line 60/194 set `new.household_id := old.household_id`) will block this: the RPC must set a transaction-local flag (pattern already used: `allow_system_keys` in apply_patches) or the triggers must be amended. Keep all rows personal (`is_shared` stays false). Check FK/RESTRICT diamonds (pgTAP 36 comments say accounts<->transactions<->series are RESTRICT) by moving in dependency-safe single statements per table inside one transaction; `deferrable` constraints exist for transfer pairs.
- Landing page public lookup: anon-callable `invite_preview(token)` returning only `{inviter_first_name, household_name, expired}`, throttled by IP bucket if available (`request.headers`), no member list.

### Pattern 4: Split storage (HH-04, HH-05, HH-06, D-17, D-18, D-35)
- `transactions` gains `is_shared`, `paid_by uuid` (defaults to creator), `paid_from_joint` derived from `accounts.is_shared`.
- `transaction_splits(transaction_id, user_id, share bigint, rule text, weight_snapshot int, household_amount bigint)` written in the same transaction as the share/edit via RPC `share_transaction(id, rule, overrides)`. Shares are computed client-side by pure `allocate` and **re-verified server-side** (sum of shares = household amount; trigger). Do not recompute from current weights on read: D-35 requires each line to keep the split it had.
- Zero weights: `allocate` currently throws on weight <= 0 (`allocate.ts`). Change to allow 0 with at least one positive (D-30). A zero-weight member gets share 0 and is skipped in the remainder distribution. Property tests: sum equals total; no negative share; deterministic; zero-weight member always 0; join-order tie-break. Existing 04 D-15 guard for the all-zero case stays.
- Largest remainder with BigInt is already implemented and ties are broken by index, which equals join order if callers pass weights in `household_members.created_at` order (document and test).
- Rules: even (equal weights), weight, amount (explicit per-member minor-unit amounts that must sum to total, "mine only" = 100% to payer's counterpart-free: the payer owes nobody). Amount rule validated pure in engine, mirrored by a DB check trigger (follow `07_money_rounding_mirror` pattern).
- Cross-currency: shares are in the household currency using the line's stamped `home_amount`/FX already stamped per transaction; personal figures use each member's home currency via the existing FX stamping. A member's personal-currency view of a shared line is derived, not stored. Settlement stores its own FX rate (D-08). [ASSUMED: shared totals computed from `original_amount` converted to household currency at the line's stamped rate; confirm the stamped columns cover a household currency different from the logger's `home_currency`. This is the least-verified area: transactions are stamped only with the logger's home currency (`home_currency`, `home_amount`), so a household currency differing from the logger's needs either an extra stamped column or an on-demand conversion at share time. Planner must decide; recommend stamping `household_amount` at share time via the existing on-demand stamping function.]
- Category default rule (HH-06): `household_category_rules(household_id, category_id, rule, version)`; any member writable via RPC; applied client-side when the switch is turned on; stored in the line afterwards.

### Pattern 5: Settlement state machine (HH-08, D-19..D-24, success-criterion decision on lapse)
- `settlements(id, household_id, payer_id, receiver_id, amount, currency, fx_rate, status in ('pending','confirmed','lapsed','cancelled','rejected'), created_by, created_at, remind_at = created_at+7d, expires_at = created_at+14d, payer_account_id, receiver_account_id, resolved_at)`.
- `settlement_lines(settlement_id, transaction_id)` with a partial unique index `where status in ('pending','confirmed')` (via denormalised status column or trigger) so a line is in at most one live settlement; a trigger refuses edits to amount/date/split of locked lines (D-19) and refuses D-15 make-private.
- `confirm_settlement(id, receiver_account_id)`: receiver only, `for update`; creates two transactions flagged `is_settlement = true` (one out on payer account, one in on receiver account) in one transaction, status `confirmed`. `is_settlement` excluded from spending, income, category caps, Decide history, countsForMe, export "spend" figures (ARC-18); it still moves account balances (D-22).
- Lapse (the open research question, answered by D-20): cron every hour flips pending past `expires_at` to `lapsed`, unlocks lines (by status), inserts events to both. Also compute **effective status lazily** in the read RPC (`status = 'pending' and now() > expires_at` => lapsed) so a down cron never leaves a settle-up stuck. Confirm after lapse is refused with `reason='lapsed'`; the payer may start a fresh one. Reminder at day 7 is an event (in-app, push when Phase 10 exists). Idempotent job (re-running makes no duplicate events: unique `(settlement_id, kind)` on events).
- Receiver-initiated (D-24): same RPC with `status` straight to `confirmed` because receiver is confirmer; payer gets event.
- Money owed not spendable (ENG-25): engine function `owedToMe` returns a separate figure, never added to `free`/available; unit-tested in `engine/household`.
- Undo: Pattern 5 of ARCHITECTURE.md lists create/cancel settlement as bounded inverse work. Settlement confirm is not undoable by compensating write once the other side has acted; limit undo to cancel-before-confirm. [ASSUMED]

### Pattern 6: Realtime reconciliation (HH-11) and the required spike
Facts [CITED: supabase.com/docs/guides/realtime/postgres-changes]: each event is authorised against every subscriber's RLS (personal rows are not delivered to other members, provided the policy is correct); **DELETE events bypass RLS** and carry only the primary key (filters on DELETE need `replica identity full`); the table must be in the `supabase_realtime` publication; throughput with RLS is about 1 to 8 messages/client/second; one filter, AND-only, `eq` supported.
Consequences for the design:
1. Publication: add only shared-capable tables: `transactions`, `accounts`, `transaction_splits`, `settlements`, `settlement_lines`, `household_members`, `household_events`, `household_category_rules`. Never add Decide tables.
2. **No hard deletes on published tables** (use `deleted_at`, already the convention); a hard delete leaks the id to every subscriber of the filter. Retention purge job (`record-tombstone-purge-daily`) hard-deletes tombstones: acceptable (ids only), document it in the DPIA.
3. **Shared -> personal flip (D-15) is invisible to other members**: the updated row now fails RLS so no event is delivered and the remote cache keeps a stale shared copy. Write a `household_events` row (`kind='made_private', ref_id`) in the same RPC; clients drop that id from the shared cache when the event arrives. This also delivers the "Paul made a line private" notice.
4. Realtime does not replay events missed while disconnected or offline. On every `SUBSCRIBED` transition, on app foreground, and on `onlineManager` online, `invalidateQueries` for shared keys. This is the single most important correctness rule.
5. Reconciler (pure function `reconcile(event, cacheRow, pendingOp, lastWrittenVersions)` in `src/data/realtime/reconcile.ts`, keyed on `version` only, never arrival order):
   - event.version <= cacheRow.version -> **drop** (own-write echo or stale/out-of-order; covers case 3 without needing opId).
   - pendingOp exists for the row (paused/queued mutation) -> **hold**: record `remoteVersion = event.version` in a side map, do not touch the optimistic row; when the queued write flushes against the old expectedVersion the server rejects it (`version` check), which flows into the existing `failedWrites` conflict path naming who changed it (D-14, 02 D-26). Case 2 and case 4 collapse into one.
   - otherwise (no pending, event.version > cache.version) -> **apply** via `setQueryData`/row patch.
   - `versionChain.ts` is in-memory only; the echo rule above does not depend on it, so an app kill does not break reconciliation.
   - Also reject events whose `household_id` differs from the active household (stale channel after leave/remove).
6. Channel lifecycle: subscribe in an effect keyed on household id; `removeChannel` in cleanup (STACK.md gotcha); resubscribe after token refresh; unsubscribe and wipe shared cache on leave/remove/sign-out (hook into `registerWipeHandler` in `services/storage/wipe`).
7. **Spike (blocking, wave 0 of the realtime plan):** two real `supabase-js` clients (user A, user B) against `supabase db start` locally (Docker 29.7.2 is available here [VERIFIED]; CI already starts the stack). Script scenarios as a Jest integration test file (separate config, not in the default `jest` run, e.g. `npm run test:realtime`): (a) A inserts shared, B receives within 2s; (b) A inserts personal, B receives nothing; (c) A flips shared->personal, B gets the `made_private` event; (d) B goes offline mid-edit (disconnect socket and make the write fail), A edits meanwhile, B reconnects: assert B refetches, B's queued write is rejected with a conflict naming A, neither side silently overwritten; (e) own-write echo does not flash a conflict; (f) out-of-order events (inject version 5 before 4) never regress the cache; (g) B changes household membership (removed) and stops receiving. Pair with fast-check on `reconcile` (random event orders never yield cache version going backwards). Pass criteria written in the plan.

### Pattern 7: Leave / remove / transfer / delete (HH-13, HH-14, D-25..D-29)
- `leave_household()`: if caller is owner and others remain, requires `new_owner_id` argument. Creates a new `households` row (household-of-one) for the leaver, moves their `created_by` rows (personal) there, writes **personal copies of their share** for each shared line they were on (insert transactions in the new household with `created_by = leaver`, amount = their stored share, `is_shared=false`, link `copied_from`), leaves originals and splits intact, keeps open balances as rows with a `left_at` marker so the UI renders "Sam (left)". Remove = same with owner as actor; `removed_at` retained 24 hours so `undo_remove_member` can reconnect (D-28): keep a `member_departures` table with the copy ids for 24h (cron purge). Reconnecting must delete the personal copies to avoid double counting. [ASSUMED: re-invite path reuses `redeem_invite` with a `departure_id` tag; planner to confirm.]
- Personal copies must not double count in any Decide/figure: copy carries a `copied_from_shared` marker; the leaver's shared-line share is no longer in the household after they leave (no longer a member), so there is no overlap.
- **Account deletion:** no delete RPC/edge function exists in the repo [VERIFIED: grep]. Phase 10 (privacy) likely owns the UI, but the DB rule belongs here. Implement `before delete on auth.users` trigger (security definer): if the user owns a household with other members, set `households.owner_id`/`is_owner` to the earliest-joined remaining member (by `household_members.created_at`), write a `household_events` notice, move the leaving user's membership out first; otherwise let the existing cascade run. Without this, `households.owner_id ... on delete cascade` deletes everyone's shared data. Shared records created by the user stay with `created_by = null` (already `on delete set null` on accounts, transactions, recurring_series, debts) and the UI maps null `created_by` + a shared row to "Former member". Personal rows of the deleted user: delete them explicitly in the trigger (they would otherwise remain with null owner and be invisible but still stored, which fails erasure). Settlements involving a deleted user: keep rows with `payer_id/receiver_id` null so counterpart balances remain correct and show "Former member"; their `transaction_splits` rows keep `user_id` null plus a stable `former_member_key`. Add pgTAP: balances of remaining members unchanged before/after, no personal row survives, `auth.users` delete never blocked, owner handoff notice exists. Extend pgTAP 36 for the new FKs.
- Decide tables are `created_by ... on delete cascade` and owner-private, so they erase with the user already [VERIFIED: decide_tables.sql].

### Pattern 8: Summary link (HH-12)
`household_summary_links(id, household_id, created_by, token_hash, expires_at, show_line_labels, revoked_at)`. Served by an anon-callable `security definer` RPC `household_summary(token)` (or an Edge Function) that returns aggregates only from `is_shared = true` rows and `is_settlement = false`: month totals, per-category totals, member shares labelled through the same name resolver, and optionally line labels. It must never join `decide_*` or personal rows, and returns identical "invalid or expired" for all failures. Token 128-bit, 24h/7d/30d chips, default 7d. Revocation on leave/ownership transfer by the owner. The web page is static HTML calling the RPC with the anon key. [ASSUMED: aggregate in SQL is acceptable since it only sums integers; any rounding must reuse the pgTAP money mirror.]

### Pattern 9: Decide connection point (BO-07 point 6)
Phase 8 depends on 05.5's `countsForMe` and BO-07 contract tests, **neither exists in `src/` or on this branch** (grep found no `countsForMe`; `.planning/phases/05.5-one-shared-money-model/` is empty). Plan around it: 08 plans must start with a gate task "confirm 05.5 landed; if not, stop". Meanwhile engine work in `src/engine/household/` can define the pure `mySharePicture(splits, userId)` and `countsForMe(tx, userId)` shapes behind an interface that 05.5 fills; do not invent a second rule. Remove `decide_settings.share_pct` (migration `20261028000100`, "100 = Just me, 1..99 = my share") in the same phase once the splits are the source: a migration dropping the column, with the safe order add-new-source -> switch reads -> drop; account for `decide_settings` select lists in `20261028000100` lines 68/73 and `apply_patches` allow-list line 184. Opt-in partner money: `decide_partner_optins(owner_id, partner_id, enabled default false)`; Decide receives a single rounded total from an RPC that checks both the opt-in and shared status, never row-level partner data. "Fits can never sum above the shared money" is an engine invariant over the two partners' answers; property-test it in `engine/decide`.

### Anti-Patterns to Avoid
- **Filtering personal rows in the client** (or by `eq('created_by', me)` queries) as the privacy mechanism: RLS must do it; the client query is untrusted.
- **Raising an exception in `redeem_invite` to signal failure** (rolls back the rate-limit counter).
- **Using `profiles.full_name`/email in any joined query** for other members. Add a pgTAP assertion that B selecting A's `profiles` row returns zero rows (policy exists as "users read own profile" [VERIFIED]).
- **Recomputing past splits from current weights** (violates D-35).
- **Hard deleting published rows** (DELETE events bypass RLS).
- **Trusting cron for expiry** of invites/settlements.
- **A second "my share" rule** in Decide or Activity (ARC-17). All reads go through the one engine function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Split rounding | New allocator | Extend existing `engine/split/allocate.ts` (BigInt largest remainder) | Already tested; only change is allowing 0 weights |
| Version-checked writes and conflict naming | New concurrency scheme | `apply_patches` + `expectedVersion`, `versionChain.ts`, `failedWrites.ts` | Server already refuses stale writes (D-18) |
| Offline write queue | New outbox | Existing paused-mutation queue | Reconciler only patches cache |
| Undo | New undo | `undo_log` + `apply_patches` steps | Named, undoable changes (D-14, D-34) |
| Scheduled jobs | Edge scheduler | `pg_cron` pattern used by `decide_purge_job` | Proven here |
| Rate limiting | Custom middleware | Table-backed counter like `fx_resolve_calls` | Same pattern, pgTAP 22 shows the test |
| Random secrets | JS-side random | `gen_random_bytes` in Postgres (`pgcrypto`, check extension enabled) | Server-generated, hashed at rest |
| Auth in landing page | Custom session | Anon RPC with token | Minimal surface |
| Invite UI deep link parsing | Manual URL regex | `expo-linking` | Handles cold start and warm start |

**Key insight:** this phase adds almost no new infrastructure. Its risk is policy correctness (what can B see) and transactional atomicity (move-in, leave, settle), both best solved by few well-tested security-definer RPCs rather than client orchestration.

## Runtime State Inventory

Phase 8 changes the meaning of `household_id` on existing rows (D-01 move-in, D-26 re-homing) and rewrites policies, so existing data matters.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Production Supabase project has real and sample rows in every household-scoped table, each in a household-of-one. All existing rows are sole-member, so `is_shared default false` plus `created_by` owner keeps today's behaviour. Rows with `created_by is null` (recurring_dismissals, income_payer_prompts, category_rules created_by nullable; accounts/transactions set null after deletion) would become unreadable under the new policy | Data migration: backfill `created_by` from `households.owner_id` where null, before enabling the new policies. Verify counts with a pre/post query in the migration |
| Live service config | Supabase Realtime publication `supabase_realtime`: no tables added today [VERIFIED: grep]. Single production project (`cohmcbdfgqmiwykztrdg`), no dev project | Add publication entries in a migration; push only through `npm run supabase:db:push` (human-gated). pg_cron jobs added by migration |
| OS-registered state | None | None, verified: no OS tasks in scope |
| Secrets/env vars | No new secrets for DB RPCs. Edge Function (if used for summary/landing) needs only the existing Supabase URL/anon key | None |
| Build artifacts | `src/db/rows.ts` generated/typed row shapes, `exportManifest.ts` (guard test fails if a new table in `src/db` is in neither list) | Add new tables to `EXPORT_MANIFEST` or `NOT_USER_DATA`; update row types |

**Canonical question answer:** after all code changes, production still holds rows with null `created_by` and the old `weight > 0` / `role in ('owner','member')` check constraints; both need migrations (backfill; constraint replacement), not code edits.

## Common Pitfalls

### Pitfall 1: Policy rewrite misses a read path
**What goes wrong:** B reads A's personal rows through a `security definer` RPC, a view, `apply_patches` refusal payloads (`record_name`), undo log, export, sample-data function, or Realtime.
**Why:** 33 migrations reference `user_household_ids()`; RPCs written with it bypass the new `is_shared` rule.
**Avoid:** Inventory every function with `grep -rn "user_household_ids" supabase/migrations`; each gets the shared-or-owner predicate or a stated reason. Two-user pgTAP asserts select, update, delete, RPC read, view read, patch refusal for each table. A CI meta-test lists every table with `household_id` and fails if it lacks a two-user test (follows the exportManifest guard-test idea).
**Warning signs:** a policy still contains only `user_household_ids()`.

### Pitfall 2: Personal rows with null owner lose access
Backfill `created_by` before policy switch (see Runtime State).

### Pitfall 3: Owner cascade wipes the household
`households.owner_id on delete cascade` plus account deletion. Fix with the before-delete handoff and test.

### Pitfall 4: Rate limit counter rolled back by `raise`
Return a result object for failures.

### Pitfall 5: Missed events after reconnect
Always refetch on resubscribe/foreground/online.

### Pitfall 6: Shared-to-personal flip and DELETE events
Use `household_events` and soft deletes (Pattern 6).

### Pitfall 7: `household_id` immutability triggers block D-01/D-26
Decide tables and `debts` triggers reset `household_id` on update. Add a transaction-local bypass used only by the move RPCs and cover it with a test that a normal client update still cannot change `household_id`.

### Pitfall 8: Currency of shared totals
Lines are stamped in the logger's home currency; household currency may differ. Decide the stamping approach before building balances (Open Question 2).

### Pitfall 9: Landing page hosting
Supabase Edge Functions return HTML as `text/plain` on the default domain, which breaks a "small web page" served from a function [ASSUMED: from training knowledge, not verified in this session; verify against Supabase docs before choosing]. Prefer a static host. Universal links / App Links need a controlled domain, and Apple Developer Program enrolment is not done (CLAUDE.md), so the https-to-app handoff cannot be proven on iOS yet; the custom scheme `fincwin://` plus the typed code is the guaranteed path (this matches D-07, which already requires the code fallback).

### Pitfall 10: Weight rebalancing to 100 with integers
Moving one weight rebalances the others; rounding must use `allocate` (largest remainder) so percentages always sum to exactly 100, and the all-zero state is unreachable (UI and DB check).

### Pitfall 11: Pending settlement locks vs creator edits
A creator editing a locked line must get a plain refusal; trigger returns a specific SQLSTATE the client maps through `writeErrors.ts`.

### Pitfall 12: Realtime RLS cost
RLS is evaluated per event per subscriber. Keep the policy cheap: `is_shared or created_by = (select auth.uid())` plus indexed `household_id`; avoid per-row subqueries into accounts for `statement_periods` on the published path (do not publish `statement_periods`).

## Code Examples

### Persisted failure counter without rollback (shape)
```sql
-- Source: pattern from this repo's fx_resolve_calls + Postgres semantics (a raised exception rolls back inserts)
create or replace function public.redeem_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_inv public.household_invites%rowtype; v_fail int;
begin
  select count(*) into v_fail from public.redeem_attempts
   where user_id = v_uid and ok = false and at > now() - interval '1 hour';
  if v_fail >= 5 then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;
  select * into v_inv from public.household_invites
   where code_hash = encode(extensions.digest(upper(p_code), 'sha256'), 'hex')
     and used_at is null and cancelled_at is null and expires_at > now()
   for update;
  if not found then
    insert into public.redeem_attempts(user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');   -- return, do not raise
  end if;
  -- lock household row, count members <= 5, check household-of-one, move rows, mark used ...
  return jsonb_build_object('ok', true, 'household_id', v_inv.household_id);
end $$;
```

### Personal-or-shared policy
```sql
-- Source: extends this repo's existing policy shape (20260924000400_transactions.sql line 110)
drop policy "members read household transactions" on public.transactions;
create policy "read own or shared transactions" on public.transactions for select to authenticated
  using (household_id in (select public.user_household_ids())
         and (is_shared or created_by = (select auth.uid())));
```

### Pure reconciler
```ts
// Source: synthesized from ARCHITECTURE.md Pattern 4; spike must validate
export type Decision = 'drop' | 'hold' | 'apply';
export function reconcile(
  eventVersion: number, cacheVersion: number | undefined, hasPendingWrite: boolean,
): Decision {
  if (cacheVersion !== undefined && eventVersion <= cacheVersion) return 'drop'; // echo or stale
  if (hasPendingWrite) return 'hold';        // server will reject the queued write: conflict path
  return 'apply';
}
```

### Largest-remainder with zero weights (change to `allocate`)
Validate `w >= 0`, require at least one `w > 0`, otherwise as existing. A zero-weight row yields `p = 0`, floor 0, remainder 0, and sorts last, so it never receives a leftover unit unless leftover exceeds positive-weight rows (impossible: leftover < number of positive-remainder rows).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BUILD-PROMPT many households | One household per person in v1 | PROJECT.md | `user_household_ids()` is a single-row set in practice |
| Household-wide read | Personal unless shared | This phase | Policy rewrite |
| `role in ('owner','member')` | `is_owner` + `role_label` | D-31 | Migration + `rows.ts` |
| `weight > 0` | `weight >= 0` with one positive | D-30 | Constraint + trigger on member changes |
| STACK.md names Jest 30 | package.json has `jest ~29.7.0` [VERIFIED] | — | Not blocking; use installed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Code 12 chars Crockford base32 (~60 bits), token 128-bit, 5 failures/hour/user, 20/day, global slow mode | Pattern 3 | Low; thresholds tunable, but owner may want a shorter typed code (UX) |
| A2 | Supabase Edge Function HTML is served as `text/plain` on default domain | Pitfall 9 | Wrong choice of landing host; verify before planning the page |
| A3 | Household currency shared totals need an extra stamped `household_amount` at share time | Pattern 4 | Balances mis-converted across currencies; needs design confirmation |
| A4 | `undo` limited to cancel-before-confirm for settlements | Pattern 5 | Owner may expect undo after confirm |
| A5 | Re-invite after removal reuses `redeem_invite` with a departure tag and deletes personal copies | Pattern 7 | Double counting if reconnect mishandled |
| A6 | Summary aggregated in SQL (integer sums only) | Pattern 8 | Rounding mismatch with engine if averages added |
| A7 | `expo-linking` may need installing | Standard Stack | Trivial |
| A8 | `pgcrypto`/`extensions.digest` available (Supabase default) | Pattern 3 | Trivial; check `create extension` in migration |
| A9 | Realtime throughput (1 to 8 msgs/client/s) is ample for 6 members | Pattern 6 | Low |

## Open Questions (RESOLVED)

1. **Where does the invite landing web page live, and which domain handles universal/app links?** — **RESOLVED: D-38 (custom scheme + typed code; no web page, no universal links this phase)**
   - Known: scheme `fincwin://`; Apple enrolment pending; no web infra in repo.
   - Unclear: host (static site, EAS Hosting, Edge Function), domain ownership.
   - Recommendation: static page on a host the owner controls calling the anon `invite_preview` RPC; ship custom-scheme + typed code as the guaranteed path; defer verified universal links until enrolment. Ask the owner in questions-before-build.
2. **Household currency conversion for shared lines** — **RESOLVED: D-39 (stamp household_amount once at share time)** (A3). Recommendation: stamp `household_amount` at share time using the existing on-demand FX stamping path; confirm with the stamping migration `20261007000400`.
3. **Has 05.5 landed?** — **RESOLVED: D-41 (05.5 not landed; Decide wiring plans gated)** `countsForMe` and BO-07 contracts absent on this branch. Wave 0 gate required.
4. **Is account-deletion UI/function in Phase 10 or here?** — **RESOLVED: D-40 (deletion built end to end in Phase 8: DB rule, Edge Function, in-app control)** DB rule here; the invoke path (RPC `delete_my_account` calling auth admin from an Edge Function, since clients cannot delete `auth.users`) must be agreed. Recommend an Edge Function using the service role that calls the DB handoff, owned by whichever phase ships first.
5. **Owner notice delivery:** — **RESOLVED: CONTEXT Claude's Discretion (in-app household_events notices at minimum; push with Phase 10)** in-app `household_events` is the minimum; push waits for Phase 10.
6. **Does `statement_periods` need to be shared-visible at all?** — **RESOLVED: D-43 (follow the card account's visibility; not published to Realtime)** Recommend follow-the-account visibility, not published to Realtime.
7. **Pro switches (D-12):** — **RESOLVED: D-44 (src/config/householdFeatures.ts, all true)** one boolean capability flag per feature; where the flag source lives (static config now, `household_entitlements` in Phase 9). Recommend a single `src/config/householdFeatures.ts` returning true for all.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Local Supabase for pgTAP and the Realtime spike | yes | 29.7.2 | CI runs the stack |
| Supabase CLI | `supabase db start`, `test db` | via `npx` (3.1.0 resolved on PATH miss); repo pins 2.117.0 in devDependencies | 2.117.0 pinned | `npm run` scripts use the pinned binary |
| Node | Jest, scripts | yes | v24.15.0 | — |
| Production Supabase access | Human-gated `supabase:db:push` | token only in main checkout `.env.local` | — | Planner marks pushes as human tasks. Do not use the Supabase MCP connector (different account) |
| Apple Developer enrolment | Verified universal links, TestFlight | no | — | Custom scheme + typed code |
| Real second device/user | Manual live-sync check | unknown | Pixel 6/9 + iPhone XR per memory | Two emulator sessions / two accounts |

**Missing with no fallback:** none blocking. **Missing with fallback:** universal links (Apple).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ~29.7 + fast-check ^4.10.2 (engine, data); pgTAP via `supabase test db` (database); optional separate Jest config for the Realtime spike |
| Config file | `jest.config` (default), `jest.engine.config.js` (engine, coverage gate); `supabase/tests/database/*.test.sql` |
| Quick run command | `npx jest src/engine/split src/engine/household src/data/realtime` |
| Full suite command | `npm test` plus `supabase test db` plus `npm run test:engine` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMP-F18/ARC-22 (SC7) | B cannot read/update/delete/RPC-read/view-read/receive A's personal rows, for every household table | pgTAP two-user | `supabase test db` (89_household_privacy_two_user.test.sql) | Wave 0 |
| CMP-F18 (live) | B receives no Realtime events for A's personal rows; export manifest excludes them | integration (Realtime spike) + Jest | `npm run test:realtime`; `npx jest src/data/__tests__/exportManifest` | Wave 0 |
| HH-01 | Invite expires at 7d server-side, single use, cancel, owner-only, 6-member cap race | pgTAP | `supabase test db` (90_household_invites.test.sql) | Wave 0 |
| HH-15 | Wrong codes: 6th attempt refused, counter persists, hash at rest, no oracle; code space entropy assertion | pgTAP | same file | Wave 0 |
| HH-02 | Joiner sees only shared rows; D-01 move-in keeps rows personal; in-other-household refused | pgTAP | 91_household_join_movein.test.sql | Wave 0 |
| HH-03 | Colour uniqueness per household, role label length 24, weight 0 allowed, all-zero refused, owner-only powers | pgTAP + Jest (weights rebalance sum 100) | `supabase test db`; `npx jest src/engine/household` | Wave 0 |
| HH-04/05 | Split rules even/weight/amount/mine; shares sum to total; zero weight; stored split not recomputed | fast-check property + pgTAP mirror | `npx jest src/engine/split` ; 92_household_splits.test.sql | extend existing |
| HH-06 | Category default applies when sharing; non-shared lines unaffected | Jest + pgTAP | `npx jest src/features/household` | Wave 0 |
| HH-07 | Per-pair balances; joint-paid creates no owing; settled lines excluded | Jest/fast-check | `npx jest src/engine/household` | Wave 0 |
| HH-08 | Pending/confirm/lapse day 14, reminder day 7 idempotent, lines lock/unlock, two settlement tx, settlements excluded from spend/income | pgTAP (time via `now()` override/ `set local`), Jest engine | 93_household_settlements.test.sql | Wave 0 |
| HH-09 | Own vs household figure toggle uses my-share function | Jest (RNTL) | `npx jest src/features/household` | Wave 0 |
| HH-10 | Hidden names: resolver returns colour name; profiles never exposed; Decide strings use resolver | Jest + pgTAP | `npx jest src/engine/household/memberLabel`; pgTAP on profiles select | Wave 0 |
| HH-11 | Live appearance; reconcile never regresses; resubscribe refetch; offline-mid-edit conflict | fast-check on `reconcile` + two-client spike | `npx jest src/data/realtime`; `npm run test:realtime` | Wave 0 |
| HH-12 | Summary link expiry, revocation, excludes personal/Decide rows, anon RPC returns only aggregates | pgTAP | 94_household_summary_link.test.sql | Wave 0 |
| HH-13 | Leave/remove/transfer; personal copies of share; 24h undo; open balance retained "(left)" | pgTAP | 95_household_leave_remove.test.sql | Wave 0 |
| HH-14 | auth.users delete: owner handoff to earliest joiner, personal rows erased, shared kept as Former member, remaining balances unchanged, deletion never blocked | pgTAP (extend 36) | `supabase test db` | extend |
| SC8 | Partner opt-in default off; Fits across partners never exceed shared money | fast-check in engine/decide | `npm run test:engine` | Wave 0 (after 05.5 gate) |
| SC9 (ARC-17/18, ENG-25) | One my-share source; settlement excluded everywhere; owed-to-you not spendable | Jest property + crosscheck | `npm run test:engine` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <touched dir>` and the single pgTAP file for the migration (`supabase test db` runs all; use a path filter if the CLI supports it, otherwise accept the full run, which is the CI behaviour).
- **Per wave merge:** `supabase test db` + `npm run test:engine` + `npm test`.
- **Phase gate:** full suite green; the wave-1 two-user pgTAP is a required check before any invite-flow PR merges (SC7).

### Wave 0 Gaps
- [ ] `89_household_privacy_two_user.test.sql` and a meta-test enumerating every `household_id` table
- [ ] `src/data/realtime/` module, `reconcile.test.ts` (fast-check), `test:realtime` script and jest config
- [ ] `src/engine/household/` (balances, mySharePicture, countsForMe interface, memberLabel)
- [ ] Extended `allocate` tests for zero weights
- [ ] Gate task confirming 05.5 (`countsForMe`, BO-07 contract tests) landed
- [ ] `exportManifest` entries for new tables

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth; redeem requires authenticated session; Sign in with Apple mandatory already |
| V3 Session Management | yes | Realtime channel re-auth on token refresh; teardown on sign-out/leave |
| V4 Access Control | yes | RLS personal-or-shared; owner-only RPC checks; creator-only rules (D-14/15) |
| V5 Input Validation | yes | Zod-style validation in client, DB check constraints (role label length, weight range, amounts sum) |
| V6 Cryptography | yes | `gen_random_bytes`, sha256 at rest; no hand-rolled crypto |
| V7/V8 Data protection | yes | Names never exposed (profiles), summary link aggregate-only, DPIA draft (CMP-F21) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invite code guessing | Spoofing/EoP | 60-bit code, persisted throttle, hash at rest, generic failure |
| Race on last seat / double redeem | Tampering | `for update` on invite and household rows |
| Personal row leak via RPC/view/Realtime/export | Information disclosure | RLS predicate everywhere, pgTAP per surface, publication limited to shared tables |
| DELETE event id leak | Information disclosure | Soft deletes only on published tables |
| security definer privilege escalation | EoP | `search_path=''`, qualified names, revoke from public/anon |
| Stale-write overwrite between members | Tampering | `expectedVersion` checks, never last-write-wins |
| Summary-link token leakage | Information disclosure | Expiry, revoke, hashed token, aggregate-only, no Decide data |
| Enumeration via invite preview | Information disclosure | Same response for unknown/expired, throttle |
| Orphaned personal data after deletion | Repudiation/compliance | Trigger deletes personal rows; pgTAP asserts none survive |

## Project Constraints (from CLAUDE.md)
- `engine/` imports nothing from `db/`, `state/`, `services/`, `ui/`, `react`; split, balances, countsForMe, memberLabel (if pure) live there with branch-coverage gate.
- Money: integer minor units, explicit rounding; no floats.
- Copy: declarative, never "advice", "recommendation" or "you should"; not a financial institution (settle-ups record payments, hold no money).
- In-account deletion must actually purge; GDPR erasure, portability, DPA.
- Design: only the token set; no extra colours (the six member colours come from the prototype set; UI-SPEC governs).
- Do NOT use the Supabase MCP connector; use CLI with `SUPABASE_ACCESS_TOKEN` from main checkout `.env.local`. Single project is production; pushes only via `npm run supabase:db:push` (preflight). All migrations here are therefore human-gated; the plan should batch pushes at wave ends.
- GSD workflow: changes via GSD commands; work lands by branch + PR (main protected).
- Expo Go unusable; dev build. Haptics use the Async method names.
- Memory-derived: ask owner questions in plain English first; wave-batching; status from git; milestone-level full test runs.

## Sources

### Primary (HIGH confidence)
- Codebase in `C:\dev\fincwin-h8`: `supabase/migrations/20260922000100_household_of_one.sql`, `20260924000400_transactions.sql`, `20261016000100_decide_tables.sql`, `20261028001100_apply_patches_v3.sql`, `20261028000100_decide_settings_v3.sql`, `supabase/tests/database/36_account_deletion.test.sql`, `src/engine/split/allocate.ts`, `src/data/sync/versionChain.ts`, `src/data/exportManifest.ts`, `src/db/household.ts`, `.github/workflows/ci.yml`, `package.json`
- `.planning/phases/08-household/08-CONTEXT.md`, `.planning/research/ARCHITECTURE.md` Patterns 3-7
- [Supabase Realtime Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) - RLS per subscriber, DELETE bypass, publication, filters, throughput

### Secondary (MEDIUM confidence)
- CLAUDE.md STACK notes on Realtime channel gotchas (stale closures, unsubscribe)

### Tertiary (LOW confidence)
- Edge Function HTML content-type behaviour (A2), thresholds (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new needed
- Architecture: MEDIUM-HIGH, schema/RPC design grounded in code; settlement and leave semantics are design proposals from locked decisions
- Pitfalls: HIGH for codebase-derived (owner cascade, null created_by, raise-rollback, DELETE bypass); MEDIUM for hosting
- Realtime reconciler: MEDIUM, spike required

**Research date:** 2026-11-10
**Valid until:** 2026-12-10 (stable; re-check 05.5 landing status first)
