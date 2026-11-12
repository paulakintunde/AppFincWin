# 06 — Visual depth research (app-wide)

Research only. No code changed. 2026-11-07, worktree `C:\dev\fincwin-g6` (branch `feat/06-grow`).

Owner feedback after a device check:
1. "Enhance the shadows around the cards."
2. "If the main text in the cards can have a bit of bold to emphasise and make it sharper."
3. "Consider adding slightly darker or lighter colors to the background and cards for distinction. As research, if it works, implement."

Evidence: code read below, and Pixel 9 screenshots under
`C:\Users\harki\AppData\Local\Temp\claude\c2b776d808e07261\432f7f9b-aa45-4360-bcf5-c16006f22b9c\scratchpad\depth\`
(`00-now.png` debt detail, `01-check.png` Grow home, `12-decide.png` safety net). Another agent was running a Grow audit on the phone at the same time, so only Grow screens were captured. Home and Activity are described from code.

---

## 1. Today

### Page and card colours (`src/theme/tokens.ts`)

| Token | Value | Line | Use |
|---|---|---|---|
| `surface` | `#FFFFFF` | tokens.ts:9 | every card |
| `canvas` | `#FBFAF7` | tokens.ts:10 | page background (`Screen.tsx:35,38,53`, `TabRootScreen.tsx:24`, `DetailScreen.tsx:28`, `CompactHeader.tsx:64`, `DetailHeader.tsx:35`, 17 sites in total) |
| `tabBar` | `rgba(251,250,247,.94)` | tokens.ts:38 | canvas at 94 %, hard-coded |
| `line1` | `#EDEAE1` | tokens.ts:28 | Grow card border, row separators |
| `fill1` | `#F1EFE8` | tokens.ts:32 | inner blocks, back-button circle, secondary pill, segment track |
| splash | `#FBFAF7` | app.config.ts:58 | splash background (a literal) |

White card on canvas is a contrast of **1.044:1**. That is almost invisible, which is what the owner saw.

**Dark mode: none.** `app.config.ts:14` sets `userInterfaceStyle: 'light'`, `AppStatusBar` forces dark icons, and the theme has no scheme switch. Everything below is light only.

### Card shape and shadow

There is **no shared Card component**. Each feature builds its own card from `colors.surface` plus `radii.card` (26, `layout.ts:5`). They fall into two groups:

| Group | Styling | Where |
|---|---|---|
| **A. Shadow cards** (Home, Activity, Decide, You) | `surface` + `shadows.card`, no border | `ThisMonthCard.tsx:104`, `AccountsCard.tsx:149`, `ComingUpCard.tsx:98`, `ActivitySummaryCard.tsx:54`, `ActivityRow.tsx:48,58` (first/last row of a group only), `SettingsGroup.tsx:30`, `stepUi.tsx:32`, `FoldList.tsx:62`, `ChangesCard.tsx:66`, `OpenChecksCard.tsx:132`, `PastDecisionsScreen.tsx:123`, `PotsScreen.tsx:147,159`, `QuickCheckForm.tsx:79` |
| **B. Border cards** (all of Grow) | `surface` + `borderWidth: 1` + `borderColor: line1`, **no shadow** | `GoalsSegment.tsx:59,141`, `DebtsSegment.tsx:49,148,252`, `InvestingSegment.tsx:58,84,96,106,140,148`, `DebtDetailScreen.tsx:231`, `GoalDetailScreen.tsx:362`, `PayoffPlanCard.tsx:201`, the calculators (`CalcFields.tsx:125`, `CalculatorsScreen.tsx:84`, `DebtPayoffCalculator.tsx:193`, `GoalCalculator.tsx:280`, `DebtExtraCalculator.tsx:241`), and `SafetyNetCard.tsx:46,68` (blue swatch tint and blue border) |

