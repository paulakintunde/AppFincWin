# FincWin United — Build Brief

**Purpose of this document.** It is the idea document for `/gsd-new-project`. Feed it in as an `@` reference; GSD turns it into `PROJECT.md`, `REQUIREMENTS.md` and `ROADMAP.md`. Everything below is a decision already taken or an open question explicitly marked as such. Do not re-derive the stack.

**Source of truth for design and behaviour:** `FincWin United.dc.html` (7,018 lines) in this folder, plus `ios-frame.jsx`, `support.js` and `screens/*.png`. Read the HTML in full before planning. The section markers (`<!-- ══ HOME ══ -->` etc.) map one-to-one onto the feature areas below.

---

## 1. What is being built

FincWin United is a personal and household money app for iOS and Android. It does three things most money apps do not:

1. **Records** money in and out across multiple accounts, currencies, categories and households — offline, on device.
2. **Decides.** The `Decide` tab ("the check") is the product's reason to exist. You type an item and a price; it runs real financial maths against your actual logged months and tells you whether you can afford it, what breaks if you buy it, what the cheaper or later versions look like, and writes the decision down so you can compare estimate against actual afterwards.
3. **Reveals itself gradually.** An onboarding question flow sets a starting feature level (Basics → Everyday → Full picture → Everything). Features are gated by level with per-feature offers, so a first-time user meets a small app and an expert meets all of it.

It is a **money-management tool, not a financial institution and not a lender.** That distinction governs store compliance (§7) and must be reflected in copy.

**Target:** Apple App Store and Google Play. Production-quality, not a demo.

**Hard constraint:** the developer works on **Windows 11 with no Mac and no Xcode.** §3 is the answer to that; it is the single most important architectural driver in this document.

---

## 2. The prototype's design system — extract these verbatim

The prototype is an HTML/CSS/JS mock from Claude Design. **Match its visual output pixel-for-pixel; do not port its internal structure.** It uses a declarative DSL (`sc-if`, `sc-for`, `{{ }}`) that has no place in the real app.

### Colour tokens

Pulled by frequency from the source. These are the whole palette — do not invent more.

| Token | Hex | Use |
|---|---|---|
| `surface` | `#FFFFFF` | Cards, sheets |
| `canvas` | `#FBFAF7` | App background |
| `shell` | `#E7E4DC` | Outside the device frame |
| `ink` | `#14150F` | Primary text, hover fills |
| `ink-muted` | `#6E6A5E` | Secondary text (most used colour after white) |
| `ink-faint` | `#767161` | Tertiary/help text |
| `ink-dim` | `#5C5A50` | Labels |
| `ink-soft` | `#A8A79C`, `#BFBEB4`, `#C6C2B6` | Disabled, placeholder |
| `accent` | `#1B4D3E` | Deep green. Brand default |
| `accent-tint` | `#EAF1EC`, `#E9F0EB`, `#F4F7F4` | Accent backgrounds |
| `danger` | `#B4472A` | Over cap, debt, negative delta |
| `danger-tint` | `#F6EAE6`, `#F3E6E1`, `#F6EAE5` | Warning strips |
| `warn` | `#8A5A1B`, `#7E6020` | Business, dining, caution |
| `line` | `#EDEAE1`, `#E2DED2`, `#E5E2D7`, `#D9D5C9` | Borders, separators |
| `fill` | `#F1EFE8`, `#F2EFE7`, `#F5F3ED`, `#F4F2EB`, `#FAF8F3`, `#F6F4EE` | Chips, tracks, hover |

**Accent is a user-selectable prop** with four options: `#1B4D3E` (green), `#1F3A5F` (navy), `#7A4B2A` (rust), `#3E5C6B` (slate). Implement as a theme token, not a hardcoded value — the prototype wires it through the CSS variable `--fw-accent`; do the same through a theme context.

**Category colour and tint are paired maps** (`Component.COL` / `Component.TINT`, HTML line 3217–3218). Fifteen categories including `Income`, `Settlement`, `Transfer`. Copy both maps exactly; the tint is the chip background, the colour is the glyph.

**Household member colours:** `['#1B4D3E','#B4472A','#3E5C6B','#7E6020','#6E4A63','#2F6E68']` with privacy-safe display names `['Green','Rust','Slate','Ochre','Plum','Teal']`.

