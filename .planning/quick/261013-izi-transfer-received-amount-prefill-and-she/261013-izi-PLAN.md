---
phase: quick-261013-izi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/record/entry/receivedPrefill.ts
  - src/features/record/entry/__tests__/receivedPrefill.test.ts
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/__tests__/TransactionSheet.test.tsx
  - src/theme/tokens.ts
  - src/ui/Sheet.tsx
  - src/ui/__tests__/Sheet.scrim.test.tsx
autonomous: true
requirements: [02.3-WALKTHROUGH-FX-PREFILL, 02.3-WALKTHROUGH-SHEET-SCRIM]

must_haves:
  truths:
    - "On a new cross-currency transfer with a stored rate, 'Amount received' fills itself from the sent amount at the latest stored rate"
    - "While the received field is untouched, changing the sent amount or either account recomputes it"
    - "After the user types in the received field (any keypad press, including backspace or long-press clear), it is never overwritten again for that entry"
    - "With no stored rate for either currency, the received field stays empty"
    - "Editing a saved transfer, or reloading a list item that already carries a received amount, keeps that saved value. It is never recomputed."
    - "Save still reads whatever the received field holds; validation and save code are unchanged"
    - "Every Sheet, including one stacked over another, shows a dim semi-transparent black scrim behind it, and tapping the scrim still dismisses"
  artifacts:
    - path: "src/features/record/entry/receivedPrefill.ts"
      provides: "Pure prefill helper: sent text + currencies + stored rates -> received input text ('' when it cannot be computed)"
      exports: ["prefillAmountInText"]
    - path: "src/theme/tokens.ts"
      provides: "colors.scrim token"
      contains: "scrim:"
    - path: "src/ui/Sheet.tsx"
      provides: "Backdrop coloured with colors.scrim, testID sheet-backdrop"
      contains: "colors.scrim"
  key_links:
    - from: "src/features/record/entry/TransactionSheet.tsx"
      to: "useFxLatest + prefillAmountInText"
      via: "useEffect that writes amountInText while amountInManual is false"
      pattern: "prefillAmountInText\\("
    - from: "src/features/record/entry/TransactionSheet.tsx Keypad onChange"
      to: "amountInManual flag"
      via: "an 'in' keypad change sets the manual flag"
      pattern: "setAmountInManual\\(true\\)"
    - from: "src/ui/Sheet.tsx backdrop Pressable"
      to: "colors.scrim"
      via: "inline backgroundColor from useTheme()"
      pattern: "backgroundColor: colors\\.scrim"
---

<objective>
Two approved Phase 02.3 device-walkthrough follow-ups:
(1) Prefill a cross-currency transfer's "Amount received" from the latest stored FX rate until the user edits it.
(2) Put a dim scrim behind every Sheet, using one new theme token.

Purpose: the received figure is the one people least want to work out by hand. Without a scrim, a stacked sheet (AccountSheet over AccountPicker) does not read as layered.
Output: a pure prefill helper and its tests, TransactionSheet wiring and tests, a `colors.scrim` token, a coloured Sheet backdrop and its test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Repository root: C:/dev/fincwin-fix (git worktree, branch fix/02.3-walkthrough). Work only under this root, never under C:/dev/fincwin.
- node_modules is a junction. Do not touch, delete or reinstall it.
- Commit on fix/02.3-walkthrough. Do not push.
- Do not edit .planning/STATE.md or .planning/ROADMAP.md.

@C:/dev/fincwin-fix/CLAUDE.md
@C:/dev/fincwin-fix/src/features/record/entry/EntryNotes.tsx
@C:/dev/fincwin-fix/src/ui/Sheet.tsx