Group B goes against Grow's own spec: `06-UI-SPEC.md:78` says "`surface` #FFFFFF cards with `shadows.card`". So Grow looks flatter than the rest of the app. On the Pixel 9 (`01-check.png`, `00-now.png`), Grow cards show only as a faint `line1` outline on the near-white page.

The shadow token is at `tokens.ts:112-137`:

```ts
card: { shadowColor: '#14150F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 15, elevation: 3 },
fab:  { shadowColor: '#14150F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 6 },
```

- **iOS:** draws one blurred layer (offset 6, radius 15, 12 %). This is an approximation. The §2 CSS has two layers: `0 1px 2px rgba(20,21,15,.05), 0 12px 30px -18px rgba(20,21,15,.22)`. The hairline layer is the one that gives the CSS card its crisp edge, and the approximation drops it.
- **Android:** only `elevation: 3` counts. The opacity and radius are ignored. Elevation 3 is a faint, grey, system-defined shadow, mostly under the bottom edge. The side edges get almost no definition.
- `fab` is used once (`Fab.tsx:90`). It is fine as it is.

### Card text roles (`src/theme/typography.ts`)

| Role | Size / weight / line height | Line |
|---|---|---|
| `display` | 34, display face (Archivo Black etc.), 1.0 | 40-46 |
| `heading` | 26 / **700** / 1.16 | 47-53 |
| `body` | 15 / **500** / 1.5 | 54-60 |
| `label` | 13 / **600** / 1.4 | 61-67 |
| `sheetTitle` | 16 / **600** / 1.2 | 68-74 |

Usage counts across `src`: `label` 501, `body` 199, `sheetTitle` 79, `heading` 22, `display` 7.

The main text on a card (the name of the thing) is almost always `body` 500 in `ink`:
- `GoalRow.tsx:98` (goal name), `SafetyNetCard.tsx:54,57` (title and figure)
- `ActivityRow.tsx:262` (payee) and `:301` (amount)
- `AccountsCard.tsx:98`, `ComingUpCard.tsx:222` (bill name) and `:235` (amount)
- `OpenChecksCard.tsx:174`, `Row.tsx:33` (row label; the value at `:34` is `body` in `inkMuted`)

Card titles already use `sheetTitle` 600 ("If you pay more", "Payoff plan"). The big amounts are already heavy: `heading` 700 (`ThisMonthCard` figure) or `display` (the Grow "$2,250"). The light-looking text is the **list-row names and row amounts**, which are 500 and sit right next to `label` 600 sublines. So the secondary line is as heavy as or heavier than the primary line. That is the "not sharp" effect.

---

## 2. Shadows

React Native 0.86 on the New Architecture supports the CSS-style `boxShadow` prop on both platforms, with several layers, spread and negative spread. That means the app can draw the §2 two-layer CSS shadow **exactly**, instead of the one-layer approximation. Limits:
- **Android:** outset `boxShadow` needs API 28 (Android 9) or later. The project's `minSdk` is 24, so on API 24-27 `boxShadow` is ignored. Keep an `elevation` fallback for those versions only.
- **Both platforms:** do not combine `boxShadow` with `elevation` or `shadow*` on API 28+, or you get two shadows.
- **iOS:** `boxShadow` is not clipped by `overflow: 'hidden'`, unlike the `shadow*` props (medium confidence; check on the iPhone XR).
- **Colour literals:** `rgba(` literals are allowed inside `tokens.ts` (`noRawColours.test.ts:15`). The hex allow-list test (`:62-117`) only scans `#hex`, so adding the token needs no allow-list change.

### Option S1: draw §2 exactly (no rule change)

```ts
card: Platform.OS === 'android' && Platform.Version < 28
  ? { elevation: 3 }
  : { boxShadow: '0 1px 2px rgba(20,21,15,0.05), 0 12px 30px -18px rgba(20,21,15,0.22)' },
```

This is the shadow the prototype was designed with, so "no extra shadows" still holds. Android gains a real edge. The visible change is modest, and on its own it probably does not meet "enhance".