### Typography

Four user-selectable pairings (`Component.FONTS`, line 3359), applied through `--fw-disp` / `--fw-body`:

| Name | Display | Body |
|---|---|---|
| Bold *(default)* | Archivo Black | Archivo |
| Modern | Manrope | Manrope |
| Grotesk | Space Grotesk | Space Grotesk |
| Neutral | IBM Plex Sans | IBM Plex Sans |

Load via `@expo-google-fonts/*` + `expo-font`. The switcher must apply live without a reload, exactly as `applyVars()` does.

Type scale in use: `10.5` (tab label) · `11.5` (eyebrow, letter-spacing `.16em`) · `12.5` (meta) · `13` (section label, weight 600) · `13.5` · `15` (list row, letter-spacing `-.01em`) · `16` (sheet title) · `26` (screen title, display face, letter-spacing `-.025em`) · `32` (health score) · `42` (net worth, weight 500, letter-spacing `-.035em`). Weights used: 400/500/600/700/800.

### Shape, depth, motion

- Radii: `26px` cards · `999px` pills and chips · `11px` category glyph tiles · `50%` avatars
- Card shadow: `0 1px 2px rgba(20,21,15,.05), 0 12px 30px -18px rgba(20,21,15,.22)`
- FAB shadow: `0 10px 26px -10px rgba(20,21,15,.55), 0 2px 6px rgba(20,21,15,.14)`
- Tab bar: `rgba(251,250,247,.94)` + `blur(14px)` + `1px solid #EDEAE1` top border
- Seven named animations to port to Reanimated worklets: `fw-up` (sheet, `translateY(102%)` → 0) · `fw-fade` · `fw-push` (detail screen, `translateX(26px)`) · `fw-rise` (FAB, `translateY(14px)`) · `fw-slideL` / `fw-slideR` (directional tab change, `translateX(±22px)`) · `fw-spin` (refresh)
- Standard easing: `cubic-bezier(.2,.8,.3,1)`, `.55s` for progress bars, `.22s` for entrances
- **`prefers-reduced-motion` is already honoured in the prototype.** Respect `AccessibilityInfo.isReduceMotionEnabled()` and collapse all of the above to near-zero duration.
- Focus ring: `2px solid accent`, `2px` offset. Keep an equivalent for keyboard and switch-control users.

### Layout

Designed at **402 × 874** (iPhone 16 Pro logical size, per `ios-frame.jsx` `hint-size`). Screen padding `22px` horizontal for headers, `16px` for cards; first header block is `68px` from the top (status bar + breathing room). Tab bar `9px 6px 30px` (the 30 is the home-indicator inset). FAB sits `right:16px bottom:96px`.

**Do not hardcode 874.** Use `react-native-safe-area-context` insets and let content flow. The `68px` top padding becomes `insets.top + 21`.

---

## 3. Stack — and how iOS ships without a Mac

This is settled. **Expo (managed, with config plugins) + EAS.** It is the only path that builds, signs and submits an iOS app from Windows.

### Core

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo SDK 55** (React Native 0.83, React 19.2) | Current as of Feb 2026. New Architecture is always on in 55+ and cannot be disabled — plan for it from line one, no legacy-arch escape hatch |
| Language | TypeScript, `strict: true` | The Decide engine is too numerate to ship untyped |
| Navigation | **Expo Router v7**, file-based | Ships in SDK 55 |
| iOS build | **EAS Build** (cloud macOS workers) | Compiles and signs `.ipa` from Windows |
| iOS dev loop | **EAS Simulator** — cloud iOS simulator streamed to a browser | Limited-access preview, waitlist at `expo.dev/services/simulators`. There is an `eas-simulator` agent skill (available in this environment as `expo:eas-simulator`) that lets an agent drive the simulator and return screenshots. **Join the waitlist on day one.** |
| Submission | **EAS Submit** | Uploads to App Store Connect and TestFlight from Windows. Google Play too |
| OTA | **EAS Update** | SDK 55 does Hermes bytecode diffing — ~75% smaller updates. Use for JS-only fixes post-launch |
| CI | **EAS Workflows** | Build/submit on tag without a macOS runner |

### Dev loop that actually works on Windows