<interfaces>
From src/engine/money (barrel; EntryNotes imports these):
```ts
convertMinor(amount: MinorUnits, fromPerEur: ScaledRate, fromExponent: number, toPerEur: ScaledRate, toExponent: number): MinorUnits  // half-up rounding, throws RangeError on bad exponent / overflow
minorUnits(n: number): MinorUnits
type ScaledRate
```
From src/data/queries/homeAmount.ts:
```ts
latestPerEur(rates: readonly FxLatestRow[], code: string): ScaledRate | null   // EUR -> EUR_PER_EUR; missing/unparseable -> null
```
From src/data/queries/fxLatest.ts: `useFxLatest()`, a TanStack query. Use `useFxLatest().data ?? []`. It reads the cached stored rates and never fetches on demand.
FxLatestRow shape (as in tests): `{ quote: 'GBP', rate: '0.86', rate_date: '2026-09-24', source: 'frankfurter-v2' }`

TransactionSheet.tsx (existing, relevant lines):
- L182 `exponentFor(code)`, L186 `formCtx.amountInputText(minor, code)` (wraps `parser.toInputText`; it round-trips with `parse`)
- L190 `const [state, setState] = useState<FormState>(() => initialFormState(mode, formCtx))`
- L263 `parse(text, currency)` returns `{ ok: true, value: MinorUnits } | { ok: false, ... }`
- L265 `crossCurrency = isTransfer && state.toCurrency !== null && state.toCurrency !== state.currency`
- L284 `set(patch)`
- L370 `setState(clearedAfterAdd)` (list add: form reset). L423 `setState(loaded.state)` (list item restored via formFromItem).
- ~L756 Keypad: `onChange={(next) => set(inActive ? { amountInText: next } : { amountText: next })}`. This is the ONLY place a user edits amountInText.
- withAccount / withToAccount (transactionForm.ts) already clear amountInText to '' when the pair becomes same-currency. Leave transactionForm.ts and listForm.ts unchanged.

