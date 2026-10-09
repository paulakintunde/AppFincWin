---
phase: quick-261009-mvn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/you/components/HomeCurrencyChangeSheet.tsx
  - src/features/you/__tests__/HomeCurrencyChangeSheet.test.tsx
  - src/i18n/locales/en.ts
  - src/ui/Dropdown.tsx
  - src/ui/__tests__/Dropdown.test.tsx
  - src/features/record/activity/ActivityHeader.tsx
  - src/features/record/activity/__tests__/ActivityIntegration.test.tsx
  - src/db/errors.ts
  - src/data/mutations/addMonth.ts
  - src/data/mutations/dismissedOffers.ts
  - src/data/mutations/__tests__/addMonth.test.tsx
  - src/data/mutations/__tests__/dismissedOffers.test.tsx
autonomous: true
requirements: [REC-25, REC-19, REC-21]
must_haves:
  truths:
    - "A home-currency change rejected as a version conflict ('changed') leaves the sheet open with a visible declarative line saying the settings changed elsewhere and the home currency is unchanged"
    - "The open Activity More menu shows no selected radio dot beside Clone or Paste; its trigger still reads 'More'"
    - "View and Sort dropdowns still mark their current option as selected"
    - "A failed add-month write is recorded with entity 'households'; a failed dismiss-offers write with entity 'dismissed_series_offers'; record prefs stay 'profiles'"
  artifacts:
    - path: "src/db/errors.ts"
      contains: "'dismissed_series_offers'"
    - path: "src/ui/Dropdown.tsx"
      provides: "optional value (action-menu mode) + triggerLabel prop"
    - path: "src/i18n/locales/en.ts"
      contains: "changedElsewhere"
  key_links:
    - from: "src/features/record/activity/ActivityHeader.tsx"
      to: "src/ui/Dropdown.tsx"
      via: "MoreMenu renders Dropdown with triggerLabel and no value"
      pattern: "triggerLabel=\\{label\\}"
---

<objective>
Close three Phase 02.2 follow-ups: (1) the home-currency sheet stops failing silently on a version
conflict, (2) the Activity More menu stops showing a fake selected Clone row, (3) failed-write
records name the table that was actually written.

Purpose: honest UI state and accurate failed-write diagnostics.
Output: code + tests; no schema changes. (Item 4 — leftover folders — is already done; do not touch.)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Workspace: git worktree `C:/dev/fincwin-q1`, branch `fix/02.2-followups`. All paths below are relative
to it. Do not touch other checkouts.

@CLAUDE.md
@.planning/phases/02.2-record-polish/02.2-UI-SPEC.md (section 15 "Home currency change", lines ~266-270)

<interfaces>
From src/data/mutations/homeCurrency.ts:
```ts
export type HomeCurrencyChangeResult = { ok: true; capsConverted: number } | { ok: false; reason: 'rates' | 'changed' };
```

Current HomeCurrencyChangeSheet failure handling (src/features/you/components/HomeCurrencyChangeSheet.tsx):
```ts
const [failed, setFailed] = useState(false);
...
if (result.reason === 'changed') { close(); return; }   // <- silent, the bug
setFailed(true);
...
{failed ? (<Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('you.homeCurrency.failed')}</Text>) : null}
```