1. **Android emulator locally** — full native speed, no cloud, no waiting. This is the primary loop. Build ~90% of the app here.
2. **A physical iPhone with a dev build** — `eas build --profile development --platform ios`, install over the air. Best-fidelity iOS check. **Strongly recommended; borrow or buy a cheap used one.** It also gives real Face ID, real haptics and real notification behaviour, none of which a simulator reproduces.
3. **EAS Simulator** for iOS checks when no device is to hand, and for agent-driven screenshot verification.
4. **Expo web target** for fast component and design-token iteration only — never as a correctness check.

Expo Go is unusable here: Plaid, RevenueCat, SQLite encryption, Face ID and WidgetKit all need custom native code. Use a **development build** throughout.

### What no Mac genuinely costs you

Be straight about this rather than discovering it in month three:

- **Native Swift/Kotlin debugging** — painful. Each iteration is a cloud build. Keep native code to a minimum.
- **iOS Widgets and Lock Screen widgets** require **WidgetKit in Swift** (and Android Glance in Kotlin). React Native cannot render them. They need an Expo config plugin wrapping native code, iterated through EAS Build. **Recommendation: cut widgets from v1** and ship them in 1.1 once the rest is stable. The feature inventory lists them at level 4 ("Everything"), so they are already the deepest tier — deferring costs little.
- **Xcode-only chores** (Instruments profiling, some provisioning edge cases) — EAS covers provisioning; profiling can be done on Android plus Hermes tooling.
- **You must still pay for the Apple Developer Program** ($99/yr). There is no way around it.

Everything else — build, sign, TestFlight, screenshots, store submission, review responses — works from Windows.

### Data layer

**Local-first, no exceptions.** The prototype persists ~60 keys to `localStorage` under `fincwin.united.v1` with a 600ms debounce. That is the right instinct and the wrong mechanism.

