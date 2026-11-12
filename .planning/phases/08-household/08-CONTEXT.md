# Phase 8: Household - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

**Preconditions:** read `08-PRECONDITIONS.md` first (gates, revision round after 06.1, shared-file merge notes; 08-28/08-29 moved to 08.1 on 2026-11-11).

<domain>
## Phase Boundary

Two to six people share one household's money, live. Phase 8 delivers invites and joining, members (colour, role, weight, display name), shared records with split rules, who-owes-who and settle-up, own-vs-household figures, hidden names, the read-only summary link, leaving, removal and ownership transfer, the deletion rule, and Realtime sync for shared data. It also turns on the BO-07 point 6 household connection point for Decide (my share, partner opt-in, settlements excluded).

**First wave, blocking (fix plan, locked):** every record is personal unless marked shared, and the database enforces this. Today's RLS lets any member read every household row (`members read household transactions` uses `user_household_ids()`). That changes first, including the household-wide read rule on `debts` and `statement_periods`. The two-user tests must be green before the invite flow (HH-01) merges: member B cannot read, edit, receive live updates for, or export member A's personal rows (CMP-F18, ARC-22).

**Not in this phase:** more than one household per person (HHX-01), per-account sharing levels (HHX-02), Pro paywall locks (Phase 9), Decide screens (08.1).

**Order:** 05.5 → Grow (6) → Household (8). Phase 8 depends on 05.5's `countsForMe` rule and the BO-07 contract tests. They are not in `src/` yet (checked 2026-11-10), so the planner must confirm 05.5 has landed or plan around it.

</domain>

<decisions>
## Implementation Decisions

### Joining a household
- **D-01:** When a person with existing records joins, their accounts and records move into the new household and stay **personal**. Nothing becomes visible to others, history and Decide keep working, and they can share lines later. Joining never flips old records to shared (fix plan, locked).
- **D-02:** Invites are valid for **7 days**. The owner can cancel one earlier. Expiry is enforced on the server.
- **D-03:** **One person per invite.** Once used, the invite is dead, so a flatshare of 3 sends 2 invites.
- **D-04:** A valid invite joins the person **at once**, with no approval step. The owner gets a notice ("Sam joined") and can remove them.
- **D-05:** **Only the owner** can send invites.
- **D-06:** A person already in a household with other members must **leave it first**. The join screen says so. Two households are never merged silently. A household-of-one joins freely (D-01).
- **D-07:** A link opened without the app installed shows a **small web page**: who invited them, the household name, App Store and Play buttons, and the code. After install and sign-in, the app asks for that code. The invite token and code are long enough not to be guessed, and redemption is rate-limited (HH-15). Code length, token format and rate-limit numbers are Claude's discretion; follow ARCHITECTURE.md `redeem_invite` (security definer, `select … for update`, empty `search_path`).
- **D-08:** Each member **keeps their own home currency** for personal figures. Shared totals and settle-ups use the **household currency**, which the owner sets. Each settlement stores its FX rate (01 D-06, PROJECT.md).
- **D-09:** After joining, the new member sees one **"what's shared" card**: "Your records stay private. Only lines you mark shared are seen by [household]. Your Decide checks are never shared." Then they go into the app.
- **D-10:** A household holds at most **6 members**. The 7th invite is refused with a plain message.
- **D-11:** The household has a **name**. It defaults to "[Owner first name]'s household", and the owner can rename it. It appears on the invite page, notices and settle-ups.
- **D-12:** Everything is built and works for everyone. **Pro locks wait for Phase 9**, with one switch per feature so Phase 9 can gate weight/amount splits, category defaults and the summary link (PRICING.md is advisory, not adopted).

### Marking money shared
- **D-13:** A record becomes shared through a **"Shared" switch on a line**, or through a **Joint account**, whose new lines start shared and whose balance members can see. Category default split rules (HH-06) apply once a line is shared. Categories do not auto-share lines. Bulk sharing of existing lines is an explicit action that shows a count (fix plan, locked).
- **D-14:** Only the **creator** of a shared line, and the named payer (D-18), can change its amount, date and note. **Any member** can change the split or their own category (02 D-33 per-member category override). Every change is named ("Sam changed the split") and can be undone. Version checks refuse stale writes and name who changed what (01 D-18, 02 D-26). Never last-write-wins.
- **D-15:** Only the creator can make a shared line personal again, and **only if no settle-up covers it**. Other members see "Paul made a line private".
- **D-16:** Sharing one line of a repeating series asks "Share every month of this bill?". Yes shares this line and all future lines. Past lines stay as they are unless bulk-shared.
- **D-17:** Shared lines **paid from a Joint account** count toward each person's share in figures and Decide, but **create no owing**. Owing comes only from shared lines one person paid from personal money. Top-ups to a joint account are not tracked.
- **D-18:** A shared line has a **"Paid by"** field that defaults to the logger. If someone else is named, that person sees the line marked "logged by Paul" and can edit the amount.

