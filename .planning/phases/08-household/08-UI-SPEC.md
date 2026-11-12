---
phase: 8
slug: household
status: approved
reviewed_at: 2026-11-10
shadcn_initialized: false
preset: none
created: 2026-11-10
---

# Phase 8 (Household) - UI Design Contract

> Visual and interaction contract. The design follows the owner's clickable prototype (`FincWin United.dc.html`, household sections: member colours ~3221, roles ~3226/3923, weights ~3494/3822, split rules ~3491/3823, settle-up sheet ~3776-3801 and ~6046-6083, summary link ~3803-3818 and ~6086-6093, remove member ~3839) mapped onto the app's existing tokens (`src/theme/*`) and primitives (`src/ui/*`). Behaviour is locked by 08-CONTEXT D-01..D-37. Where this file and the prototype differ, this file wins on tokens and 08-CONTEXT wins on behaviour. Structure and voice follow `06-UI-SPEC.md`.

Sources: 08-CONTEXT D-01..D-37 and `<specifics>`, REQUIREMENTS HH-01..HH-15, 05-UI-SPEC "Who pays what", 06-UI-SPEC conventions, CLAUDE.md design-fidelity and compliance rules.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (React Native; shadcn gate not applicable) |
| Preset | not applicable |
| Component library | The app's own `src/ui/*`: `Screen`, `Row`, `Chip`, `Pill`, `ToggleRow`, `SegmentedToggle`, `Sheet`/`SheetHeader`, `ConfirmSheet`, `DetailSheet`, `ToastView`, `EmptyState`, `WarningCard`, `StateChip`, `CheckRow`, `SwatchDot`, `RadioDot`, `Keypad`, `MoneyInput`, `TextInput`, `Dropdown`, `LabelValueRow`, `AmountDisplay`, `SyncStatusLine`, `FailedWritesSheet`, `SettingsGroup` (`src/features/you/components`) |
| Icon library | The app's own bespoke two-layer glyph set. No substituted set. Glyphs used: `chev`, `plus`, `minus`, `lock`, `view`, `bills`, `card`, `savings`, state shapes `sCheck`, `sClock`, `sOver`, `sQuestion`. New glyphs drawn in the same two-layer style this phase: `people` (Household row and tab header), `link` (summary link), `swap` (settle up). Plan 1 confirms which already exist (same open item as 06 OQ-5) |
| Font | Active pairing via `textRole(pairing, role)` and `src/theme/fonts.ts` |

New primitives to build (composed from existing tokens only, no new colours):

| Primitive | Purpose |
|-----------|---------|
| `MemberAvatar` | 32 px circle (28 in dense rows, 40 in the member sheet) filled with the member colour, white initial centred. Initial is the first letter of the name the viewer sees (D-32), or of the colour name when the name is hidden. Never colour alone: a name always sits beside it |
| `MemberName` | Text component that takes a member id and renders through the single display-name resolver (D-32). No screen builds a member string any other way. Lint/grep test: no `display_name` or `full_name` read outside the resolver |
| `WeightRow` | Avatar, name, percentage, minus / plus stepper (steps of 5, 44 px buttons) and a typed field on tap. Used in the weights sheet and the amount split |
| `SplitRuleList` | Four radio rows (`RadioDot`, min 64 px): Even, By weight, By amount, Mine only |
| `BalanceCard` | Per-pair balance row inside one card (see Screen 2) |
| `ChangeLine` | One named change with actor, what changed and an Undo action (notices and the line history) |
| `SharedBadge` | Small `StateChip`-style label "Shared" (people glyph + word) on lines and accounts |

---

## Spacing Scale

The app uses exact prototype pixel values, not a generic 4-point scale (`src/theme/layout.ts`: "Do not round these"). Phase 8 uses only existing tokens.

| Token (layout.ts) | Value | Usage in Household |
|-------|-------|-------|
| `gapSm` | 8 | Gaps between chips, avatar-to-name, role chips |
| `gapMd` | 12 | Between paired cards, avatar stack overlap offset base |
| `cardPad` | 16 | Card inner padding, notice cards |
| `cardPadLg` | 20 | Household hero card, settle-up total card |
| `groupGap` | 18 | Between sections and cards on every Household screen |
| `screenH` | 22 | Horizontal screen padding |
| `touchMin` | 44 | Every tappable: back, steppers, chips, swatches, text buttons, tick boxes |
| `sheetPadBottom` | 30 | Sheet bottom padding |
| `rowPad` / `rowPadDense` | 15 / 13 | Row vertical padding (dense in settle-up line list and weights) |

Row heights: 52 one line, 64 two lines (min-heights; they grow with text scale). Avatar 32 (28 dense, 40 member sheet). Colour swatch tiles 44 x 44 (reuse `SwatchDot` hit area).

Exceptions: 22, 15, 13, 36-derived sizes are the app's existing non-4 values. Touch targets are never below 44. Other non-4 values (6 px member dot, 3 px split-line rule, 28 px dense avatar, 18 / 26 radii) are prototype values, kept as in the prototype per the "Do not round these" rule.

---

## Typography

Only the app's `fontSize` scale and existing weights (500 body, 600 label, 700 heading). No new sizes.

| Role | Token | Size | Weight | Line height | Household use |
|------|-------|------|--------|-------------|---------------|
| Display figure | `display` | 34 | display face | 1.0 | Settle-up total, the "You are owed" figure on the hero card |
| Heading | `heading` | 26 | 700 | 1.16 | Screen title "Household", weight percentage in the weights sheet |
| Sheet title | `sheetTitle` | 16 | 600 | 1.2 | Sheet titles, card titles, member names in rows |
| Body | `body` | 15 | 500 | 1.5 | Row text, explainer copy, button labels |
| Label | `label` | 13 | 600 | 1.4 | Field labels, role chips, sublabels, footers |
| Meta | `meta` | 12.5 | existing meta weight | 1.4 | "logged by Paul", timestamps, notice dates, line history |