| Concern | Choice |
|---|---|
| Database | **`expo-sqlite`** + **Drizzle ORM** + `useLiveQuery` |
| Why not `op-sqlite` | Faster, but `expo-sqlite` + Drizzle is the smoother Expo path and the data volumes here are small (a household's ledger, not a feed). Revisit only if profiling says so |
| Encryption at rest | Financial data. SQLCipher (via `op-sqlite`) **or** rely on iOS/Android full-disk encryption + `expo-secure-store` for keys. **Open question — see §9** |
| UI/ephemeral state | Zustand. Sheet stack, tab animation direction, bulk-select mode, toast queue |
| Server / sync | **Supabase** — Postgres, Auth, Row-Level Security. RLS is what makes household sharing safe |
| Secrets | `expo-secure-store` |
| Money | **Integer minor units.** Never floats, never `parseFloat` on user input. A `Money` type of `{ amount: number /* cents */, currency: string }`. The prototype uses floats; that is a prototype's privilege, not a shipped app's |

**The ~60 `PERSIST` keys (line 3367) are not a schema — they are a flat dump.** Normalise them into real tables: `transactions`, `accounts`, `categories`, `caps`, `goals`, `holdings`, `lots`, `loans`, `households`, `members`, `settlements`, `checks`, `check_adjustments`, `check_setbacks`, `decisions`, `alerts`, `alert_log`, `devices`, `archive_months`, `undo_snapshots`, `settings`. Write a **migration that imports a v1 `localStorage` blob** if any real prototype data needs carrying over; otherwise skip it.

### UI libraries

| Need | Choice | Note |
|---|---|---|
| Long lists | **FlashList v2** | Activity list, search-across-all-months, transaction history. v2 is rebuilt for the New Architecture |
| Animation | **Reanimated 4** worklets | All seven prototype animations run on the UI thread |
| Gestures | `react-native-gesture-handler` | Sheet drag-to-dismiss (already in the prototype at line ~3265), swipe actions |
| Bottom sheets | **`@gorhom/bottom-sheet` v5** | ~14 distinct sheets. Consider Expo Router form sheets for the simpler ones |
| Charts | **Hand-rolled SVG** via `react-native-svg` | The prototype's charts are already SVG polylines and rects with a known viewBox (`0 0 320 88`). Port them directly. A charting library would fight the design |
| Styling | `StyleSheet` + a typed theme context, **or** Unistyles v3 | Either is fine. The requirement is that accent and font pairing swap live |
| Icons | **Inline SVG, copied from the prototype** | The five tab glyphs are bespoke compositions of rects, circles and paths with per-state opacity. Do not substitute an icon font |
| Haptics | `expo-haptics` | On verdict reveal, cap breach, toast, decision commit |

### Tab bar decision

Expo Router v7 offers `unstable-native-tabs`, which on iOS 26 gets the Liquid Glass treatment. **Do not use it here.** FincWin's tab bar is bespoke — custom SVG glyphs, specific opacity states, a `.94` translucent canvas tint, and a directional slide animation driven by tab index. Native tabs would replace the brand with the platform's. Use JS `Tabs` with a custom `tabBar` and match the prototype. Revisit only if the user asks for a more platform-native feel.

### Services

| Need | Choice | Note |
|---|---|---|
| Pro tier | **RevenueCat** (`react-native-purchases`) | Wraps StoreKit 2 and Play Billing. Server-side receipt validation and cross-platform entitlement sync come free, which `expo-iap` leaves to you. `react-native-purchases-ui` can serve the gate sheet, but the prototype has its own Pro sheet design — use RevenueCat for entitlements, the prototype's design for the paywall |
| Bank feeds | **Plaid Link** (`react-native-plaid-link-sdk`, v13+, built on Expo Modules) | Needs a dev build. Alternatives: MX, Teller, Finicity |
| Notifications | `expo-notifications` | Bills due, over cap, goal reached, big transaction, low balance. Thresholds, instant-vs-digest, quiet hours |
| Biometrics | `expo-local-authentication` | Face ID / Touch ID / Android Biometric, plus the PIN lock screen |
| Files | `expo-image-picker`, `expo-document-picker`, `expo-file-system` | Receipts, CSV import, exports |
| Errors | Sentry via `@sentry/react-native` | |

### Ship v1 with manual entry only

**Defer Plaid to v1.1.** Bank aggregation costs money per connected account, adds a whole class of support burden, and invites extra store scrutiny. The prototype already models "bank feed provider **or manual**, with last-sync stamp" — ship the manual path, keep the provider abstraction behind it, and turn the feed on when there are paying users to justify it. Same reasoning for brokerage linking.

---

## 4. The Decide engine — build this first, and test it hardest

Everything else in FincWin is a well-made money app. **Decide is the moat.** It is also the only part where a wrong answer is a real harm to a real person's finances. It gets a dedicated phase, a pure-TypeScript module with **no React and no I/O**, and unit tests before any UI.

The prototype's implementation starts at HTML **line 3990** (`// ══ DECIDE ══`). Port these functions as named, pure, exported, tested units:

| Prototype fn | What it does | Test focus |
|---|---|---|
| `dpmt(P, apr, n)` | Standard amortised monthly payment, `r = apr/1200`. Handles `r === 0` as `P/n` | Known amortisation tables; `apr = 0`; `n = 1`; `n = 600` |
| `dfv(mo, apr, n, seed)` | Future value of a monthly contribution plus a seed. Handles `r === 0` | Compound-interest fixtures; zero rate; zero months |
| `dSimMin(bal, rate)` | **Minimum-payment simulation.** Iterates monthly: `pay = max(25, bal*0.01 + interest)`, caps at 600 months, and **detects the never-clears case** when payment ≤ interest | The never-clears branch is the single most important test in the app. A card at a high rate with a 1% minimum genuinely never clears, and the app must say so |
| `dplan(overrides)` | Resolves any of four payment methods — paid in full, deposit + loan, instalment plan, credit card — into `{ price, day, mo, n, fin, tot, interest, dayFees, miss }`. Card path branches on eligibility (blocked / dealer-capped at 5,000 / ok) and payoff plan (full next statement / over N months / minimum only) | Each method × each card plan. The `miss` flag (terms incomplete) must be right, since it drives the `missing` verdict |
| `dassess(plan, extra)` | The verdict. Computes five ledgers (income, expenses, debt, cash, investments) now-vs-after and raises up to five warnings, **sorted by shortfall size**: `month` (month doesn't close) · `cash` (cushion broken) · `dsr` (debt service over line) · `owe` (unsecured debt > 12× average income) · `inv` (investing squeezed). Returns state `fits` / `adjust` / `no` / `missing` | Boundary conditions on all four editable limits. One warning at a time, then combinations |
| `dmoney()` | Derives income steadiness from **logged months**, not a survey answer: coefficient of variation `cv = sd/avg`, then `cv < .06` → Steady, `< .22` → Variable, else Volatile. Basis switches between worst month and average, defaulting from the steadiness | Fixture month sets at each CV boundary. Empty history. One month of history |
| `dshare()` | Household share of a cost under the active split rule (even / by weight / by amount / mine only) | Single member; weights summing to zero; `mine` scope |
| Binary search (line 4596) | **22-iteration bisection for the largest affordable price**, using `dfits(mid)` as the predicate | Converges; respects the `fits` definition; handles "nothing is affordable" and "the full price already fits" |
| `dCardRule()` | Regex eligibility on the item name: car notes, rent, tax, loans, instalments, premiums → `blocked`; car/vehicle/truck/van/motorbike → `capped`; else `ok` | The regexes are word-boundary-padded (`' ' + name + ' '`). Port exactly, then extend the vocabulary deliberately |
| `dsecured(name)` | `/mortgage\|auto\|car\|forester\|home loan\|property/i` — decides whether a debt counts toward the unsecured-debt warning | Note `forester` is a seed-data artefact. Replace name-sniffing with **an explicit `secured` boolean on the loan record**, defaulting via the regex on import |

**Two corrections to make while porting, not after:**

1. **Integer money throughout.** Reimplement every one of the above on integer minor units with explicit rounding rules. Floating-point drift in an amortisation loop over 600 months is real, and this engine tells people whether they can afford a car.
2. **`dsecured` should read a field, not parse a name.** Keep the regex only as an import-time default.

**Do not let the engine touch the database.** It takes a plain snapshot object in and returns a verdict object out. That is what makes it testable, and the tests are what make it trustworthy.

### The five steps

`item` → `price and payment` → `impact` → `alternatives` → `decision`. Plus a **quick check** (item + price → cash answer, no steps). Open checks persist with a live verdict and can be abandoned. Purchase and investment modes diverge at `dplan`. Date picker blocks past dates and offers quick offsets.

### Alternatives and advice

A four-way table — as planned · cheaper · wait and save · skip entirely — each with a money-available-to-save outcome. **Rows must be suppressed and flagged when the money isn't genuinely spare.** That suppression is an ethical feature, not a UI detail: it stops the app from telling someone they could invest the difference when the difference doesn't exist. Advice order: affordable price (bisected) → longer term → cut a real named expense line (which deep-links into Activity) → earn more → save first → do without.

---

## 5. Feature areas

Build in the order the roadmap sets, but scope each from the prototype's corresponding HTML section. The feature inventory the user supplied is the acceptance checklist; it is reproduced in condensed form here with source line numbers.

| Area | HTML | Notes |
|---|---|---|
| **Shell & navigation** | 1855 (tabs), 1879 (FAB), 1992 (detail), 2117 (sheets) | Five tabs + `You` from the avatar. Directional slide between tabs. **8-deep back-history stack** across tabs and details. Push-in detail screens. Context-aware `Add` / `New check` FAB that hides for sheets, bulk mode, onboarding and step flows. ~14 bottom sheets. Toast with inline Undo and a **12-deep undo stack** |
| **Home** | 53 | Net worth + sparkline + range selector, masking toggle, four quick actions, financial-health score (0–100), account list, upcoming |
| **Activity** | 193 | Five views: list, week, split, balance, calendar (month/day). Search, filter, bulk select, bulk delete. Month switcher with restorable archived months |
| **Grow** | 446 | Goals (targets, open-ended, auto-contributions, household-shared with per-member splits, list + progress views) · Investments (holdings, 14 account types, cost-basis lots: buy/sell/dividend/fee, per-holding history, gain/loss, auto-contribution schedules, brokerage linking) · Debt (loans, revolving cards, avalanche/snowball + extra payment, payoff projection, household-shared) |
| **Insights** | 787 | Net-worth series (12 points), cash-flow in/out bars (12 months), range selector, bars vs comparison mode, category breakdowns, month-over-month |
| **Decide** | 953 | See §4 |
| **You** | 1762 | Profile, sign in/out, licence key + seats + renewal + receipt, device list with current-device marker, Face ID, notifications, round-up, offline mode, PIN lock screen, typeface switcher, accent |
| **Household** | 2789 (sheets), 3181 (account) | Multiple households each with own currency, split rule and note. Members with colour, role, weight; custom roles. Four split rules. Per-category split defaults. Settlements with per-person balances and an expiry window. Scope toggle mine-vs-household. **Name-sharing privacy toggle** (falls back to the colour names). Household export as an expiring read-only link |
| **Onboarding & tiers** | 3101 (flow), 3043 (features) | 11-question flow (`Component.QS`, line 3300+) → starting level. Four levels, 50 gated features (`Component.FEATS`, line 3238+), each with area and minimum level. Per-feature contextual offers. Free vs Pro gate sheet with a stated reason |
| **Alerts** | script §3081 | Five kinds, amount thresholds, instant or digest, quiet hours, alert log |
| **Import & assist** | script §3043 | CSV-style import for expenses, income, goals, debt. Coach in summary or question mode |

**Note on the level-9 features.** In `Component.FEATS`, the five `Sharing` features carry level `9` — above the top tier of 4. That is the prototype's way of saying "household is orthogonal to level; it turns on only if onboarding says you share money." Model it as a separate capability flag, not a level.

### Copy is part of the design

The prototype's microcopy is unusually good and unusually opinionated — *"Pick the currency you get paid in, not the one you spend most in — it is the one your head does maths in."* · *"Passing changed no balance. Not spending is not saving, so nothing was added to your net worth either."* · *"Most people turn alerts off because the first week was too loud."*

**Port the strings verbatim.** They carry the product's voice and several of them are doing real explanatory work. Put them in a typed i18n catalogue from day one (`i18n-js` or `expo-localization` + a flat catalogue) so localisation later doesn't mean a rewrite. Note the prototype uses British-ish spelling and typographic apostrophes (`’`) consistently — keep both.

---

## 6. Architecture

```
app/                          Expo Router v7 routes
  (tabs)/                       home · activity · grow · decide · insights
  decide/[checkId]/             step 1–5
  detail/[kind]/[id]/           push-in record screens
  onboarding/
  lock.tsx
src/
  engine/                     ── PURE. No React, no I/O, no imports from src/db
    decide/                     dplan · dassess · dmoney · dSimMin · dpmt · dfv ·
                                bisect · advice · alternatives · setbacks
    money/                      Money type, minor units, rounding, FX conversion
    split/                      household split rules
    payoff/                     avalanche · snowball · projection
    health/                     the 0–100 score
    __tests__/                  the majority of the suite lives here
  db/                         Drizzle schema, migrations, queries, live hooks
  state/                      Zustand: navStack, sheetStack, undoStack, toast, bulk
  ui/                         primitives — Card, Pill, Sheet, Row, Money, Sparkline…
  theme/                      tokens, 4 accents, 4 font pairings, reduced-motion
  features/<area>/            screen-level composition per §5
  services/                   supabase · revenuecat · plaid · notifications · biometrics
```

**The `engine/` boundary is the most important line in this codebase.** Enforce it with an ESLint `no-restricted-imports` rule: nothing in `engine/` may import from `db/`, `state/`, `services/`, `ui/` or `react`. It is what lets the financial maths be tested exhaustively and reviewed in isolation.

### Testing

- **Unit (Jest):** the whole engine. Target ~100% branch coverage on `decide/`, `money/`, `payoff/`, `split/`. Golden-file fixtures for the verdict object across a matrix of month histories × payment methods × limit settings.
- **Property-based (`fast-check`):** money arithmetic round-trips; `dassess` never returns `fits` when `left < 0`; the bisection result always satisfies `dfits`.
- **Component (React Native Testing Library):** sheets, the FAB's context rules, the 8-deep back stack, the 12-deep undo stack.
- **E2E (Maestro):** flows only — onboarding → first transaction → full 5-step check → decision written → estimate-vs-actual. Maestro runs on Windows against Android and against cloud iOS.
- **Visual:** screenshots from the Android emulator and EAS Simulator, diffed against `screens/*.png`.

**Quality gate:** an engine change that drops branch coverage below threshold fails CI. No exceptions.

---

## 7. Store compliance

Get this right before writing code; two of these shape the data model.

### Apple

- **Guideline 3.2.1** requires apps for "financial trading, investing, or money management" to be submitted by a licensed financial institution **where the app performs those services.** FincWin does not: it records the user's own data and does arithmetic on it. It holds no money, executes no trades, offers no loans, and gives no regulated advice. **Position it explicitly as a personal record-keeping and planning tool.** Practical consequences:
  - Never use "advice", "recommendation", "you should" in verdict copy. The prototype's voice is already declarative-not-prescriptive ("the month doesn't close", "the cushion breaks"); hold that line.
  - Add a plain, findable disclaimer: not financial advice, figures are the user's own, no institution is involved.
  - The payoff planner and cost-basis lots are **calculators over user-entered figures**, not tax or investment advice. Label them that way. Do not compute tax liability.
  - 3.2.1(viii)'s personal-loan rules (36% APR cap, 60-day minimum term) **do not apply** — FincWin offers no loans. Do not let the Decide card path be mistaken for one; it models a loan the user is considering elsewhere.
- **In-app account deletion is mandatory** (enforced since 30 June 2022) and must be easy to find in settings. It must actually purge — local DB *and* Supabase. Since FincWin is local-first, also handle "delete the account but keep local data" as a distinct, clearly-labelled choice.
- **Privacy manifest** `PrivacyInfo.xcprivacy` is required, with required-reason API declarations and valid signatures for any commonly-used third-party SDK added as a binary. RevenueCat and Plaid both ship manifests; verify after every dependency bump.
- **App Privacy** questionnaire: declare Financial Info, Contact Info, Identifiers, Usage Data honestly. Local-first is a genuine selling point here — say so.
- **Sign in with Apple** is required if any other third-party sign-in is offered. Supabase Auth supports it.
- Export compliance: set `ITSAppUsesNonExemptEncryption` correctly (standard HTTPS/platform crypto is exempt; SQLCipher may not be — check if §9's encryption question resolves toward it).
- Household export links must expire, as the prototype already specifies.

### Google Play

- **The Financial features declaration is mandatory** for any app with financial features, including on closed and open testing tracks. Complete it in Play Console before the first internal-testing upload. Declare **personal finance management**, not lending, not investing on the user's behalf.
- **Data safety** form must match the privacy policy and the actual behaviour.
- Lending-app restrictions (no contacts, no photos access) don't bind FincWin, but note it **does** want photo access for receipts. Scope it narrowly with `expo-image-picker`'s limited-library access and explain the reason in-line, so review sees a receipt feature rather than a data grab.
- Target API level and 16 KB page-size compliance: SDK 55 handles both; keep Expo current.

### Both

- Privacy policy and terms at a real URL before the first submission.
- Age rating: 4+ / Everyone. No gambling framing anywhere — the Decide tab must never read like a bet.
- Screenshots and metadata for both stores, generated from the Android emulator and EAS Simulator on Windows. Six device sizes for iOS, plus a 1024×1024 icon.

---

## 8. Roadmap shape

Suggested phases for GSD to refine. Each ends shippable and demoable.

| # | Phase | Delivers |
|---|---|---|
| 0 | **Foundation** | Expo SDK 55 + TS strict + Router v7. EAS project, three build profiles, dev build on Android emulator. **Trigger the first iOS EAS Build on day one** — provisioning surprises are cheaper in week one than week ten. EAS Simulator waitlist. Design tokens, 4 accents, 4 font pairings, theme context, reduced-motion. `engine/` boundary + ESLint rule + CI |
| 1 | **Money core** | `Money` on integer minor units, FX with 6 currencies + custom, Drizzle schema, migrations. The whole `engine/money` suite green |
| 2 | **Record** | Entry sheet, transactions, categories, accounts, Activity list view, month switcher, toast + 12-deep undo. First real dogfood build |
| 3 | **Shell** | Five tabs, custom tab bar with the bespoke SVG glyphs, directional slide, 8-deep back stack, push-in details, sheet infrastructure with drag-to-dismiss, context-aware FAB |
| 4 | **Decide engine** | Pure TypeScript, fully tested, **no UI.** The phase's deliverable is a green test suite and a coverage report |
| 5 | **Decide UI** | Quick check, five steps, open checks, past decisions, estimate-vs-actual, date picker |
| 6 | **Grow** | Goals, investments with lots, debt with avalanche/snowball and payoff projection |
| 7 | **Insights** | Net-worth series, cash-flow bars, breakdowns, comparison mode. Activity's remaining four views |
| 8 | **Household** | Multiple households, members, four split rules, per-category defaults, settlements, scope toggle, privacy toggle, expiring export. **Supabase + RLS lands here** |
| 9 | **Tiers & onboarding** | Question flow, four levels, 50 gated features, contextual offers, RevenueCat + Pro gate |
| 10 | **System** | Alerts + quiet hours + log, notifications, Face ID + PIN lock, offline mode, round-up, licence + seats + devices, import, coach, archive, export, **in-app account deletion** |
| 11 | **Compliance & release** | Privacy manifest, App Privacy, Play Financial features declaration, policy + terms, store assets, TestFlight, internal testing, submit |
| 12 | **v1.1** | Widgets (WidgetKit + Glance config plugins), Plaid feeds, brokerage linking |

---

## 9. Open questions — resolve in `/gsd-discuss-phase`, don't guess

1. **Encryption at rest.** SQLCipher via `op-sqlite` (stronger, adds a native dep, possible export-compliance paperwork) versus platform full-disk encryption plus a biometric app lock (simpler, adequate for most threat models)? Recommendation: **platform encryption + app lock for v1**, SQLCipher if a user or a prospective partner asks.
2. **Is Supabase sync in v1 at all?** The app works fully offline. Cloud sync only becomes necessary for household sharing (phase 8) and multi-device. A local-only v1 is smaller, more private and faster to ship. Recommendation: **local-only through phase 7**, Supabase arriving with households.
3. **Pro tier boundary.** Which of the 50 features are Free and which are Pro? `Component.FEATS` carries levels but not price tiers. Needs a pricing decision.
4. **One household or many in v1?** The prototype supports multiple. Multiple households multiplies the scope-toggle and settlement surface considerably.
5. **Widgets in v1 or 1.1?** Recommendation above is 1.1. Confirm.
6. **Physical iPhone available?** Materially changes the iOS dev loop and the honesty of pre-submission testing.
7. **Apple Developer Program enrolled?** Individual or organisation — enrolment can take days to weeks, so start it now regardless of code progress.
8. **Does "licence key, seats, renewal" coexist with RevenueCat subscriptions,** or is the licence model being replaced by subscriptions? The prototype has both and they overlap.
9. **Tax pack scope.** "Flag lines and export them together" is safe. Anything that computes a liability is not. Confirm it stays an export.

---

## 10. Definition of done for v1

- Every feature in the inventory either implemented, or explicitly deferred with a recorded reason.
- `engine/` at the coverage threshold, including the never-clears branch of `dSimMin` and every warning in `dassess`.
- All money paths on integer minor units. No `parseFloat` on user input anywhere.
- Visual diff against `screens/*.png` within tolerance on iOS and Android.
- Full offline operation: airplane mode, record a month, run a check, write a decision, reopen the app.
- Reduced-motion and screen-reader passes on both platforms.
- In-app account deletion actually purges.
- Privacy manifest, App Privacy answers, Play Financial features declaration all filed.
- TestFlight build installed and exercised on a physical iPhone; internal-testing build on a physical Android.
- Not-financial-advice disclaimer present and findable.

---

## 11. Instruction to the implementing agent

Read `FincWin United.dc.html` top to bottom before planning — all 7,018 lines. It is dense but it is the specification, and it answers more questions than it raises. Then:

1. Build the **`engine/` boundary and the Decide maths first**, with tests, before any screen work beyond the shell. Getting the financial logic right is the whole product; the UI is the part that can be iterated.
2. **Match the design exactly.** The tokens in §2 are the complete palette and type scale. The prototype's restraint is deliberate — do not add gradients, extra shadows, more colours or a different icon set.
3. **Keep the copy.** Verbatim, in an i18n catalogue.
4. **Money is integers.** Every time.
5. **Ask rather than guess** on anything in §9, and on anything the HTML leaves genuinely ambiguous. The prototype's own handoff README says the same, and it is right: clarifying is cheaper than rebuilding.