### Settling up
- **D-19:** A settle-up started by the payer is **pending until the receiver confirms**. The payer sees "Waiting for Sam". Sam gets "Paul says he paid you £84: Got it / Not yet". On "Got it", the lines lock and the record appears on both sides. Money owed to you is not spendable until it arrives (ENG-25, locked).
- **D-20:** This is the **expiry window** the brief left open. If there is no answer, a reminder goes out at **day 7**, and the settle-up **lapses at day 14**. The lines unlock, the balance is owed again, and both people are told. Nothing ever settles silently.
- **D-21:** A settle-up covers **chosen lines** (prototype). All unsettled lines start ticked and can be unticked. The amount is exactly the ticked lines, and exactly those lines lock. There are no free-amount part payments.
- **D-22:** Settle-ups **move account balances**. The payer picks the account the money left. The receiver picks the account it arrived in when confirming. A settlement counts as neither spending nor income, and one "is settlement" rule excludes it everywhere (ARC-18, locked).
- **D-23:** With 3 or more people, balances are shown **per pair**, with no debt simplification. Every amount traces back to lines.
- **D-24:** The **receiver can start** a settle-up ("Sam paid me £84 cash"). It settles at once, because the receiver is the confirmer, and the payer is told. The receiver can also send an "Ask Sam to settle up" nudge.

### Leaving, removing and ownership
- **D-25:** Leaving with an **open balance** is allowed after a warning ("You owe Paul £40"). The balance stays on both sides as "Sam (left)". Either person can still settle it or write it off later.
- **D-26:** A person who leaves or is removed moves their personal records into a **new household-of-one**. Each shared line they were on becomes a **personal copy of their share**, so their history and Decide stay correct. The household keeps the originals with the split unchanged (prototype: "lines they were on keep the split you gave them").
- **D-27:** When the owner **leaves**, they pick the new owner. When the owner **deletes their account**, ownership passes automatically to the **member who joined earliest**, who is told. Deletion is never blocked (erasure).
- **D-28:** A removed member sees "You're no longer in [household]", and their data is handled exactly as in D-26. Removal can be **undone for 24 hours** by re-inviting, with the member's lines reconnected.
- **D-29 (locked, CMP-F23):** On account deletion, shared records the person created stay, attributed to "Former member". Everything personal is erased, and the remaining members' balances stay correct.

### Members: roles, weights, names, colours
- **D-30:** Weights are shown as **percentages that always add to 100**. Moving one rebalances the others. **0% is allowed** (for example a lodger on fixed rent), but at least one member must be above 0. The schema changes: `weight > 0` must allow 0, and the guarded all-zero case from 04 D-15 stays guarded.
- **D-31:** **Roles are labels only.** Partner, Flatmate, Family, Housemate, Lodger, Owner and custom roles (free text, up to 24 characters). The default for a new member is Flatmate (prototype). Only **Owner** carries powers: invite, remove, rename the household, set the household currency. The schema's `role in ('owner','member')` check changes to an owner flag plus a role label.
- **D-32:** **Each member decides** whether others see their name or their colour name ("Rust"). The default is the first name from sign-in, stored in `household_members.display_name`. `profiles.full_name` and email are never exposed to other members. Every string that names a member goes through one resolver, Decide included (fix plan, locked).
- **D-33:** Each new member gets the **next free colour** of the six from the prototype (Green, Rust, Slate, Ochre, Plum, Teal) and can swap to another free one.
- **D-34:** **Any member** can change weights, the household split rule and category defaults. Everyone is told ("Sam changed Groceries to even"), and the change can be undone.
- **D-35:** A change to weights or rules applies to **new lines only**. Each line stores the split it had when logged. An offer to "Also apply to the N unsettled lines", with a count, is available. Settled lines never change.