Amounts always use tabular figures. Percentages in the weights sheet are `heading` and always shown with the % sign; the set must visibly total 100.

---

## Color

Only `src/theme/tokens.ts` and `accents.ts`. No gradients, no extra shadows, no new hex (enforced by `noRawColours.test.ts`).

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `canvas` #FBFAF7 | Screen background |
| Secondary (30%) | `surface` #FFFFFF cards with `shadows.card`; `fill1` #F1EFE8 for soft blocks (notice cards, "what's shared" card, summary link box, segmented track) | Cards, rows |
| Accent (10%) | user accent (`colors.accent`) | see list below |
| Destructive | `danger` #B4472A on `dangerTint1` | Exactly the elements rendered in danger: "Remove [name]" (text button and its confirm), "Leave household" (text button and its confirm), "Write off" (confirm), "Stop sharing" (confirm). Nothing else. Cancelling an invite is neutral |

Accent reserved for: primary `Pill` fill (Send invite, Join Flat 4B, "Settle up with [Name]", "Tell Sam you paid", "Yes, I got $84", "Save weights", "Save split", "Save default", "Save changes", and the info-sheet "Got it"), selected `SegmentedToggle` / `Chip` / radio dot, the "Shared" switch when on, the tick fill on selected settle-up lines, the "You are owed" figure, and text links ("Invite someone", "Rename").

Member colours (the only new colour use; all already in `tokens.ts` as `memberColors`, `memberColorNames`):

| Order | Name | Token | Hex |
|-------|------|-------|-----|
| 1 | Green | `memberColors[0]` | #1B4D3E |
| 2 | Rust | `memberColors[1]` | #B4472A |
| 3 | Slate | `memberColors[2]` | #3E5C6B |
| 4 | Ochre | `memberColors[3]` | #7E6020 |
| 5 | Plum | `memberColors[4]` | #6E4A63 |
| 6 | Teal | `memberColors[5]` | #2F6E68 |

Rules: a member colour fills an avatar, a 6 px dot, or a 3 px left rule on a split line; it is never the only way to tell people apart (name or colour name text is always present, avatar carries an initial). Rust equals `danger` in hue: avatars and dots in Rust are never used for a state or an amount, and amounts owed are `ink`, never red. The first six members get the next free colour (D-33); in the swatch picker taken colours show the owner's avatar initial and are disabled.

State mapping:

| Meaning | Token | Shape + word |
|---------|-------|--------------|
| Pending settle-up ("Waiting for Sam") | `warn1` text on `warnTint` | `sClock` + words |
| Settled (after "Yes, I got $84") | `accentTint1` fill, `accent` text | `sCheck` + "Settled" |
| Lapsed settle-up | `fill1`, `inkMuted` | `sOver` + "Lapsed" |
| Conflict / stale write refused | `warn1` on `warnTint` | `sOver` + words naming who changed what |
| Owed to you not yet received | `ink` amount, `meta` note "Not spendable until it arrives" | `sClock` |
| "(left)" member | `inkMuted` | word "(left)" |

---

## Navigation and Entry Points

- **You tab -> "Household" row** (`SettingsGroup` row, `people` glyph, sublabel "Flat 4B · 3 people" or "Just you" for a household-of-one; carries a small unread Notices count `Chip` when there are unread notices; no dot on the You tab). Opens `app/(app)/household` (pushed screen, back chevron). This is the home of the phase.
- **Home** shows nothing new. Overview figures gain a "Mine / Household" scope switch only where Phase 5/05.5 already defined `countsForMe`; this phase wires it (Screen 9), no new tab.
- **Activity** line rows show a `SharedBadge` and, on shared lines paid by someone else, "logged by Paul".
- **Entry sheet** gains the "Shared" switch group (Screen 4).
- **Pro lock attach points (D-12, no lock UI now):** each of these is one boolean read from a single `useFeature('hh.*')` hook that returns true for everyone until Phase 9: `hh.weightSplit`, `hh.amountSplit`, `hh.categoryDefaults`, `hh.summaryLink`. The screens below carry no lock glyph, no "Pro" word and no disabled state in this phase. Phase 9 renders its own chrome around these four.
- Household-only UI appears when the household has more than one member, or the user opens the Household screen. A household-of-one sees the empty state in Screen 1.

---

## Layout and Screen Contracts

All screens: `Screen` wrapper, scrollable, safe-area aware, footer note in `label` / `inkMuted`. Pushed screens have a back chevron (44 x 44, accessibilityLabel "Back"), title and optional right action. Primary pill is full width, 52 px tall; secondary is outline pill; text buttons min 44 px tall. Sheets use the app `Sheet` with Close top right, content scrolls with the primary pill pinned.