i18n block `you.homeCurrency` in src/i18n/locales/en.ts (~line 124) has keys: label, confirmTitle,
confirmBody, keepsAmounts, cancel, confirm, fetching, failed ('Couldn’t get today’s rates. Home currency
is unchanged. Try again.'), done, capsConverted. Copy uses typographic apostrophe ’.
src/i18n/__tests__/recordPolishCopy.test.ts checks every string under `you.homeCurrency` against
/\b(advice|advise|recommend|recommendation|should)\b/i and /device/i.

From src/ui/Dropdown.tsx:
```ts
export interface DropdownOption<K extends string> { key: K; label: string; subLabel?: string; triggerLabel?: string; }
export interface DropdownProps<K extends string> {
  title: string; options: readonly DropdownOption<K>[]; value: K; onSelect: (key: K) => void;
  triggerA11yLabel: string; disabled?: boolean; variant?: 'pill' | 'row'; rowLabel?: string;
}
// trigger text: current?.triggerLabel ?? current?.label ?? ''
// each row renders <View testID={`dropdown-dot-${o.key}`} ...> radio dot; accessibilityState={{ selected }}
```

ActivityHeader MoreMenu (src/features/record/activity/ActivityHeader.tsx ~line 40-60) sets
`triggerLabel: label` on both options and passes `value="clone"` purely so the trigger reads "More".
Integration tests at src/features/record/activity/__tests__/ActivityIntegration.test.tsx:314-330 open
More via `getByLabelText('More actions. Opens a menu.')`.

From src/db/errors.ts:
```ts
export type WriteEntity = 'transactions' | 'accounts' | 'custom_currencies' | 'profiles' | 'categories'
  | 'recurring_series' | 'undo_log' | 'import_profiles';
```
Consumers: src/data/sync/failedWrites.ts (FailedWrite.entity), src/data/sync/versionChain.ts
(string key only), casts in patches.ts/categories.ts. No exhaustive switch/Record over WriteEntity exists
(engine/undo/inverse.ts switches on UndoEntity, a separate type) — typecheck confirms.

Verified table targets:
- addMonth.ts calls rpc `add_activity_month`, which advances `households.horizon_month`
  (fetchHouseholdHorizon reads `households`) -> entity must be 'households';
  entityId becomes vars.householdId (the row the write targets), not vars.undo.id.
- dismissedOffers.ts upserts into `dismissed_series_offers` -> entity 'dismissed_series_offers' (entityId stays vars.userId; rows are keyed per user).
- recordPrefs.ts updates `profiles` (src/db/recordPrefs.ts updateRecordPrefs `.from('profiles')`) -> 'profiles' is CORRECT; leave it and its test (recordPrefs.test.tsx:84) unchanged.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Home-currency sheet reports a version conflict instead of closing silently</name>
  <files>src/features/you/components/HomeCurrencyChangeSheet.tsx, src/i18n/locales/en.ts, src/features/you/__tests__/HomeCurrencyChangeSheet.test.tsx</files>
  <read_first>src/features/you/components/HomeCurrencyChangeSheet.tsx, src/features/you/__tests__/HomeCurrencyChangeSheet.test.tsx (cases at lines 74 and 85), src/i18n/locales/en.ts lines 120-140, UI-SPEC section 15</read_first>
  <behavior>
    - 'changed' result: sheet stays open (onClose NOT called), alert text "Your settings changed elsewhere. Home currency is unchanged." visible, no success toast (showToast not called).
    - 'rates' result: unchanged — sheet open, the existing 'failed' line shown, and NOT the changed line.
    - Pressing Confirm again clears the previous failure line before the next attempt; Cancel/close clears it.
  </behavior>
  <action>
    Decision (planner discretion): sheet-stays-open-with-inline-message, mirroring the existing 'rates'
    failure path (UI-SPEC §15 presents failures inline in the sheet with "Home currency is unchanged";
    no toast). This keeps both failure paths consistent.
    1. en.ts: add `changedElsewhere: 'Your settings changed elsewhere. Home currency is unchanged.'` inside
       `you.homeCurrency` (after `failed`). Declarative; no "advice/recommend/should/device".
    2. Sheet: replace `const [failed, setFailed] = useState(false)` with
       `const [failure, setFailure] = useState<'rates' | 'changed' | null>(null)`. `close()` and the start of
       `onConfirm` reset to null. On `!result.ok` set `setFailure(result.reason)` (delete the
       `if (result.reason === 'changed') { close(); return; }` branch). Render the same alert `<Text>` when
       `failure !== null` with text `t(failure === 'changed' ? 'you.homeCurrency.changedElsewhere' : 'you.homeCurrency.failed')`.
       Update the header comment to mention the conflict line.
    3. Test: rewrite the case at line 85 to "changed elsewhere keeps the sheet open with the unchanged line":
       assert onClose not called, showToast not called, getByText of the new string. Add to the 'rates'
       case `queryByText('Your settings changed elsewhere. Home currency is unchanged.')` is null.
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-q1 && npx jest --no-watchman --runInBand --forceExit src/features/you src/i18n</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "changedElsewhere" src/i18n/locales/en.ts` = 1; `grep -c "changedElsewhere" src/features/you/components/HomeCurrencyChangeSheet.tsx` >= 1
    - `grep -n "reason === 'changed'" src/features/you/components/HomeCurrencyChangeSheet.tsx` returns nothing
    - recordPolishCopy.test.ts and HomeCurrencyChangeSheet.test.tsx pass
  </acceptance_criteria>
  <done>A version conflict shows a declarative inline line in the still-open sheet; rates failure unchanged; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dropdown action-menu mode (no selected row) for the Activity More menu</name>
  <files>src/ui/Dropdown.tsx, src/ui/__tests__/Dropdown.test.tsx, src/features/record/activity/ActivityHeader.tsx, src/features/record/activity/__tests__/ActivityIntegration.test.tsx</files>
  <read_first>src/ui/Dropdown.tsx, src/ui/__tests__/Dropdown.test.tsx, src/features/record/activity/ActivityHeader.tsx, ActivityIntegration.test.tsx lines 300-340</read_first>
  <behavior>
    - Dropdown with `value` omitted and `triggerLabel="More"`: trigger renders "More"; when opened no `dropdown-dot-*` testID exists for any option and no row has accessibilityState.selected true; selecting a row still calls onSelect(key) once, fires haptic, closes.
    - Dropdown with `value` set (View/Sort usage): unchanged — selected row dot shown, trigger shows the current option's triggerLabel ?? label.
    - Activity More menu opened: Clone and Paste rows visible, no dropdown-dot-clone / dropdown-dot-paste; trigger text "More".
  </behavior>
  <action>
    1. Dropdown.tsx: make `value?: K` optional and add `triggerLabel?: string` to DropdownProps, with a doc
       comment: "Omit `value` for an action menu: no row is selected and no radio dots render; the
       trigger shows `triggerLabel`." Compute `const actionMenu = value === undefined;`
       trigger text = `triggerLabel ?? current?.triggerLabel ?? current?.label ?? ''`. In option rows,
       render the dot `<View testID=dropdown-dot-…>` only when `!actionMenu`; pass
       `accessibilityState={actionMenu ? undefined : { selected }}`. Update the file header comment
       (D-27) to mention action-menu mode. No new tokens/colours.
    2. ActivityHeader.tsx MoreMenu: drop `triggerLabel: label` from both options, remove `value="clone"`
       and its stand-in comment, pass `triggerLabel={label}`. View/Sort dropdowns untouched.
    3. Dropdown.test.tsx: add an "action menu (no value)" describe: trigger label shown, no dots
       (`queryByTestId('dropdown-dot-a')` null for each key), selecting calls onSelect once and closes.
       Keep existing tests passing (they pass `value`).
    4. ActivityIntegration.test.tsx: in the 'More offers Clone…' case, after opening assert
       `queryByTestId('dropdown-dot-clone')` and `queryByTestId('dropdown-dot-paste')` are null.
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-q1 && npx jest --no-watchman --runInBand --forceExit src/ui/__tests__/Dropdown.test.tsx src/features/record/activity && npm run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'value="clone"' src/features/record/activity/ActivityHeader.tsx` returns nothing
    - `grep -n "value?: K" src/ui/Dropdown.tsx` matches; `grep -n "triggerLabel={label}" src/features/record/activity/ActivityHeader.tsx` matches
    - Dropdown, Activity tests and typecheck pass
  </acceptance_criteria>
  <done>More menu opens with no selected dot, trigger still "More"; View/Sort behaviour unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Failed-write records name the real table</name>
  <files>src/db/errors.ts, src/data/mutations/addMonth.ts, src/data/mutations/dismissedOffers.ts, src/data/mutations/__tests__/addMonth.test.tsx, src/data/mutations/__tests__/dismissedOffers.test.tsx</files>
  <read_first>src/db/errors.ts, src/data/mutations/addMonth.ts lines 60-90, src/data/mutations/dismissedOffers.ts lines 40-60, the two test files (find how recordFailedWrite is mocked/asserted; recordPrefs.test.tsx:84 shows the pattern)</read_first>
  <behavior>
    - addMonth rejected write -> recordFailedWrite called with objectContaining({ entity: 'households', entityId: householdId, attempted: { month } }).
    - dismissOffers rejected write -> recordFailedWrite called with objectContaining({ entity: 'dismissed_series_offers', entityId: userId, attempted: { count } }).
  </behavior>
  <action>
    1. errors.ts: add `| 'households'` and `| 'dismissed_series_offers'` to WriteEntity; update its doc comment
       to "The tables the app mutates through db/data (failed-write and version-chain keys)".
    2. addMonth.ts onError: `entity: 'households'`, `entityId: vars.householdId` (add_activity_month advances
       households.horizon_month; the undo id is not a households row). Keep attempted `{ month }` and code logic.
    3. dismissedOffers.ts onError: `entity: 'dismissed_series_offers'` (entityId stays vars.userId, attempted stays counts only per T-02.2-23-03).
    4. recordPrefs.ts: no change — verified it writes `profiles` (src/db/recordPrefs.ts updateRecordPrefs). Leave a
       note in SUMMARY.
    5. Tests: in addMonth.test.tsx and dismissedOffers.test.tsx, add/extend the rejected-write case to assert the
       entity (and entityId) above, following recordPrefs.test.tsx:84's `expect.objectContaining` pattern.
    6. Run `npm run typecheck` to confirm no exhaustive switch/Record over WriteEntity breaks (none expected).
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-q1 && npx jest --no-watchman --runInBand --forceExit src/data/mutations/__tests__/addMonth.test.tsx src/data/mutations/__tests__/dismissedOffers.test.tsx src/data/mutations/__tests__/recordPrefs.test.tsx && npm run typecheck && npm run lint</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "'households'\|'dismissed_series_offers'" src/db/errors.ts` = 2
    - `grep -n "entity: 'transactions'" src/data/mutations/addMonth.ts` returns nothing; `grep -n "entity: 'households'" src/data/mutations/addMonth.ts` matches
    - `grep -n "entity: 'profiles'" src/data/mutations/dismissedOffers.ts` returns nothing
    - `grep -n "entity: 'profiles'" src/data/mutations/recordPrefs.ts` still matches
  </acceptance_criteria>
  <done>WriteEntity covers households and dismissed_series_offers; both mutations record the true table; tests, typecheck and lint green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> local failed-write log | records ids and minimal attempted payloads |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-q261009-01 | I | dismissedOffers onError attempted payload | mitigate | keep `{ count }` only (offer keys embed merchant names, T-02.2-23-03); test asserts attempted shape |
| T-q261009-02 | T | HomeCurrencyChangeSheet conflict path | accept | server change_home_currency remains all-or-nothing; UI only reports, never claims a change |
</threat_model>

<verification>
cd C:/dev/fincwin-q1 && npx jest --no-watchman --runInBand --forceExit src/features/you src/i18n src/ui src/features/record/activity src/data/mutations && npm run typecheck && npm run lint
</verification>

<success_criteria>
- Version conflict on home-currency change shows an inline declarative line, sheet stays open.
- More menu shows no selected dot; View/Sort unchanged.
- Failed-write entity names match the real tables; recordPrefs confirmed on profiles.
- All listed tests, typecheck, lint pass.
</success_criteria>

<output>
Create `.planning/quick/261009-mvn-phase-02-2-follow-ups-home-currency-conf/261009-mvn-SUMMARY.md`
</output>