### Decide with a partner
- **D-36:** **Safety net:** each person has their own, and Decide protects it for them. A couple can mark one net as shared, and then it protects both people's checks. This settles fix plan Q10.
- **D-37:** If a partner hasn't logged shared bills, Decide **still answers** with a named caveat ("Sam hasn't logged shared bills since 3 Nov, so shared costs may be higher"). It is never a "not enough data" block, following "ask, don't block". A "normal month" for Decide means your records plus your share of shared lines (ENG-25 default). This settles E1.
- **Carried forward (locked, do not re-ask):** a partner's money counts in Decide only with that partner's opt-in, off by default, and then as one rounded total only. Decide checks are never shared. Two partners' "Fits" answers on shared money can never add up to more than the shared money. Household split rules are the one source of "my share" (ARC-17), and the `decide_settings` share column moves to its owner and is removed. One income profile per member (ARC-19). The Share setup step becomes Household's "Who do you share money with?" (ARC-20). The summary link leaves out Decide data and personal rows. UX-21 couples note, FIN-14, APP-08 steps 3–4, APP-22, CMP-F04 and the CMP-F21 DPIA draft are all in this phase.

### Owner answers to research questions (2026-11-10, plan-phase)
- **D-38:** Invite links use the **custom app scheme (`fincwin://`) plus the typed code** as the guaranteed path. No web landing page and no universal links in this phase; both wait for Apple enrolment.
- **D-39:** A shared line's household-currency figure is **stamped once when the line is marked shared** (`household_amount`, via the existing FX stamping path) and stored. Balances never move with exchange rates.
- **D-40:** This phase builds **account deletion end to end**: the database rule (D-27, D-29), a service-role Edge Function that deletes the auth user, and the in-app "Delete my account" control. Deletion must actually purge.
- **D-41:** Phase 05.5 (`countsForMe`, BO-07 contracts) has not landed. **Build all household features now; the Decide wiring plans (success criteria 8 and 9) sit behind a gate task that checks 05.5 has merged.** Do not re-implement 05.5 inside Phase 8.
- **D-42:** A **confirmed settle-up can be undone by either member for 24 hours**. Undo unlocks the lines, reverses both settlement records and the account-balance moves, restores the owing, and tells both people. After 24 hours it is final. A pending settle-up can be cancelled by the payer at any time.
- **D-43:** `statement_periods` **follow their card account's visibility**: shared account means household-visible, personal means owner-only. Statement periods are not published to Realtime.
- **D-44:** Pro switches (D-12) live in **one file, `src/config/householdFeatures.ts`**, one boolean per household feature, all `true` for now. Phase 9 points it at the real entitlement.
- **D-45:** **HH-12 (read-only household summary link) moves out of Phase 8.** It needs a web page for people without the app; it returns together with the invite web page after Apple enrolment. Phase 8 builds no summary-link table, RPC or screen. Phase 8 success criterion 5 is met by live updates alone.

### Claude's Discretion
- Invite code and token length, character set and rate-limit thresholds (D-07). These must make guessing futile, with a pgTAP or edge test proving it.
- The Realtime reconciler design (four cases keyed on `version`: no pending write, write still queued, own-write echo, genuine conflict) and the required two-client spike with one client offline mid-edit (ROADMAP research flag).
- Split rounding: largest remainder, ties broken by join order, with a property test that shares sum to the total (ARCHITECTURE.md).
- Notification delivery (push vs in-app) for joins, rule changes, settle-up requests, reminders and lapses. Use what Phase 10/expo-notifications allows. In-app notices at minimum.
- The data model for joint accounts, paid-by, the per-line stored split, pending settlements and "former member" attribution.
- Summary-link details beyond the prototype: 24h/7d/30d chips, default 7d, "Show what each line was for" toggle, read-only page.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fix plan and household scope
- `.planning/research/DECIDE-FIX-PLAN.md` — Theme N and BO-07 point 6 (household connection point, ~line 790), CMP-F18 / ARC-22 privacy-first wave (~20, 236, 613), ARC-17/18/19/20, ENG-25, CMP-F19/F21/F23, UX-21, FIN-14, APP-08/22, CMP-F04, Q9/Q10 (~1175–1192), household personas for 08.2 (~959, 1134), right-answer table household cases (~827)
- `.planning/ROADMAP.md` §"Phase 8: Household" — success criteria 1–9, research flag (Realtime spike)
- `.planning/REQUIREMENTS.md` — HH-01..HH-15; HHX-01/02 deferred; TIER-06 (sharing is a capability flag)

### Architecture and risks
- `.planning/research/ARCHITECTURE.md` — `household_invites` + `redeem_invite` RPC (~251), hidden names via `display_name` (~253), largest-remainder splits (~270), four-case Realtime reconciler (~207–214), household-of-one (~230)
- `.planning/research/PITFALLS.md` — invite expiry server-side (~332), RLS tests for settlement/invite tables (~330, 352)
- `.planning/research/PRICING.md` — advisory only: 6-member household, Free vs Pro split, `household_entitlements` (for the Phase 9 switches in D-12)
- `.planning/PROJECT.md` — household positioning, Realtime rationale, one household in v1