### Option S2: one stronger resting token (recommended)

```ts
card: Platform.OS === 'android' && Platform.Version < 28
  ? { elevation: 3 }
  : { boxShadow: '0 0 0 1px rgba(20,21,15,0.04), 0 1px 3px rgba(20,21,15,0.07), 0 8px 20px -8px rgba(20,21,15,0.16)' },
```

- Layer 1: a 1 px ring at 4 %. It gives a crisp edge on all four sides, replaces Grow's `line1` border, and reads as "sharper".
- Layer 2: a hairline contact shadow, a little stronger than §2's .05.
- Layer 3: a soft drop shadow, mostly below the card. It shows on the sides more than §2's (-8 spread instead of -18) but stays calm.

If a team wants to stay on the old props for iOS, the nearest single-layer equivalent is: `shadowOffset {0,4}`, `shadowOpacity 0.10`, `shadowRadius 12`.

### Option S3: two levels (resting and raised)

S2's `card`, plus:

```ts
raised: { boxShadow: '0 0 0 1px rgba(20,21,15,0.04), 0 2px 4px rgba(20,21,15,0.06), 0 14px 32px -12px rgba(20,21,15,0.22)' }  // Android <28: { elevation: 5 }
```

`raised` is for the one hero card per screen (Home "This month", the Grow hero figure, the Decide answer card). It adds hierarchy but needs a decision about which card is the hero on each screen, and it is more for 06.1 to agree to. Defer it unless the owner asks for more after S2.

### Long lists (FlashList) and the Activity segment cards

- Activity draws one "card" as a run of FlashList rows (`ActivityRow.tsx:36-62`). `shadows.card` sits only on the first and last rows. A stronger blur on those rows leaks under the next cell and leaves a step at the side edges where the middle rows have no shadow. This already happens faintly today, and S2 would make it more visible.
- **Recommendation:** add `shadows.edge = { boxShadow: '0 0 0 1px rgba(20,21,15,0.04), 0 1px 2px rgba(20,21,15,0.06)' }` (2 px blur at most, no spill) and use it on every Activity row position, middle rows included. The group still reads as one card, and the per-cell cost is tiny.
- **Performance:** keep large-blur shadows on card containers (a handful per screen), never on every recycled list cell. A shadow with a blur of 20 or more, repeated on hundreds of cells, is the expensive case on Android. A 1-2 px blur is cheap. No other FlashList user (`ReviewStep.tsx`) draws card shadows per row.

### Dark mode

Not applicable: the app is light-only (`app.config.ts:14`). If dark mode arrives later, shadows on dark surfaces should switch to a lighter surface tone rather than a darker shadow. Note that for later.

---

## 3. Bolder main text

The weight 600 face is loaded for all four pairings (`fonts.ts:45-92`, `useThemeFonts` at `:99-122`): Archivo, Manrope, Space Grotesk and IBM Plex Sans all ship a real SemiBold. So 600 needs **no new font file and no fake bold on either platform**. (Never use `fontWeight: '600'` on a custom family on Android; it can pick the wrong face. Always switch the family, which `textRole` already does.)

**Do not raise `body` to 600 everywhere.** `body` also sets paragraphs, explainers, fact lines and button labels (199 sites). Making those bold would make every screen heavy and would go against "declarative, calm".

### Proposed token change: a new role `bodyStrong` at an existing weight

`typography.ts:20`:
```ts
export type TextRole = 'display' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'sheetTitle';
```
And in `textRole`:
```ts
case 'bodyStrong':
  return { fontFamily: p.body[600], fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, letterSpacing: 0 };
```

Same size and line height as `body`, so it never changes layout, the text-fit matrix, or font-scale behaviour. Only the face changes, from Medium to SemiBold. No new size and no new weight is added (600 is already in `label` and `sheetTitle`), so this does not clash with 06.1's "No new sizes or weights" (`06.1-UI-SPEC.md:92,104`).