### 1. Household home (HH-01..HH-04, HH-08) - `app/(app)/household`
Top to bottom:
1. **Hero card** (`surface`, `cardPadLg`): household name (`heading`, owner sees an "Rename" text link, D-11), sublabel `label` "3 people · amounts in USD" (household currency, owner can change it, D-08), the **who-owes-who sentence** in `sheetTitle`, declarative: "Sam owes you $84." / "You owe Sam $40." / "Everyone is square in Flat 4B." / "You are owed $120 across 2 people." (prototype `hhSentence`). A `meta` line under it when something is unsettled and pending: "A further $30 sits in shared lines that are still unpaid, so it is not counted yet."
2. **People card:** one row per member (64 px): `MemberAvatar`, name via resolver (`sheetTitle`), role chip (`label`, `fill1`), weight "55%" right, chevron. Owner row carries the word "Owner" in the role chip. Former members with an open balance appear at the bottom as "Sam (left)" in `inkMuted`. Tap opens the member sheet (Screen 5). Text button below: "+ Invite someone" (owner only, D-05; others do not see it). When 6 members: row replaced by `meta` "A household holds up to 6 people." (D-10).
3. **Balances card** (only when anyone owes anything), see Screen 2.
4. **Pending invites card** (owner only): each row `Chip`-style "Invite sent · expires Nov 17", sublabel "Valid for one person", actions "Copy link" and "Cancel invite" (text buttons, min 44). Cancel needs no confirm; toast "Invite cancelled" + Undo.
5. **Rules card:** "How new shared lines are split" row (shows current default, e.g. "Even") -> split rules sheet; "Category defaults" row -> Screen 6; "Shared accounts" row -> list of Joint accounts (Screen 4b); "Read-only summary link" row (`link` glyph) -> Screen 10.
6. **Recent changes card:** visible to every member of the household, each change naming who made it. Up to 5 `ChangeLine`s ("Sam changed Groceries to even", "Paul made a line private", "Sam joined"), each with Undo where D-14/D-34 allow it and the undo window is open; "See all" opens a sheet with the full list.
7. **Leave household** text button at the bottom (non-owner and owner, `danger` text; opens Screen 8).
8. Footer: "Your records stay private. Only lines you mark shared are seen by Flat 4B. Your Decide checks are never shared. FincWin records who owes whom. It holds no money and moves none."

**Household-of-one empty state** (`EmptyState` look): heading "Just you for now", body "Invite the people you share money with. Each person keeps their own records private.", primary "Invite someone". Footnote link "Have a code?" opens Screen 3.

**Offline:** shows cached figures with quiet "Offline · as of <time>" (`SyncStatusLine`); invite, settle-up, remove and rename are disabled with helper "Needs a connection. Try again when you're back online." Writes that can queue (split change, mark shared) use the existing paused-mutation queue and `FailedWritesSheet`.

### 2. Balances and who-owes-who (HH-07, D-23)
- Shown **per pair**, no simplification. One row per other member (64 px): avatar, name, sentence ("owes you $84" / "you owe $40" / "square"), amount right in `sheetTitle` `ink`, chevron.
- Tap a row opens the **pair sheet** (`DetailSheet`): total, then "Lines behind this" list (name via resolver of the line, date, rule, "paid by Paul", "your share $x"), each line traceable; ticked-state is not shown here. Actions: "Settle up with Sam" (primary pill) and, when owed to you, "Ask Sam to settle up" (outline pill, D-24). A small `meta` explainer: "Every amount traces back to these lines."
- Pending settle-ups appear on the pair row with a `warn1` `sClock` chip "Waiting for Sam" (payer) or "Sam says he paid you" (receiver, with action row "Yes, I got $84" / "Not yet").
- Left members: "Sam (left)" row, same pair sheet, plus text button "Write off" (receiver or either side, D-25) which opens a `ConfirmSheet` "Write off $40 with Sam (left)? The lines stay in your record as written off." / "Write off" (danger variant) / "Keep it".
- Amounts owed to you carry the `meta` note "Not spendable until it arrives" (ENG-25).

### 3. Joining (HH-01, HH-15, D-06..D-09)
- **Enter a code sheet** (reached after install from the web page, from "Have a code?", or from a deep link which prefills it): title "Join a household", one `TextInput` (uppercase, monospace not required, groups of 4 with a dash shown for readability, paste allowed, autoCapitalize characters, `autoCorrect` off), helper "Paste the code from your invite.", primary "Check code" (disabled until the field is complete). After a valid check, a preview card (`fill1`): "Paul invited you to Flat 4B" + "3 people so far", primary "Join Flat 4B", text "Not now".
- **Already in a household with other members (D-06):** the preview card is replaced by a `WarningCard` (warn tone, `sOver`): "You're in another household. Leave it first to join this one." Actions: primary "Go to my household" (opens Screen 1 leave flow), text "Not now". A household-of-one joins freely with no warning (D-01).
- **Records moving in:** one `meta` line under the preview for people with existing records: "Your accounts and records come with you and stay private."
- **Errors** (plain, with a next step; same wording for all failures so a guesser learns nothing): invalid, used or expired -> "This invite has run out or was already used. Ask Paul for a new one." Rate-limited -> "Too many tries. Wait a few minutes and try again." Full household -> "Flat 4B already has 6 people. Ask the owner to remove someone first." Offline -> "You need a connection to join. Connect and try again."
- **After joining, "What's shared" card (D-09):** a one-time full `Sheet` with `people` glyph tile, title "You're in Flat 4B", body exactly: "Your records stay private. Only lines you mark shared are seen by Flat 4B. Your Decide checks are never shared." Primary "Got it" (light haptic). Not shown again. Success toast on the owner's device and in-app notice: "Sam joined" (D-04).
- **Sign-in gate:** a person opening a link while signed out signs in first (Sign in with Apple, Google, email, per Phase 2/auth), then returns to the code screen with the code kept. No account is created by the web page.