### Prototype and brief
- `FincWin United.dc.html` — member colours (~3221), roles (~3226, 3923), weights (~3494, 3822), split rules and category defaults (~3491, 3823), settle-up sheet (~3270, 3776–3801, 6046–6083), summary link (~3803–3818, 6086–6093), remove member (~3839)
- `BUILD-PROMPT.md` — household section (~227, 232). Its many-households model is superseded by one household in v1.

### Earlier phase decisions that constrain this one
- `.planning/phases/01-money-core/` CONTEXT — D-06 household reporting currency, D-18 `expected_version` updates
- `.planning/phases/02-record/` CONTEXT — D-26 refusal names who changed it, D-33 per-member category override
- `.planning/phases/02.3-record-follow-ups-from-the-02-2-walkthrough-inserted/` CONTEXT — D-24/D-27 shared category rules
- `.planning/phases/04-decide-engine/` CONTEXT — D-15, D-34 share resolution in the engine
- `.planning/phases/05-decide-ui/` CONTEXT D-18 and 05-UI-SPEC "Who pays what" (~409) — household-only UI shows when members > 1
- `.planning/phases/05.5-one-shared-money-model/` — `countsForMe` and BO-07 contract tests Phase 8 turns on
- `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CARRY-OVER-FROM-05.4.md` — `shared_money` caveat copy (~37)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/migrations/20260922000100_household_of_one.sql` — `households`, `household_members` (role, weight, display_name, version), `user_household_ids()`, signup trigger, and `bump_version()` for version-checked writes.
- `src/engine/split/allocate.ts` — the existing split allocator, to extend for the four rules and per-line stored splits.
- `src/db/household.ts`, `src/db/householdCurrencies.ts` — the existing household data access.
- `src/data/mutations/*` with paused-mutation write queue, and the undo log (`src/db/undoLog.ts`, server `apply_patches`), for named, undoable changes.
- `src/data/exportManifest.ts` — the export must respect personal-vs-shared (B cannot export A's personal rows).

### Established Patterns
- Every table is household-scoped through `household_id in (select user_household_ids())`. Phase 8 adds a personal/shared dimension (owner + shared flag) to every table that holds money records, then rewrites RLS, views and RPCs.
- `created_by uuid default auth.uid()` already exists on transactions and is the natural owner column. Its `on delete set null` must line up with "Former member" (D-29).
- Schema changes go through migrations plus pgTAP. Production pushes are human-gated through `npm run supabase:db:push`, and there is only one (production) project.
- Engine stays pure: `engine/` never imports db, state, services, ui or react. The split maths and the countsForMe rule live there with full branch coverage.

### Integration Points
- RLS on every money table (transactions, accounts, recurring series, debts, statement_periods, savings goals, decide tables), plus read RPCs and views.
- Supabase Realtime `postgres_changes` on shared tables only, filtered so personal rows never leave the database for other members.
- The You/settings area (`src/features/you`) and shell navigation get a Household screen. Decide reads the share through BO-07 point 6.

</code_context>

<specifics>
## Specific Ideas

- Copy examples agreed in discussion: "Sam joined"; "You're in another household. Leave it first to join this one."; "Waiting for Sam"; "Paul says he paid you £84: Got it / Not yet"; "Paul made a line private"; "Sam changed Groceries to even"; "You're no longer in [household]"; "Sam hasn't logged shared bills since 3 Nov, so shared costs may be higher". Keep declarative, never "you should".
- The invite page reads "Paul invited you to Flat 4B".
- Each member is shown by colour name when their name is hidden (Green, Rust, Slate, Ochre, Plum, Teal).

</specifics>

<deferred>
## Deferred Ideas

- Pro locks on weight/amount splits, category defaults and the summary link go to Phase 9 (D-12).
- More than one household per person (HHX-01) and per-account sharing levels (HHX-02) are already deferred in REQUIREMENTS.md.
- Tracking who funds a joint account (top-up balancing) was rejected for v1 (D-17).
- Debt simplification across 3+ people was rejected for v1 (D-23).
- Role-based permissions were rejected for v1 (D-31).
- HH-12 summary link deferred to a later phase with the invite web page, after Apple enrolment (D-45).

</deferred>

---

*Phase: 08-household*
*Context gathered: 2026-11-10*