### Where to use it (primary line and row amount only)

| Site | Now | Proposed |
|---|---|---|
| `GoalRow.tsx:98` goal name | body | bodyStrong |
| `SafetyNetCard.tsx:54` title | body | bodyStrong (figure at `:57` too) |
| `DebtsSegment.tsx` / `InvestingSegment.tsx` row names and amounts | body | bodyStrong |
| `ActivityRow.tsx:262` payee name, `:301` amount | body | bodyStrong (projection rows at `:371,382` stay body/inkMuted, so "expected" still reads lighter) |
| `ComingUpCard.tsx:222` bill name, `:235` amount | body | bodyStrong |
| `AccountsCard.tsx:98` | body | bodyStrong |
| `OpenChecksCard.tsx:174` check item | body | bodyStrong |
| `Row.tsx:33` label | body | **unchanged**. `Row` also builds settings and field rows ("Size", "Each month"). Bolding it would make settings heavy. Add an opt-in `emphasis` prop instead, used only where a Row names a thing |

Hero amounts are already `heading` 700 or `display`, so no change there. Sublines stay `label` 600 in `inkMuted`. The ink-versus-muted colour step, plus 600 on the primary line, gives the hierarchy.

---

## 4. Tonal surfaces

All candidate backgrounds are **existing tokens**, so there is no new hex. WCAG 2.x contrast ratios (computed with the same formula as `src/theme/contrast.ts`):

| Text on → | surface #FFF | canvas #FBFAF7 (now) | fill5 #FAF8F3 | **fill6 #F6F4EE** | fill4 #F4F2EB | fill1 #F1EFE8 |
|---|---|---|---|---|---|---|
| ink | 18.36 | 17.59 | 17.30 | **16.69** | 16.39 | 15.96 |
| inkDim | 6.92 | 6.63 | 6.52 | **6.29** | 6.18 | 6.02 |
| inkMuted | 5.40 | 5.18 | 5.09 | **4.91** | 4.82 | 4.70 |
| inkFaint | 4.88 | 4.67 | 4.60 | **4.44 (fails 4.5)** | 4.35 fails | 4.24 fails |
| accent green / navy / rust / slate | 9.64 / 11.48 / 7.32 / 7.12 | 9.24 / 11.00 / 7.02 / 6.82 | — | **8.77 / 10.44 / 6.66 / 6.48** | 8.61 / 10.25 / 6.54 / 6.36 | 8.38 / 9.98 / 6.37 / 6.19 |
| danger | 5.42 | 5.19 | 5.11 | **4.93** | 4.84 | 4.71 |
| warn1 / warn2 | 5.90 / 5.86 | 5.65 / 5.62 | — | **5.36 / 5.33** | 5.27 / 5.23 | 5.13 / 5.10 |
| inkSoft1 (non-text only, 3:1) | 2.42 | 2.32 | — | 2.20 | 2.16 | 2.10 |

How well each element separates from the page (1.0 = invisible):

| Element on page | canvas now | fill6 | fill4 | fill1 |
|---|---|---|---|---|
| white card | 1.044 | **1.100** | 1.120 | 1.151 |
| fill1 blocks (back circle, secondary pill, segment track) | 1.102 | **1.046** | 1.027 | 1.000 (gone) |
| line1 border | 1.152 | 1.094 | 1.074 | 1.046 |

### Option T1 (recommended): page `canvas` becomes `#F6F4EE` (the existing `fill6` value)