### 4. Marking money shared (HH-02, HH-05, HH-06, D-13..D-18)
**4a. Entry sheet additions** (add/edit a line), shown only when the user is in a household with 2 or more people:
- `ToggleRow` "Shared" (helper `meta` "Seen by Flat 4B and split between you."). Off by default except on a Joint account, where it starts on and is changed with a `SharedBadge` note instead of a switch ("Lines on this account are shared").
- When on, an expandable group (same row style as the entry sheet's dense fields, `rowPadDense`):
  - **Paid by** row (default "You"; options: each member via resolver) with helper when someone else is chosen: "[Sam] will see this marked logged by you and can edit the amount." (D-18)
  - **Split** row showing the rule and the result in one line, e.g. "Even · you $42, Sam $42". Tap opens the split sheet (4c).
  - If the line sits in a repeating series, on switching on: `ConfirmSheet` "Share every month of this bill?" body "This line and all future lines will be shared. Past lines stay as they are." Primary "Share every month" / secondary "Just this one" (D-16).
  - A line paid from a Joint account shows `meta` "Paid from a shared account, so it counts toward each share and creates no owing." (D-17)
- Making a line personal again (creator only, D-15): same switch off; if a settle-up covers the line the switch is disabled with helper "A settle-up covers this line, so it can't be made private. Edit the split instead." Otherwise a toast to the creator "Line made private" + Undo; others see the notice "Paul made a line private".

**4b. Joint accounts:** in the add/edit account sheet a `ToggleRow` "Joint account" with helper "New lines start shared and members can see the balance." Account rows show a `SharedBadge`. A list of joint accounts sits under Household > "Shared accounts".

**4c. Split sheet** (entry and shared-line detail), title "How this is split":
- `SplitRuleList` with four rows and their descriptions verbatim from the prototype: "Even - Divided equally between everyone on the line"; "By weight - Each person's set share of the household"; "By amount - Exact figures, typed per person"; "Mine only - Not shared". (Prototype wording "and never prompted again" is dropped: no prompts exist in this phase.)
- "Who's in it": `CheckRow`-style member list (avatar, name via resolver, checkbox); at least one other person must stay ticked unless the rule is Mine only.
- Result preview card (`fill1`): one row per person with their share to the cent; largest-remainder rounding (ties by join order) so the rows always add to the total; a total row shows "Adds up to $84.00".
- **By amount:** per-person `MoneyInput` rows; a live "Left to assign: $x" line in `warn1` with `sOver` until it is $0.00; "Save split" disabled until it adds up. The split sheet's primary pill is "Save split" for every rule.
- **By weight:** shows the household weights read-only with a text link "Change weights" (Screen 7).
- Applying a rule change to existing unsettled lines: see Screen 7 offer.

**4d. Shared line detail:** extends the existing line detail. Top: avatars of the people on it, `SharedBadge`, "Logged by Paul" and "Paid by Sam" (`meta`). Fields the viewer cannot edit (D-14: amount, date, note unless creator or named payer) render as read-only `LabelValueRow`s with a lock-free explanation `meta` "Paul logged this line. Only Paul or the person who paid can change the amount." Split and the viewer's own category stay editable. Section "Changes" lists `ChangeLine`s ("Sam changed the split", with time) each with Undo while allowed.
- **Stale write refused (D-14, 02 D-26):** `WarningCard` warn tone `sOver` titled "Sam changed this first", body "Sam changed the amount from $80 to $84 at 14:05. Your change wasn't saved." Actions "See their change" (reload) and "Make my change again". Never last-write-wins, never silent.

### 5. Members: role, weight, name, colour (HH-03, HH-04, D-30..D-33)
**Member sheet** (`Sheet`, opened from a People row; own row = "You", full edit of your own display fields; owner can edit role and weights of others via Screen 7 and remove them):
- Header: `MemberAvatar` 40, name via resolver, role chip.
- **Role:** chips Partner, Flatmate (default), Family, Housemate, Lodger, plus "Other" which reveals a `TextInput` (max 24 characters, counter in `meta`, e.g. "Cousin"). Owner is shown as a fixed chip, not a choice, and carries the helper "Owner can invite, remove, rename the household and set its currency." Helper under the chips: "Roles are labels. They don't change what anyone can see or do." (D-31)
- **Colour:** six `SwatchDot` tiles (44 px) with the colour name under each in `meta`; taken ones are disabled (`accessibilityState.disabled`, avatar initial of the holder drawn on them); selected one has the accent ring. Colour name is read aloud by the swatch label ("Rust, taken by Sam").
- **Name shown to others** (D-32; own row only): `SegmentedToggle` "My name" / "My colour". Preview line `meta`: "Others see: Paul" or "Others see: Rust". Helper "Your email and sign-in name are never shown to other members."
- **Weight** row shows the current % and opens Screen 7.
- Primary pill on the member sheet when role, colour or name display has changed: "Save changes".
- Owner-only on other members: "Remove [name]" text button (`danger`), see Screen 8. On own row (non-owner): "Leave household".
- All member-naming strings, including notices, settle-up copy, Decide and the summary link, call `MemberName`/resolver. A hidden name appears everywhere as "Rust" and the sentence still reads naturally ("Rust owes you $84").

### 6. Split rules and category defaults (HH-05, HH-06, D-34, D-35)
- **Household default** sheet: `SplitRuleList` (without "Mine only"; helper "New lines default to this when marked shared."), primary "Save default". Saving writes a `ChangeLine` visible to all ("Sam changed the default to Even") with Undo toast for the actor.
- **Category defaults screen** (pushed from Household): list of categories (`CategoryGlyph` tile + name + current rule on the right, e.g. "By weight", or "Household default"); tap opens `SplitRuleList` for that category plus "Use household default" row; primary "Save split". Helper at top: "Applies once a line is marked shared. Categories never share a line by themselves." (D-13)
- **Apply-to-existing offer (D-35):** after any rule or weight change, a `ConfirmSheet`-style sheet: title "Change the split?", body "New lines use the new split. Lines already logged keep the split they had.", a `ToggleRow` "Also apply to the 7 unsettled lines" (count from the server; row hidden when 0; settled lines never change, `meta` note "Settled lines never change."), primary "Save split" (or "Save weights" when opened from the weights sheet, "Save default" when opened from the household default), secondary "Keep current split". The count is always shown.
- **Notice to others:** "Sam changed Groceries to even" (in-app notice, push where Phase 10 allows).

### 7. Weights (HH-04, D-30)
- Sheet "Weights": a `WeightRow` per member, `heading` percentage, minus/plus in steps of 5 and tap-to-type. A total pill under the list reads "Adds up to 100%" (`sCheck`, accent) at all times; moving one rebalances the others proportionally in whole percents with the largest-remainder rule so the total is always 100.
- **0% is allowed** (Lodger on fixed rent). The row shows `meta` "Pays no share of weighted lines." At least one member must stay above 0: attempting to set the last one to 0 keeps the value and shows `warn1` helper "At least one person has to hold a share. Give someone a share first." (inline, `sOver`, `hapticWarning`).
- Any member can edit (D-34). The primary pill is "Save weights" and opens the apply-to-existing offer (Screen 6). Reduce Motion: percentages update without count animation.
- Equal-start default for a new member joining: the owner is asked nothing; weights are re-split evenly across everyone, the household is told through a `ChangeLine` and a notice ("Sam joined. Weights are now split evenly."), and anyone can edit them afterwards (D-34).

### 8. Settling up (HH-07, HH-08, D-19..D-24)
**8a. Settle-up sheet** (payer or receiver; from the pair sheet; prototype 6046-6083):
- Title "Settle up with Sam". When the household has more than 2 people and the sheet opens from the Household home, the member chips row (`Chip`, selected = accent) picks the person (prototype `stMembers`).
- Summary card (`cardPadLg`): word line `body` ("Sam pays you" / "You pay Sam" / "Nothing outstanding"), `display` total in household currency to the cent, `meta` "N lines covered, M left out".
- **Lines list:** `CheckRow`-style rows, all ticked by default (D-21), each: tick box (44 px target, accent when ticked, `line4` outline when not), line name via resolver, sublabel "Nov 3 · Even · paid by Paul", amount right with sign word instead of colour only ("+$42.00" accent when owed to you, "-$42.00" `ink` when you owe; the sign is the cue, not red). Unticking updates the total live. No free-amount field: `meta` "The amount is exactly the lines ticked."
- **Account picker** rows: payer sees "Paid from" (`Dropdown` of the payer's accounts); the receiver chooses "Arrived in" when confirming (D-22). Settlement is not spending or income: `meta` "This moves money between accounts. It is not spending or income."
- Cross-currency: `meta` "Household amounts are in USD. Your account is in GBP, so the rate on today's date is stored with it." Rate shown as "1 USD = 0.7874 GBP".
- Primary pill label follows the role: payer "Tell Sam you paid $84" -> creates a pending settle-up; receiver "Record $84 received" -> settles at once (D-24). The payer label is "Tell Sam you paid $84". Disabled with `accessibilityState.disabled` when total is $0.00.
- Success toast: payer "Waiting for Sam" (neutral); receiver "Settled $84.00 with Paul" + Undo within the toast window. Light haptic on save; `hapticSuccess` only when a receiver's "Yes, I got $84" completes a settle-up.

**8b. Pending states**
- Payer: pair row chip "Waiting for Sam" (`warn1`, `sClock`), detail card "Waiting for Sam. Reminder goes out on day 7 and this lapses on day 14 if there is no answer." with text button "Cancel settle-up" (returns the lines to owed).
- Receiver: in-app notice and a card on Household home: "Paul says he paid you $84" with two buttons side by side: "Yes, I got $84" (primary, accent; amount interpolated in household currency) and "Not yet" (outline). "Yes, I got $84" opens the "Arrived in" account picker (one row + "Confirm"), then locks the lines, writes the record on both sides, `hapticSuccess`. "Not yet" returns the lines to owed on both sides and tells Paul: "Sam hasn't received it yet."
- Day 7 reminder (both people): "Waiting on Sam to confirm $84. Sent Nov 3." Day 14 lapse (both people, notice): "The $84 settle-up with Sam lapsed. The lines are owed again." Nothing ever settles silently.
- Locked lines show a `StateChip`-style "Settled" (accent, `sCheck`) in Activity and in the line detail; they stay visible and stop counting toward the balance.

**8c. Ask to settle:** receiver-side outline pill "Ask Sam to settle up" sends a nudge notice: "Paul asked you to settle up $84." with action "Settle up with Paul". Rate-limited to once per 24 hours per pair; the button shows the sent time afterwards.

### 9. Own vs household figures (HH-09)
- Scope switch `SegmentedToggle` "Mine" / "Household" appears on Home and Insights wherever 05.5 defined `countsForMe` and only when the household has 2+ people. Default Mine. Choice persists per screen.
- Household scope shows shared lines only, in household currency; Mine shows personal records plus the user's share of shared lines (ENG-25). Label under the figure: "Your records plus your share of shared lines" / "Shared lines only, in USD".
- Hidden names (HH-10): scope Household lists lines by what they are, with member names via resolver. When names are hidden, colour names show ("Rust paid $84"). Settlement lines are excluded from both scopes by the one "is settlement" rule.

### 10. Read-only summary link (HH-11, D-12 switch `hh.summaryLink`)
Sheet (prototype ~3803-3818, ~6086-6093), title "Read-only summary", subtitle household name:
- Note `meta`: "Shows the balance and the shared lines behind it, and nothing else. No account to make, nothing to install, and nothing on the page can be changed. It leaves out Decide data and personal records." 
- Link box (`fill1`, `radii.card`): URL in `body` (selectable), two buttons "Copy link" and "Share" (`Pill` outline, 44 px).
- **Expiry chips** `Chip` row: "24 hours", "7 days" (default selected), "30 days"; label "Stops working Nov 17" updating with the chip.
- `ToggleRow` "Show what each line was for" with sub `meta` "On: line names are included. Off: categories only, names withheld." Names and member names still go through the resolver when on.
- Text button "Stop sharing this link" (min 44) with `ConfirmSheet` "Stop sharing? The link stops working right away." / "Stop sharing" (danger variant) / "Keep it". Creating a link is a light-haptic action with toast "Link ready".
- The shared page itself is a read-only web page (Screen 12 tokens): household name, "As of Nov 10 · amounts in USD", the who-owes sentence, one line per member pair, then "Lines counted (unsettled)" with date, name or category, total, rule, "paid by", and footer "Read-only snapshot. Nothing here can be changed from the link. FincWin holds no money." It has no sign-in, no editing and no Decide data, and the token is long enough not to be guessed.

### 11. Leaving, removing, ownership, deletion (HH-12, HH-13, HH-14, D-25..D-29)
All use `ConfirmSheet` (title, body, primary, secondary) and `ToastView`.
- **Leave (member):** title "Leave Flat 4B?". Body: "Your personal records come with you. Each shared line you were on becomes a personal copy of your share. Flat 4B keeps the originals." With an open balance, an extra `WarningCard` above (warn tone, `sOver`): "You owe Paul $40. It stays on both sides as "[Your name] (left)" and either of you can settle or write it off later." Primary "Leave household" (danger variant), secondary "Stay". After: full-screen calm page "You're no longer in Flat 4B" (copy below) then Home; toast "You left Flat 4B".
- **Leave (owner):** first step is a required "Pick the new owner" radio list (`RadioDot` rows, member avatar + name, 64 px); primary "Make [name] the owner and leave" disabled until one is chosen. Only after that, the Leave confirm above. If the owner is alone, "Leave" is not offered; deleting the household happens through account deletion.
- **Remove (owner on a member):** title "Remove Sam from Flat 4B?". Body: "Sam's personal records move to a household of their own. Lines Sam was on keep the split you gave them. Sam is told, and you can undo this for 24 hours by inviting Sam again." Primary "Remove Sam" (danger variant), secondary "Keep Sam". Success toast "Sam removed" + Undo (Undo = re-invite window of 24 hours, restoring line links). Open balance: same warning card as Leave from the owner's side ("Sam owes you $40. It stays as "Sam (left)".").
- **Removed member sees** (on next open, one `Sheet`, not a blocked screen): title "You're no longer in Flat 4B", body "Your personal records are still yours and are in your own household now. Lines you were on are saved as personal copies of your share." Primary "Got it".
- **Undo window:** the Household home shows a card for 24 hours: "Sam was removed. Invite Sam again to reconnect their lines." with action "Invite again" (owner only).
- **Account deletion (CMP-F23, D-27, D-29):** extends the existing delete-account flow; an extra paragraph appears only for users in a household with others: "Shared lines you created stay in Flat 4B, shown as "Former member". Everything personal is erased. Balances others are owed stay correct." If the user is owner: "[Next-earliest member] becomes the owner and is told." No owner-picking step; deletion is never blocked. Existing typed-confirm / final step is unchanged. Remaining members see "Former member" in place of the name everywhere, rendered through the resolver (colour retained, avatar initial "?" replaced by a person glyph).
- **Ownership notice** to the new owner: "You're now the owner of Flat 4B."

### 12. Invite web page (D-07, HH-15) - small static page
Hosted static page for the invite link (separate from the summary-link page; both share this section's tokens). Plain HTML/CSS, no framework, no scripts beyond copy-to-clipboard and an optional tiny platform check. No tracking, no cookies, no third-party fonts or images.

Tokens: same hex values as `tokens.ts` (page CSS variables generated from `tokens.ts` at build time or copied verbatim; no new colours): background `canvas` #FBFAF7, card `surface` #FFFFFF with the `card` shadow approximation, text `ink` #14150F, secondary text `inkMuted` #6E6A5E, button fill = default accent #1B4D3E with `surface` text, outline buttons `ink` border, code box `fill1` #F1EFE8. Fonts: the default pairing's display and body faces self-hosted, falling back to system sans-serif. Sizes mirror the app scale: title 26 / 700, body 15, label 13, meta 12.5. Max content width 420 px, centred; page padding 22 px; card radius 26 px; button radius 999 px and height 52 px; all targets at least 44 px.

Content, in order:
1. Wordmark "FincWin" (existing brand asset only), small.
2. Card: line 1 (heading) "Paul invited you to Flat 4B" (names resolved at render from the server; if the inviter's name is hidden, "Someone invited you to Flat 4B"; the page never shows email addresses). Line 2 body: "Share money with the people you live with. Your records stay private. Only lines you mark shared are seen by the household."
3. Buttons stacked: "Download on the App Store" and "Get it on Google Play" (plain pills with these store names until the apps are live, then the official badges are swapped in). Below, `meta`: "Already have the app? Open it and enter the code below."
4. **Code box** (`fill1`, radius 18): label "Your invite code", code in 26 px bold with grouped characters, a "Copy code" button, `meta` "Works once, for one person. Expires Nov 17."
5. If the invite is expired, used, cancelled or unknown, the whole card is replaced by one neutral message (identical for all four causes so nothing is revealed): "This invite has run out or was already used. Ask the person who invited you for a new one." No store buttons removed.
6. Footer `meta`: "FincWin is a money-management tool. It holds no money and is not a financial institution." plus Privacy and Terms links.
- Accessibility: semantic landmarks, `lang` set, contrast at or above the app's token pairs (`ink` on `canvas`), focus rings in `ink`, copy button announces "Code copied" via `aria-live="polite"`, works at 200% zoom with no horizontal scroll, `prefers-reduced-motion` honoured (no animation used anyway).
- Opening on a phone with the app installed: universal/app link hands off to the app code screen with the code prefilled (Screen 3); the web page is the fallback.

### 13. Decide connection point (BO-07 point 6, D-36, D-37, HH-14 partner opt-in) - household side only
No Decide screens are built here (08.1). This phase delivers three pieces:
- **Partner opt-in setting:** Household home > People > own row > `ToggleRow` "Count [Sam]'s money in my Decide checks" is shown per partner and is **off by default**. Helper `meta` "Only a single rounded total is used. Sam's records are never shown to you. Sam has to say yes on their side too." The row is two-sided: state reads "Waiting for Sam to agree" (`sClock`) until both are on, then "On for both of you". Turning it off is immediate and needs no consent.
- **My share caveat row** (data the 08.1 Decide screen reads; copy fixed here): when a partner has not logged shared bills recently, the caveat string is exactly "Sam hasn't logged shared bills since 3 Nov, so shared costs may be higher". Rendered through the resolver (hidden name -> "Rust hasn't logged shared bills since 3 Nov, so shared costs may be higher"). It is a `WarningCard` warn-tone note (not a block; Decide still answers, D-37). The same component is exported for 08.1.
- **Safety net sharing (D-36):** under Household > "Shared safety net" row (couples only): `ToggleRow` "Share this safety net" with helper "When on, one safety net protects both people's Decide checks. Your checks stay your own." Off by default.
- "Settlements are excluded" appears nowhere in copy; it is an engine rule.

---

## Empty States

| Place | Heading | Body | Action |
|-------|---------|------|--------|
| Household home, alone | Just you for now | Invite the people you share money with. Each person keeps their own records private. | Invite someone |
| Balances, all square | Everyone is square | Nothing is owed in Flat 4B right now. | (none) |
| Pending invites none | (section hidden) | | |
| Shared accounts none | No shared accounts | A joint account's new lines start shared, and members can see its balance. | Make a joint account |
| Recent changes none | Nothing has changed yet | Joins, split changes and settle-ups show up here. | (none) |
| Lines behind a balance none | No lines behind this | Shared lines you both log will appear here. | (none) |
| Category defaults none set | Using the household split for every category | Pick a different split for one category if you want. | (row actions) |

---

## Error and Edge States

- **Save failed offline:** reuse the write queue and `FailedWritesSheet`: "Couldn't save. It will retry when you're back online." Settle-up creation, invites, removals, rename and currency change need a connection and say so inline (they are not queued, to avoid a settle-up replaying after its lines changed).
- **Version conflict:** see 4d. Two clients, one offline mid-edit: on reconnect the queued write replays; if refused, the conflict card above names who changed what and offers both paths. Realtime echoes of your own write are silent. A genuine remote change to an open screen updates in place with a polite live-region announcement ("Sam changed the split") and a `meta` "Updated just now" flash line (no looping animation).
- **Realtime lost:** `SyncStatusLine` shows "Live updates paused. Reconnecting." and falls back to pull-to-refresh; shared screens show the cached `meta` "As of 14:05".
- **Invite problems:** see Screen 3. **Household full:** owner sees "Flat 4B already has 6 people. Remove someone before inviting another." on Send invite.
- **Weights:** see Screen 7. **Last member above 0:** guarded as written.
- **Settle-up on changed lines:** if a line included in a pending sheet is edited or settled elsewhere before confirm, the sheet shows `WarningCard` "Some lines changed. Review the total." and recomputes; confirm is blocked until the user taps "Review".
- **Privacy tripwire (not user-facing):** a personal row must never reach another member's screen, cache, export or Realtime payload (CMP-F18, ARC-22). UI work adds no query that fetches `household`-wide rows without the shared flag.
- **Couldn't load:** same generic card as Grow: `sQuestion` glyph, "Couldn't load this right now", body "Your records are safe. Check your connection and try again.", text button "Try again". Offline with no cache: "You're offline. Connect to load this."
- **Member removed while screen open:** the open screen is replaced by the removed-member sheet from Screen 11.

---

## Notices (in-app minimum; push where Phase 10 allows)

An in-app **Notices** list (opened from the Household home header action "Notices" with an unread count `Chip`; the same small count shows on the Household row in You; no tab dot, no bell, no new tab) of `ChangeLine`-style items, newest first. Exact copy (all names through the resolver):

| Event | Copy |
|-------|------|
| Joined | Sam joined Flat 4B |
| Removed (to removed person) | You're no longer in Flat 4B |
| Left | Sam left Flat 4B |
| Made private | Paul made a line private |
| Split changed | Sam changed the split on [line] / Sam changed Groceries to even |
| Weights changed | Sam changed the weights |
| Settle-up request | Paul says he paid you $84 (actions "Yes, I got $84" / "Not yet") |
| Settle-up waiting (day 7) | Waiting on Sam to confirm $84 |
| Settle-up lapsed (day 14) | The $84 settle-up with Sam lapsed. The lines are owed again. |
| Settle-up not yet | Sam hasn't received it yet |
| Settled | Settled $84 with Sam |
| Ask to settle | Paul asked you to settle up $84 |
| Owner change | You're now the owner of Flat 4B |

Notices never use "should" or "advise". Tapping one opens the relevant screen.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTAs | "Invite someone", "Send invite", "Check code", "Join Flat 4B", "Settle up with [Name]", "Tell Sam you paid $84", "Record $84 received", "Yes, I got $84", "Save weights", "Save split", "Save default", "Save changes"; info sheets close with "Got it". Secondary labels are contextual: "Keep current split", "Cancel settle-up", "Keep it", "Stay", "Not yet" (no bare "Save" or "Cancel" anywhere) |
| Empty state heading | "Just you for now" (Household home); see table above |
| Empty state body | See table above (always with a next step where one exists) |
| Error state | Problem + path, e.g. "This invite has run out or was already used. Ask Paul for a new one." / "Couldn't save. It will retry when you're back online." |
| Destructive confirmations | Leave: "Leave Flat 4B? Your personal records come with you. Each shared line you were on becomes a personal copy of your share." Remove: "Remove Sam from Flat 4B? ... you can undo this for 24 hours by inviting Sam again." Write off: "Write off $40 with Sam (left)? The lines stay in your record as written off." Stop link: "Stop sharing? The link stops working right away." Delete account addition: "Shared lines you created stay in Flat 4B, shown as "Former member". Everything personal is erased." |
| Toasts | "Sam joined", "Invite cancelled" (Undo), "Link ready", "Line made private" (Undo), "Sam removed" (Undo), "You left Flat 4B", "Waiting for Sam", "Settled $84.00 with Sam" (Undo), "Household renamed" (Undo), "Weights saved" (Undo) |
| What's shared card | "Your records stay private. Only lines you mark shared are seen by Flat 4B. Your Decide checks are never shared." |
| Positioning line (footer on Household home and invite page) | "FincWin records who owes whom. It holds no money and moves none." |

Compliance voice rules (hard): declarative, not prescriptive. Never "advice", "recommend", "you should", "better", "best", "optimal" in any Household copy. Settle-up copy states a balance and records a payment between people; it never says FincWin pays, collects, transfers or guarantees anything. Named copy always attributes a change to a person ("Sam changed...") and says who can undo. Plain English, about grade 10, short sentences.

---

## Interaction and Motion

- Sheets: app `Sheet` (slide 0.24 s, drag to dismiss, backdrop). Reduce Motion: cross-fade 0.15 s (`useReduceMotion` / `useMotion`).
- Haptics via `src/ui/haptics.ts`: `hapticLight` on every save, send, join, tick; `hapticWarning` only for a guarded zero-weight attempt, an amount-split that does not add up on save, or a refused stale write; `hapticSuccess` only on a completed "Yes, I got $84" settle-up and on a successful join. None for navigation, scope switch, chip selection.
- No looping animation; no count-up animation on balances.
- Realtime updates patch the cache in place; lists do not reorder under the user's finger while a sheet is open (apply on close).

## Accessibility

- All interactive targets >= 44 x 44 (`space.touchMin`), including tick boxes, steppers, swatches, role chips and "Undo" in toasts (extend hit slop).
- Member identity: every avatar has the name text beside it or an `accessibilityLabel` of "Sam, Partner, 45 percent"; colour is read as a word ("Rust"). Hidden names are read as the colour name.
- Roles: `SplitRuleList` and swatches are radio groups (`accessibilityRole="radio"`, `selected`); `SegmentedToggle` as `tablist`/`tab`; weights stepper `adjustable` ("Sam's weight, 45 percent, adjustable"); tick boxes `checkbox` with checked state ("Groceries, 42 dollars, ticked"); pending chips read their state ("Waiting for Sam to confirm 84 dollars").
- Totals that change (weights total, settle-up total, left-to-assign) are `accessibilityLiveRegion="polite"` and announce via `announceForAccessibility`, debounced 600 ms after the last change (`useSettledLabel`, Phase 5 D-56). Never every keystroke.
- Colour never the only signal: owed vs owing uses words and signs; pending/settled/lapsed use shape + word; member colours always paired with name or initial.
- Text scaling to 200% (Pixel text-fit matrix 402 dp / 320 dp): rows grow from one to two lines before truncating; amounts never truncate (label wraps); side-by-side "Yes, I got $84 / Not yet" and "Copy link / Share" stack vertically above font scale 1.3; six swatches wrap to two rows; invite page reflows with no horizontal scroll.
- Invite code field supports paste, autofill from clipboard prompt only on user tap, and screen-reader grouped reading of the code ("A, 7, K, 2 ...").
- Reduce Motion handled as above.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not used) | not applicable |
| third-party | none | not applicable |

New npm dependencies for the app: none required. The invite and summary web pages are static HTML/CSS with no packages beyond the build step that emits token variables.

---

## Resolved owner decisions (2026-11-10)

1. **Recent changes list:** everyone in the household sees all changes, with who made them (Screen 1 item 6).
2. **Notices before Phase 10 push:** a Notices list on the Household screen, with a small count on the Household row in You. No tab dot (Navigation, Notices).
3. **New member weights:** re-split evenly across everyone, and the household is told. Anyone can edit afterwards (Screen 7).
4. **Settle-up nudge:** once every 24 hours per pair (Screen 8c).
5. **Invite page store buttons:** plain pills with the store names until the apps are live, then the official badges are swapped in (Screen 12).

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