Theme: src/theme/ThemeProvider.tsx exposes `colors: { ...colors, accent }` from tokens.ts. There is ONE colour set and no separate dark palette in src/theme (grep confirms there is no "dark" anywhere). noRawColours.test.ts allows hex/rgba literals only in tokens.ts/accents.ts. Its hex allow-list matches `#` only, so an rgba token does not need an allow-list entry (`tabBar: 'rgba(251,250,247,.94)'` is the precedent).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Prefill "Amount received" from the latest stored rate until edited</name>
  <files>src/features/record/entry/receivedPrefill.ts, src/features/record/entry/__tests__/receivedPrefill.test.ts, src/features/record/entry/TransactionSheet.tsx, src/features/record/entry/__tests__/TransactionSheet.test.tsx</files>
  <behavior>
    receivedPrefill.test.ts (pure, no React):
    - GBP->EUR, sent '10', rates [GBP 0.86], exponents 2/2 -> '11.63' (1000 * 1/0.86 = 1162.79, half-up -> 1163 minor, via a toInputText stub `(m) => (m/100).toFixed(2)`)
    - EUR->GBP, sent '10', rates [GBP 0.86] -> '8.60'
    - no row for one side (rates []) with GBP->USD -> ''
    - sent text unparseable or empty -> ''
    - same currency, or toCurrency null -> ''
    - convertMinor throws (exponent 7 from exponentFor) -> '' (no throw escapes)
    TransactionSheet.test.tsx (mockRates = [{ quote: 'GBP', rate: '0.86', ... }], Current=GBP to Euro pot=EUR, the same setup as the existing "asks for both amounts" test at ~L347):
    - prefills: after typing sent '10', the received AmountField shows the €11.63 figure. Assert with getByText(/11\.63/) or the AmountField text, and Add transfer saves amountIn: 1163.
    - follows the sent amount: retype sent '20', and received shows 23.26 (2000/0.86 = 2325.58 -> 2326)
    - stops after a manual edit: press the received field, typeAmount '11.5', then retype sent '30'. Received still saves amountIn: 1150.
    - empty with no rate: mockRates = [] -> received shows no figure, and pressing Add transfer reports the received-amount error (the current required-field behaviour)
  </behavior>
  <action>
    Create `src/features/record/entry/receivedPrefill.ts`. It is a feature file, not engine/, so it may import from @/data. Export:
    ```ts
    export function prefillAmountInText(args: {
      amountText: string; currency: string; toCurrency: string | null;
      rates: readonly FxLatestRow[];
      parse: (text: string, code: string) => { ok: true; value: number } | { ok: false };
      exponentFor: (code: string) => number;
      toInputText: (minor: number, code: string) => string;
    }): string
    ```
    Return '' when toCurrency is null or equals currency, when the parse fails, or when either `latestPerEur(rates, code)` is null. Otherwise return `toInputText(convertMinor(minorUnits(Math.abs(value)), fromPerEur, exponentFor(currency), toPerEur, exponentFor(toCurrency)), toCurrency)`, wrapped in try/catch that returns ''. Integer minor units, rounding by convertMinor (half-up), and no floats. Mirror EntryNotes.tsx L54-61/L66-72. Adapt the `parse` parameter type to whatever the real `parser.parse` return type is (import its type from '@/ui/money/useAmountParser' if exported) so TransactionSheet passes its `parse` unchanged.

    In TransactionSheet.tsx:
    - Import useFxLatest and prefillAmountInText. Add `const rates = useFxLatest().data ?? [];`
    - Add `const [amountInManual, setAmountInManual] = useState(() => initialFormState-derived amountInText !== '')`. Simplest form: compute the initial state once (`useState(() => ...)` already does this). Seed the flag from it, e.g. lazy-init both from a single `useRef` of the initial state, or `useState(() => state.amountInText !== '')` declared right after `state`. An edit of a saved transfer therefore starts "manual" and is never recomputed.
    - Keypad onChange: when `inActive`, call `setAmountInManual(true)` as well as set({ amountInText: next }).
    - loadItem (L423): after setState(loaded.state), `setAmountInManual(loaded.state.amountInText !== '')`. addCurrentToList (L370, clearedAfterAdd): `setAmountInManual(false)`.
    - Add a useEffect, deps [crossCurrency, amountInManual, state.amountText, state.currency, state.toCurrency, rates], that returns early if `!crossCurrency || amountInManual`. Otherwise it computes `next = prefillAmountInText({...,  parse, exponentFor, toInputText: formCtx.amountInputText })` and calls `setState((s) => (s.amountInText === next ? s : { ...s, amountInText: next }))`. The functional no-op guard prevents a render loop. Do not put the unstable `parse`/`formCtx` closures in the deps (eslint-disable-next-line react-hooks/exhaustive-deps with a one-line reason), or memoise them. Pick whichever passes lint. Account changes reach the effect through state.currency/state.toCurrency, which withAccount/withToAccount set.
    - Do not change validateTransfer, amountsFor, saveTransfer, toTransferInput or toTransferAfter. Save reads the field as before.
    - Rename the existing test "asks for both amounts across currencies and never derives one" to "keeps a typed received amount across currencies" (it runs with mockRates = [], so its body is unchanged). Add the four new tests in the same describe block, reusing `open`, `typeAmount` and the mockRates variable. typeAmount long-press clears before typing, so the manual-edit test is clean.
    - No new copy, strings or i18n keys.
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-fix && npx jest src/features/record/entry --silent</automated>
  </verify>
  <done>receivedPrefill tests and the four new TransactionSheet tests pass, and every existing entry suite stays green. Prefill applies only to an untouched received field on a cross-currency transfer and stays empty without a stored rate.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scrim token and coloured Sheet backdrop</name>
  <files>src/theme/tokens.ts, src/ui/Sheet.tsx, src/ui/__tests__/Sheet.scrim.test.tsx</files>
  <behavior>
    - The Sheet backdrop (testID 'sheet-backdrop') has backgroundColor === colors.scrim (import `colors` from '@/theme/tokens'). Flatten the style with StyleSheet.flatten.
    - Pressing the backdrop calls onDismiss once.
    - colors.scrim is a semi-transparent black rgba with alpha strictly between 0 and 1. Assert with a regex /^rgba\(0,\s*0,\s*0,\s*0?\.\d+\)$/.
    - The existing Sheet.gestureRoot test still passes, so the GestureHandlerRootView from 4d77161 is untouched.
  </behavior>
  <action>
    tokens.ts: add exactly one entry to `colors`: `scrim: 'rgba(0,0,0,.4)',` placed after tabBar, with a one-line comment: "Dim layer behind every Sheet, including one stacked over another (user-approved, the only addition beyond §2)". Update the file header sentence "no colour is added beyond §2..." to note the scrim exception. The theme has a single colour set used in both light and dark system appearance (there is no dark palette in src/theme). A semi-transparent black dims correctly over either, so this one token covers both. Do NOT invent a dark palette. If grep does find one, add the same scrim value there too.
    Sheet.tsx: give the backdrop Pressable `testID="sheet-backdrop"` and `style={[styles.backdrop, { backgroundColor: colors.scrim }]}`. `colors` already comes from useTheme() in this component. Keep onPress={onDismiss}, the a11y props, the Modal/animationType, GestureHandlerRootView and KeyboardAvoidingView exactly as they are. No blur, gradient, shadow, opacity animation or new package. Every Sheet renders its own backdrop, so a sheet stacked over another dims the one beneath. No per-caller change is needed, and Dropdown.tsx (a menu, not a sheet) is out of scope.
    Create src/ui/__tests__/Sheet.scrim.test.tsx, modelled on Sheet.gestureRoot.test.tsx (same safe-area mock, ThemeProvider wrapper, jest.setTimeout).
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-fix && npx jest src/ui src/theme --silent</automated>
  </verify>
  <done>colors.scrim exists, the backdrop uses it and still dismisses on tap, and noRawColours, Sheet.gestureRoot, Sheet.keyboard and the new scrim test all pass.</done>