- Card-to-page separation more than doubles (1.044 to 1.100), about the same step as the iOS grouped-list background against white.
- All text roles still pass AA **except `inkFaint` text sitting directly on the page** (4.44). `inkFaint` is meant for text inside cards and sheets (white, 4.88), so the fix is a rule plus a test, not a new colour: `inkFaint` text never sits on `canvas`. Of the 53 `inkFaint` Text sites, most are inside cards or sheets. The implementing plan must audit them and move any page-level ones to `inkMuted` (4.91).
- `fill1` elements on the page (back-button circle, "Take some out" pill, Grow segment track) keep a visible but halved step (1.046). Check them on the device. If they look too faint, give the on-page instances `line1` (#EDEAE1, 1.094 on fill6) as their fill, which is still an existing token.
- 06.1 compatibility: 06.1 checks every state text colour on `surface`, `canvas` and `fill1`, and the lowest result is 5.13 on `fill1` (`06.1-UI-SPEC.md:179`). `fill6` is lighter than `fill1`, so every 06.1 state pair still passes. Its tints (#E4F0E8, #FBEFD6 and so on) remain distinct on `fill6`.

### Option T2: darker page `#F4F2EB` (fill4) or `#F1EFE8` (fill1)

Stronger separation, but `fill1` blocks on the page vanish (1.027 or 1.000), and `inkFaint` fails further. Several on-page controls would need restyling. Not recommended.

### Option T3: tinted secondary card

For example, explainer and note cards in `fill5 #FAF8F3` instead of white. With T1 these sit 1.04 above the page and 1.06 below white, a three-step ladder (page, quiet card, card). It is useful only if the owner wants a quieter card type later. Grow already has a tinted card (the safety net, `categorySwatch.blue`, which 06.1 swaps to its `net` token). Not needed for this request.

---

## 5. Recommendation

**Combine S2 shadows, T1 page tone and the `bodyStrong` role, all at the token level. Add no new hex.**

### Token values

```ts
// tokens.ts
canvas: '#F6F4EE',                       // was #FBFAF7 (equal to fill6, already allow-listed)
tabBar: 'rgba(246,244,238,.94)',         // was rgba(251,250,247,.94); keep in step with canvas
shadows.card = API<28 Android ? { elevation: 3 }
  : { boxShadow: '0 0 0 1px rgba(20,21,15,0.04), 0 1px 3px rgba(20,21,15,0.07), 0 8px 20px -8px rgba(20,21,15,0.16)' }
shadows.edge = API<28 Android ? {}  // separators carry it
  : { boxShadow: '0 0 0 1px rgba(20,21,15,0.04), 0 1px 2px rgba(20,21,15,0.06)' }
shadows.fab  // unchanged
// typography.ts
bodyStrong: 15 / weight 600 / lh 1.5 / ls 0   (p.body[600])
```

### Files to change (estimate)

| File | Change |
|---|---|
| `src/theme/tokens.ts` | `canvas`, `tabBar`, `shadows.card` (to `boxShadow` plus Platform fallback; needs a `Platform` import), new `shadows.edge` |
| `src/theme/typography.ts` | `bodyStrong` role |
| `app.config.ts:58` | splash `#F6F4EE`, so launch does not flash the old tone (needs a new native build; it is not OTA-able. Optional, can ride the next build) |
| Grow cards (about 15 files, group B above) | drop `borderWidth`/`borderColor: line1`, add `shadows.card`. `SafetyNetCard` keeps its state border |
| `src/features/record/activity/ActivityRow.tsx:36-62` | use `shadows.edge` on every position |
| Primary-line sites (about 10 files, §3 table) and `Row.tsx` | `bodyStrong`; add an opt-in `emphasis` prop on `Row` |
| `inkFaint`-on-canvas audit (up to 53 sites, most need no change) | page-level ones move to `inkMuted` |
| `src/theme/__tests__/contrast.test.ts` | add pairs: every text token on the new `canvas` must reach 4.5, except `inkFaint`, which is asserted on `surface` only |
| Snapshot `ActivitySummaryCard.test.tsx.snap:17-24,173` | re-record (it stores the old `shadow*`/`elevation` values) |
| `CLAUDE.md:26` | amendment below |

**Rough size:** one plan, about 30 files, mostly one-line style swaps. Half a day to a day, plus a device pass: the Pixel 9 text-fit matrix for `bodyStrong` widths, the iPhone XR for iOS `boxShadow`, and one Android 8 (API 26/27) emulator look for the fallback. It can ship as OTA except for the splash colour.

### CLAUDE.md amendment

Current `CLAUDE.md:26`:
> - **Design fidelity**: the §2 token set is the complete palette and type scale. No gradients, no extra shadows, no additional colours, no substituted icon set. The prototype's restraint is deliberate.

06.1 (PR #99) already plans to replace this same bullet (`06.1-UI-SPEC.md:184-188`). To avoid a merge clash, **build on 06.1's wording** and add one sentence on depth. Combined text:

> - **Design fidelity**: the §2 token set plus the seven Decide state colours (fits green #1B4D3E / #E4F0E8, tight amber #8A5A1B / #FBEFD6, safety net navy #1F3A5F / #E4ECF6, extra teal #1E6B5E / #DFF1EE, short red #B4472A, text #933720 / #F8E2DA, conditional plum #5B3A75 / #EEE6F4, not yet slate #3E5C6B / #E6ECEF, and muted text on tints #5A564B) is the complete palette. The state colours appear only in badges, verdict cards and amounts, always with a symbol and a word, and each pair must pass the tests in `src/theme/contrast.ts`. The §2 type scale is complete; card item names and row amounts use the `bodyStrong` role (body size at weight 600). **Depth comes only from the page tone (`canvas` #F6F4EE, the §2 `fill6` value), white `surface` cards, and the three shadow tokens in `tokens.ts` (`card`, `edge`, `fab`); `inkFaint` text never sits on `canvas`.** No gradients, no other shadows, no other colours, no substituted icon set. The prototype's restraint is deliberate.

If this lands before 06.1, use the same text without the state-colour clause, and let 06.1 insert its clause.

### Risks

1. **`noRawColours.test.ts`:** passes as long as the `rgba()` shadow strings live in `tokens.ts` (allowed file) and `canvas` reuses `#F6F4EE`, which is already allow-listed (`:62-117`). Do not write `#14150F14`-style 8-digit hex: the allow-list test would flag it.
2. **06.1 clash:** both branches edit `CLAUDE.md:26` and `tokens.ts`, so expect a text merge, not a design conflict. 06.1 uses `shadows.card` "only" (`06.1-UI-SPEC.md:112`), so it inherits the new value automatically. 06.1's contrast table holds on `fill6` (5.13 is the lowest, on `fill1`). 06.1 also plans the Grow safety-net swap from `categorySwatch.blue` to `net`, which does not touch the shadow or border work here. Tell the 06.1 owner the new `canvas` value so their contrast test also asserts on it.
3. **Android API 24-27:** `boxShadow` is ignored. The fallback `elevation` keeps today's look there. Grow cards lose their `line1` border, so on those devices they rely on elevation plus the darker page. Acceptable, but check once on an emulator.
4. **Activity seams:** if the Activity rows keep `shadows.card` instead of `edge`, the stronger blur shows seams between first, middle and last rows.
5. **Snapshot:** one snapshot file re-records. No test asserts `Archivo_500Medium` directly, so the `bodyStrong` swaps break no tests (only `recordPrimitives.test.tsx` and `YouScreen.test.tsx` mention font families; re-run them).
6. **Text fit:** 600 is about 2-4 % wider than 500 in Archivo and Manrope. Rows that already use `adjustsFontSizeToFit` (`ActivityRow.tsx:301`, `ComingUpCard.tsx:235`) absorb it. Run the 402 dp / 320 dp x 200 % matrix on names that wrap.
7. **"Restraint" drift:** S3 (a second raised level) and T2 (a darker page) are where the look would start to feel heavy. Keep them out unless the owner asks for more after seeing S2 + T1 on the device.