</task>

<task type="auto">
  <name>Task 3: Full gate and commit</name>
  <files>(no new files; fixes only if a gate fails)</files>
  <action>
    Run `npm run typecheck` and `npm run lint` from C:/dev/fincwin-fix, then the affected suites again: `npx jest src/features/record src/ui src/theme`. Fix any failure within the files listed in frontmatter. Confirm with `git diff --stat` that transactionForm.ts, listForm.ts, STATE.md and ROADMAP.md are untouched and that nothing under node_modules changed. Commit on fix/02.3-walkthrough (do not push) as two commits, `feat(261013-izi): prefill transfer received amount from stored rate` and `feat(261013-izi): dim scrim behind every sheet`, or one per task as completed, each ending with the Co-Authored-By attribution line.
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-fix && npm run typecheck && npm run lint && npx jest src/features/record src/ui src/theme --silent</automated>
  </verify>
  <done>Typecheck, lint and the affected jest suites pass, and the commits are on fix/02.3-walkthrough without a push.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cached fx_latest rows -> received prefill | Stored server rates feed a suggested figure the user can override |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-izi-01 | T | prefillAmountInText | mitigate | latestPerEur returns null on unparseable rates and the try/catch returns '' on convertMinor RangeError, so a bad row yields an empty field, never a wrong or overflowing number |
| T-izi-02 | T | received-amount overwrite | mitigate | The amountInManual flag stops recompute after any user keypad edit and is seeded true for saved and restored values, so a user's figure is never silently replaced |
| T-izi-03 | I | Sheet scrim | accept | Visual-only token, no data exposure |
</threat_model>

<verification>
- `npx jest src/features/record src/ui src/theme` green
- `npm run typecheck` and `npm run lint` green
- `grep -n "scrim" src/theme/tokens.ts src/ui/Sheet.tsx` shows the token and its single use
</verification>

<success_criteria>
- Cross-currency transfer received amount prefills from stored rates, follows the sent amount and accounts while untouched, stops after a manual edit, and stays empty with no rate
- Every Sheet has a semi-transparent black scrim from colors.scrim, and tap-to-dismiss still works
- Save semantics, the GestureHandlerRootView and the engine import boundary are unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/261013-izi-transfer-received-amount-prefill-and-she/261013-izi-SUMMARY.md`
</output>
