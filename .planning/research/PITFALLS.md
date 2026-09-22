# Pitfalls Research

**Domain:** Cloud-first personal/household finance app (record-keeping + affordability engine + LLM coach), iOS + Android, built on Windows with no Mac
**Researched:** 2026-09-21
**Confidence:** MEDIUM-HIGH (store-guideline text verified live against developer.apple.com; Google Play declaration behaviour verified against Play Console Help and live developer-community threads; EAS Simulator status verified against Expo's own waitlist page; several findings are single-source real-developer accounts and are flagged LOW/MEDIUM accordingly)

---

## Critical Pitfalls

### Pitfall 1: Trusting the guideline citation already in the brief, not the live text

**What goes wrong:**
`BUILD-PROMPT.md` §7 attributes the 36% APR / 60-day personal-loan cap to "3.2.1(viii)." It doesn't. Live text, fetched from `developer.apple.com/app-store/review/guidelines/` on 2026-09-21:

> **3.2.1(viii)** — "Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services and must have necessary licensing and permissions in the locations where you make them available."
>
> **3.2.2(ix)** (Unacceptable Business Model Practices) — "Apps offering personal loans must clearly and conspicuously disclose all loan terms... Loan apps may not charge a maximum APR higher than 36%... and may not require repayment in full in 60 days or less."

These are two different clauses under two different top-level guidelines (3.2.1 = "Other Business Model Issues, Acceptable"; 3.2.2 = "Other Business Model Issues, Unacceptable"). More importantly: **3.2.1(viii)'s current live wording no longer carries the "where the app performs those services" qualifier** that the brief and `PROJECT.md` both assume softens it. The clause as published today reads as a flat requirement that money-management apps be submitted by a licensed financial institution — full stop. In practice this text is applied selectively (YNAB, Copilot, Monarch, Cleo, Rocket Money all ship as independent developers, not banks), but a reviewer reading the clause literally has textual grounds to push back on any app whose self-description leans toward "manages your money" rather than "records what you tell it and does arithmetic on it."

**Why it happens:**
Apple's guideline text has been edited over time (the public-API carve-out for 3.2.1 was removed at some point pre-2026) without the wording softening back toward its old spirit. Teams copy a remembered or brief-stated version of a guideline instead of re-reading the live page at submission time, and citation numbering silently drifts between minor guideline revisions.

**How to avoid:**
- Re-fetch the live guideline text in the Compliance phase, not just at project kickoff — do not treat this research file's quote as permanently current either.
- Correct the internal citation: loan-term restrictions are 3.2.2(ix), not 3.2.1(viii). Any reviewer-facing compliance note or App Review notes field that cites the wrong clause looks careless and invites closer scrutiny.
- In the App Review "Notes" field on every submission (not just the first), proactively state in one or two sentences: this app performs no trading, investing, lending or custody; all figures are user-entered; no institution license is implicated. Reviewers do skim these notes, and the CoinCoach account (below) suggests unclear framing costs review cycles more than actual content violations do.

**Warning signs:** Any compliance documentation, App Review note, or internal doc that cites "3.2.1(viii)" for anything other than the money-management submission clause.

**Phase to address:** Compliance & release (final verification), but the correct citation should be fixed in `PROJECT.md`/roadmap docs during Foundation so it doesn't propagate.

**Severity:** Low cost in isolation (a documentation fix), but the underlying live-text drift it exposes is a rejected-submission-severity risk if positioning copy is ever loosened without re-checking the guideline.

---

### Pitfall 2: What actually triggers finance-app rejection is IAP/subscription mechanics, not the "advice" framing

**What goes wrong:**
The one detailed, real, recent (2026) account found of an AI personal-finance app going through Apple review — "CoinCoach," an AI budgeting app built by an indie developer for his mother, documented on Indie Hackers — was rejected **twice**, and neither rejection was 3.2.1. The cited guidelines were **2.1(b)** (App Completeness — subscription not properly attached to the version), **3.1.2(c)** (subscription disclosure copy missing auto-renewal terms, 24-hour cancellation notice, and Privacy Policy/Terms links in the app description), and **1.5** (support URL pointing back into the app instead of a real support page). The second rejection happened because the developer's App Review demo video showed "Restore Purchases" instead of "a complete fresh purchase flow" from a clean sandbox account — Apple's reviewer could not verify the subscription actually worked from a cold start. Total resolution time for the second round: about four hours once the actual defect (demo video, not code) was identified.

**Why it happens:**
Teams that spend their compliance energy on the "are we secretly a bank" question (genuinely worth doing — see Pitfall 1) under-invest in the unglamorous, mechanical parts of the submission: subscription metadata correctly attached to *this* build's version record in App Store Connect, subscription disclosure boilerplate present verbatim in the app description, a real support URL, and — critically — a review demo that shows a purchase happening, not a purchase being restored.

**How to avoid:**
- Treat subscription/IAP submission mechanics as their own checklist item in Compliance & release, separate from the 3.2.1 content-framing question.
- Before first submission: verify the in-app purchase / subscription is explicitly attached to the version being submitted in App Store Connect (not merely created in the account).
- App description must carry Apple's required subscription disclosure language: title, length, price, auto-renewal terms, cancellation instructions, links to Privacy Policy and Terms of Use — verbatim, not paraphrased.
- Record the App Review demo from a **freshly signed-out Apple ID with a new sandbox tester**, showing the complete purchase flow from the Home Screen forward — never a "Restore Purchases" tap as the primary demonstration.
- Support URL must resolve to a real page with contact information, not a deep link back into the app.

**Warning signs:** Reviewer notes citing 2.1, 3.1.2, or 1.5 rather than 3.2.x — this pattern indicates the rejection is about how the subscription is shown/described, not what the app does.

**Phase to address:** Tiers & onboarding (RevenueCat + subscription copy) for the disclosure language; Compliance & release for the submission-metadata checklist and demo recording.

**Severity:** Days — CoinCoach's second round cost roughly a week of calendar time (review turnaround) for what was, in the end, a four-hour fix. Avoidable with a pre-submission checklist.

---

### Pitfall 3: The Coach and the Decide verdict are the two places genuine 3.2.1/advice risk actually lives — and the Coach's terms are still an open decision

**What goes wrong:**
`PROJECT.md` already flags the Coach as "an undeclared LLM feature" and the Decide verdict as the one place a wrong answer causes real harm. This is correct, and it is also where 3.2.1 content risk (as opposed to the mechanical risk in Pitfall 2) concentrates. A free-text LLM answering "can I afford this car" or "should I pay off this card or invest" in natural language is structurally the thing 3.2.1 exists to catch, regardless of how the arithmetic underneath is scoped. Unlike the deterministic `dassess` verdict (whose copy can be audited word-by-word for "advice," "recommend," "should"), an LLM's free-text output is not fully controllable at review time — the model can drift into prescriptive language ("you should pay off Card A first") even with a system prompt forbidding it, especially across the daily-quota's worth of varied user phrasing.

**Why it happens:**
LLM output is non-deterministic and the surface area of "things a user might ask a money coach" is unbounded. A system prompt that says "never say you should" reduces but does not eliminate prescriptive-sounding completions, and Apple reviewers testing an AI finance feature will actively try to elicit exactly that failure mode.

**How to avoid:**
- Resolve the open question in `PROJECT.md` ("Is the Coach a real LLM, and on what terms?") before the Tiers phase starts, not during it — this is a scoping decision with compliance consequences, and it is currently unresolved-and-pending per the project doc.
- Constrain the Coach's output space deliberately: prefer templated/structured responses over pure free-text generation wherever the question maps to a known shape (spend summaries, category breakdowns, progress toward a goal), and reserve free-text generation for genuinely open questions, with the system prompt enforcing descriptive-not-prescriptive phrasing and a server-side post-filter that rejects or rewrites completions containing prescriptive trigger phrases ("you should," "I recommend," "the best move is") before they reach the user.
- Keep the deterministic Decide verdict and the LLM Coach clearly separated in the UI and in review notes — the verdict is pure arithmetic over user data (defensible), the Coach is generative (needs its own scrutiny and its own disclaimer, visible at first use, not buried in settings).
- Log a sample of Coach outputs during internal/closed testing and grade them against the "no advice" bar before submission — this is the only realistic way to catch prescriptive drift before a reviewer does.

**Warning signs:** Any Coach response in testing that contains "should," "recommend," "best," or a specific instruction to take a financial action ("pay off," "invest in," "switch to").

**Phase to address:** Tiers & onboarding (Coach scoping decision, before implementation) and System (Coach implementation, prompt/filter design).

**Severity:** Rejected submission if shipped without the filter and scrutiny above — this is the single highest-severity content risk in the whole project, higher than the record-keeping features which are well-precedented by shipped competitors.

---

### Pitfall 4: EAS Simulator is still an early-access waitlist product in 2026 — plan the iOS dev loop around the physical iPhone, not around it

**What goes wrong:**
As of this research (September 2026), EAS Simulator remains gated behind a waitlist at `expo.dev/services/eas-simulator-waitlist`, described by Expo itself as "early access," iOS-only, with no published pricing. `BUILD-PROMPT.md` §3 already correctly labels it "limited-access preview" and recommends joining the waitlist on day one — that instinct is right, but the roadmap and the developer's own expectations should not assume simulator access arrives on any particular schedule. There is no public GA announcement to point to.

**Why it happens:**
It's tempting to plan a Windows-only iOS dev loop around a cloud simulator because it sounds like the cleanest gap-filler for "no Mac, no physical checks between EAS Build runs." But waitlist products ship on their own timeline, and a plan that quietly depends on simulator access arriving mid-project creates a scheduling risk nobody chose deliberately.

**How to avoid:**
- Join the waitlist on day one (already planned) but build the actual dev-loop plan around the two channels that are certain: the Android emulator (full local speed, ~90% of the work) and the physical iPhone XR over a development build (`eas build --profile development --platform ios`, installed OTA). Treat EAS Simulator as a bonus if/when access arrives, not a dependency.
- Because the test device is an iPhone XR (A12, tops out at iOS 18), anything genuinely iOS-26-specific is untestable locally regardless of simulator access — but per the project's own scope, native tabs and Liquid Glass are already ruled out, so this is low-impact.
- Budget cloud iOS build turnaround (minutes, not seconds) into the iteration rhythm for any native-code change (RevenueCat, Plaid — deferred, biometrics, notifications config); keep native-touching changes batched rather than iterated one-at-a-time.

**Warning signs:** Roadmap or phase plans that schedule specific iOS QA activities assuming simulator access by a fixed date.

**Phase to address:** Foundation (dev-loop setup and waitlist signup); revisit at each phase transition if access has not arrived.

**Severity:** Days of friction if unaddressed (slower iOS iteration throughout), not a blocker — the physical-device path is a fully adequate substitute per Expo's own dev-loop guidance and the project's existing plan.

---

### Pitfall 5: Provisioning and entitlement mismatches surface late, not at the first build

**What goes wrong:**
Multiple developer accounts (Apple Developer Forums, `expo/eas-cli` issue #2107) describe EAS-generated provisioning profiles being rejected or incomplete in ways that only surface when a build actually needs a capability the profile doesn't carry: "provisioning profile is missing the following devices" even when the device is active in the portal, and EAS-generated profiles missing entitlements for capabilities like App Groups or Family Controls that were added to the app config after the first profile was minted. The pattern is specific: the *first* iOS build (with a minimal capability set) succeeds, and the failure appears weeks later when a phase adds a new native capability — push notifications, Sign in with Apple, biometrics — that requires the provisioning profile to be regenerated with a matching entitlement, and it wasn't.

**Why it happens:**
EAS Build (correctly) generates and manages provisioning profiles automatically, but automatic regeneration is keyed to what `app.json`/config plugins declare at build time. A profile minted for a bare-bones build does not retroactively gain entitlements when a later phase adds `expo-notifications`, `expo-local-authentication`, or the Sign in with Apple capability unless the build pipeline is re-run with the credentials explicitly refreshed. Because this project's roadmap deliberately front-loads a trivial "hello world" iOS build in Foundation (correct instinct, cheaper surprises early) and then adds real native capabilities in System (biometrics, notifications) and earlier for Sign in with Apple (mandatory per constraints), there are at least two later points where the provisioning profile needs to be widened, not just reused.

**How to avoid:**
- Every phase that adds a new native capability (Sign in with Apple, `expo-local-authentication`, `expo-notifications`, RevenueCat) must include an explicit "trigger a clean EAS Build and confirm the provisioning profile picked up the new entitlement" step — do not assume the existing profile silently updates.
- Use `eas credentials` to inspect the current provisioning profile's entitlements before assuming a build will succeed after adding a capability.
- Because Sign in with Apple is a mandatory constraint here (Google sign-in is offered, so per Guideline 4.8 native SIWA is required), get that entitlement into the profile in the Foundation or System phase where auth lands — do not let it be the first capability discovered missing at Compliance time.

**Warning signs:** A previously-green EAS Build failing immediately after a phase that added a new Expo config plugin or native permission, with a provisioning/entitlement error rather than a code error.

**Phase to address:** Foundation (baseline build), and re-verify at System (biometrics, notifications) and wherever Sign in with Apple auth lands (Foundation/System boundary per this project's account-at-onboarding requirement).

**Severity:** Days if caught via the checklist above; can be a week+ if discovered for the first time during Compliance & release with a submission deadline pressure.

---

### Pitfall 6: The Financial features declaration has to be right on day one of internal testing, and "inaccurate declaration" is a real, recurring, self-inflicted rejection loop

**What goes wrong:**
Google Play's Financial features declaration is mandatory for **every** app published on Google Play — including ones with zero financial features (which must explicitly certify that) — and including closed and open testing tracks, not just production. Live Google Play Developer Community threads from 2026 show a recurring, unresolved-feeling pattern: developers submit an update, get rejected for "the financial features declaration you have provided for your app is inaccurate," fix what they believe is the mismatch, and get rejected again on the same grounds — with no detailed diagnostic from Google about which specific claim is wrong, only that it doesn't match observed app behaviour. Community members report this becoming a multi-round back-and-forth resolved only through Play Console's help/appeal channel.

**Why it happens:**
The declaration is checked against **actual observed app behaviour**, not just the checkbox answers — so a declaration that under- or over-states what the app does (e.g., declaring "personal finance management" while the app also technically touches debt/loan tracking, investment cost-basis, or household settlement balances in ways Google's automated or manual review reads as adjacent to lending/investing) creates a mismatch. Because this project adds financial surface area incrementally across phases — Money core, then Grow's investments and debt with avalanche/snowball payoff, then Household settlements — the declaration filed at first internal-testing upload can go stale as later phases ship features the original declaration didn't anticipate.

**How to avoid:**
- File the Financial features declaration before the **first** internal-testing upload (not deferred to Compliance & release), and write it to already describe the full v1 feature set — personal finance management, no lending, no investing-on-behalf-of-the-user, no payments processing — even though early builds won't yet exercise all of it. Filing narrow and widening later is exactly the pattern that produces the "inaccurate declaration" loop.
- Re-review the declaration at each phase transition that adds financial surface area (Grow, Household, Tiers) and re-file if the description needs to change — do not treat it as filed-once.
- Be precise that debt/loan **tracking** (user's own existing loans, for planning) is categorically different from **offering** loans, and that investment **holdings tracking** (cost-basis lots) is different from **executing trades or managing investments on the user's behalf** — the declaration form's free text should say this explicitly, because the mismatch Google's reviewers flag is usually category-adjacency, not outright falsehood.

**Warning signs:** Any Play Console upload rejected citing the financial features declaration with no other content violation named.

**Phase to address:** Money core (file the initial declaration ahead of first internal-testing build) and Household/Grow/Tiers (re-verify and re-file as scope grows).

**Severity:** Weeks if it enters the appeal-loop pattern described above; the community accounts show this is not a same-day fix.

---

### Pitfall 7: Mandatory account-at-launch is a real activation cost — and Apple review sometimes pushes back on it separately from whether it's ultimately allowed

**What goes wrong:**
Industry data on forced-signup walls is consistent and stark: a sign-up wall routinely costs 20–40% of users at the door, and removing a mandatory-signup requirement has been observed to lift Day-1 retention by 15–30% elsewhere. Separately, Apple's live Guideline 5.1.1(v) text reads: "If your app doesn't include significant account-based features, let people use it without a login... Apps may not require users to enter personal information to function, except when directly relevant to the core functionality of the app or required by law." The documented 2026 rejection pattern under this clause is specifically "forced registration before non-account features" — i.e., a reviewer testing the app and finding that some portion of it (viewing static content, reading help copy, seeing what the app is before committing) is gated behind sign-in when it plausibly needn't be.

FincWin's case for mandatory account genuinely qualifies as "directly relevant to core functionality" — cloud sync, household sharing, and cross-device entitlement are load-bearing architectural decisions, not incidental. But that argument has to be *made*, not assumed, because the guideline's default posture is "let people in first."

**Why it happens:**
Teams that have already committed to cloud-first architecture (as this project has, deliberately, rejecting local-first) treat "account required" as self-evidently justified by the architecture and don't separately design the onboarding *sequence* to demonstrate that justification to a reviewer — or to soften the activation cost for real users, who don't read architecture docs.

**How to avoid:**
- Product/UX: the 11-question onboarding flow should establish value (this is what the app does, this is the level you'll land at) before the account step, so the account prompt arrives after the user has a mental model of what they're signing up for — not as the very first screen. This also directly addresses the activation-drop-off data above.
- Compliance: the App Review notes should explicitly state why account-before-use is required (cloud sync as source of truth, household real-time sharing) so a reviewer doesn't have to infer it, and doesn't read the app as gate-keeping ordinary record-keeping behind login for no stated reason.
- Make the sign-in step itself as frictionless as the architecture allows — Sign in with Apple and Google as one-tap primary options (already planned) — because the *speed* of the first account action affects both the activation-drop-off numbers above and how a reviewer perceives whether the gate is reasonable.

**Warning signs:** App Review rejection citing 5.1.1 or "account creation," or (product-side) very early analytics showing a large fall-off between install and completed sign-in once real users arrive.

**Phase to address:** System (auth implementation) and Tiers & onboarding (the 11-question flow sequencing, which should precede rather than follow the account step in the user's actual path).

**Severity:** Compliance risk is MEDIUM (defensible with the right framing, per the guideline's own "directly relevant to core functionality" exception); product risk is real regardless of compliance outcome — expect meaningful activation loss unless the onboarding sequence and sign-in speed are both well executed.

---

### Pitfall 8: Passkeys on React Native are less mature than "2026" makes them sound; Sign in with Apple has two specific, well-documented traps

**What goes wrong:**
Direct search for "React Native passkeys 2026" turned up no first-party Expo or React Native passkey API and no strong evidence of passkeys-on-RN being a mature, batteries-included path — this is a genuine gap in what's verifiable, not a confirmed absence, and should be flagged **LOW confidence, needs validation at implementation time** rather than asserted either way. What is well documented (MEDIUM-HIGH confidence, multiple sources including Supabase's own docs) are two specific Sign in with Apple traps:

1. **Apple only returns the user's full name and email on the very first authorization.** Every subsequent Sign in with Apple attempt from the same user returns `null` for those fields. If the first-sign-in payload isn't captured and persisted immediately (server-side, tied to the Supabase user record), that data is permanently unrecoverable through the Apple sign-in flow itself.
2. **Session persistence and redirect handling are the actual hard parts**, not the sign-in button. Real accounts describe sessions "vanishing after backgrounding" and redirect flows "not returning cleanly" once running as an actual installed build (versus a dev-server preview) — these are integration bugs that only appear on-device, not in a simulator or web preview.

**Why it happens:**
Passkey support across native mobile frameworks is a fast-moving, unevenly-documented area, and generic "2026" framing in marketing content outpaces what's actually shipped and stable in React Native specifically. Sign in with Apple's first-authorization-only data quirk is a Apple platform behaviour independent of any library, and is easy to miss because it doesn't show up in early testing (where the developer keeps re-triggering "first" sign-in via fresh sandbox accounts) — it only bites real users who sign in normally.

**How to avoid:**
- Treat passkeys as a stretch goal for v1, not a committed feature, until a concrete, current (checked at implementation time, not from this research) React Native passkey library is verified to work with Supabase Auth on both platforms. Ship Sign in with Apple, Google, and (if needed) email OTP as the reliable primary paths.
- On first Sign in with Apple authorization, immediately persist the returned full name and email to the user record server-side — never assume it can be fetched again on a later call.
- Test session persistence specifically on installed development/production builds after backgrounding the app for an extended period, not just in the initial dev-server loop — this is exactly the kind of bug that passes casual testing and fails in the field.

**Warning signs:** Any user profile showing a null name after their first Apple sign-in; session-expired states appearing after normal app backgrounding rather than after the expected token TTL.

**Phase to address:** System (auth implementation).

**Severity:** Days if the first-authorization data capture is missed and caught in testing; potential permanent data gaps for affected real users if missed and shipped (recoverable only by asking the user to re-enter their name manually).

---

### Pitfall 9: Offline queue correctness — the five failure modes that don't show up until real usage

**What goes wrong:**
The project already correctly identifies "queued writes and cached reads" as designed-in via the prototype's existing `Work offline` toggle and sync stamp. The failure modes that bite are specific and well-documented across offline-first postmortems:

1. **Duplicate writes on retry.** A write is sent, the response is lost (not the write — just the confirmation), the client retries, and the server executes it twice. Without an idempotency key, "record a $40 grocery expense" becomes two $40 expenses.
2. **Clock skew on client timestamps.** A phone with a wrong clock stamps a queued transaction with a timestamp that's hours or days off, which corrupts month-boundary logic (which month does this expense belong to?) and — for this project specifically — corrupts the `dmoney()` steadiness calculation and any month-switcher logic that depends on chronological ordering of logged months.
3. **Queue corruption / loss on force-quit.** If the queue lives in memory rather than durable storage, a force-quit mid-flush silently drops queued writes with no user-visible error — the user believes they recorded something that never reached the server.
4. **Unbounded queue growth.** A user who goes offline for an extended period (the explicit "opened on planes and in basements" scenario `PROJECT.md` cites) and keeps recording transactions needs the queue to handle dozens of entries without degrading, and needs a way to know the queue is large before it becomes a problem.
5. **Delete/undo replay against a moved target.** This project's own undo-as-compensating-writes design (already correctly identified as needing redesign from the prototype's snapshot approach) is exactly the scenario where a queued delete or undo, replayed after a household member has already mutated the same record via Realtime, needs strong identity and version awareness rather than blind replay — "delete transaction #123" replayed after #123 was already edited by someone else needs a defined, safe behaviour, not a guess.

**Why it happens:**
Offline-tolerant sync is simple to describe and easy to prototype for the happy path (write while offline, sync when back online), and the failure modes above only appear under real-world conditions — flaky connectivity, backgrounding, force-quits, concurrent household edits — that a development environment with a fast, reliable connection doesn't naturally exercise.

**How to avoid:**
- Give every queued mutation a client-generated idempotency key (UUID, created once per user action, reused across all retries of that action) and a server-side dedupe check with a TTL comfortably longer than any realistic offline period (24+ hours, arguably longer given the "opened on planes" scenario extends beyond a single flight).
- Never trust the client clock for record ordering or month-bucket assignment; the server assigns the authoritative `created_at`/ordering timestamp on write, with the client-supplied timestamp retained only as a user-facing "logged at" display value if needed.
- Persist the queue to durable local storage (not in-memory state), so app restart/force-quit doesn't lose queued writes; surface queue state honestly in the UI (the prototype's own "offline · 3 changes queued" pattern is the right instinct — keep it accurate).
- Design an explicit queue size/age ceiling with user-visible warning ("12 changes queued for 3 days — connect to sync") rather than letting it grow silently.
- Because undo is compensating writes against server state (per the project's own correct redesign decision), every compensating write needs to check the current server state of its target before applying, and define an explicit, tested behaviour for "target has changed since the original write" rather than assuming last-write-wins is safe for a shared household ledger.

**Warning signs:** Duplicate transactions appearing after a flaky-connection test; transactions landing in the wrong month after a device-clock change; queued changes silently vanishing after a force-quit test.

**Phase to address:** System (offline tolerance) for the queue mechanics; Household (Realtime) for the concurrent-edit/undo-replay interaction, since that's where the compensating-write-against-moved-target scenario becomes possible.

**Severity:** Weeks if discovered late (this is exactly the kind of bug that requires a data-model rethink, not a patch) — build the idempotency key and durable-queue design in from the System phase's first line of code, per the explicit recommendation in every offline-sync postmortem found.

---

### Pitfall 10: Financial calculation correctness — rounding, the never-clears branch, and bisection monotonicity

**What goes wrong:**
Three distinct numerical failure classes apply directly to this project's Decide engine, even with the integer-minor-units correction already planned:

1. **Rounding residual distribution in amortisation.** Even on integer cents, a fixed-rate loan's per-period interest (`principal × rate/12`, rounded) does not sum exactly across all periods to the total interest implied by the closed-form payment formula — there is always a small residual. The standard, correct pattern is: every row must satisfy `principal + interest == payment` except the **final** row, which absorbs the entire residual. If any non-final row fails that identity, or if the residual is distributed by naive `.toFixed()`-style rounding, the schedule is quietly wrong and integer-minor-units alone does not save you from this — it only removes binary floating-point drift, not rounding-policy bugs.
2. **`dSimMin`'s never-clears branch needs to be detected structurally, not just capped.** The project's own docs already flag this as "the single most important test in the app" — correct. The specific failure mode to guard against: if the never-clears condition (`payment ≤ interest`) is checked only implicitly (by running out the 600-month cap and noticing the balance never hit zero), a card that clears in month 599 and a card that mathematically never clears look identical at the cap boundary unless the `payment ≤ interest` condition is tested explicitly, every month, and reported as a distinct outcome from "clears slowly."
3. **Bisection assumes `dfits(mid)` is monotonic in price — verify that assumption holds, don't just assume it.** The 22-iteration binary search for "largest affordable price" is only correct if affordability is monotonically non-increasing as price increases. `dassess` raises up to five independent warnings across five ledgers (income, expenses, debt, cash, investments); it is worth explicitly confirming (via property-based tests, which the project already plans via `fast-check`) that no combination of these five warnings can produce a non-monotonic result — e.g., a price increase that somehow makes the investment-squeeze warning disappear while the cash-cushion warning appears, in an order that could make `dfits` non-monotonic and cause bisection to converge on a wrong or unstable answer. This is exactly the kind of property that "looks obviously true" and occasionally isn't once five independent warning conditions interact.

**Why it happens:**
Integer minor units correctly eliminate binary floating-point representation error (0.1 + 0.2 problems), but they do not automatically enforce a *rounding policy* (which row absorbs residuals) or verify *structural properties* (monotonicity, explicit branch detection) — those need to be deliberately designed and tested, and it's easy to believe "we use integers now" has solved more than it has.

**How to avoid:**
- Adopt and document one explicit rounding convention for the whole engine (e.g., round-half-up on intermediate calculations, final-row-absorbs-residual for schedules) and test it at the fixture level the project already plans ("known amortisation tables").
- Test explicitly, as a first-class assertion, that every non-final row of every amortisation/payoff schedule satisfies `principal + interest == payment`, and that only the final row may differ, and only by the residual.
- Implement the `dSimMin` never-clears detection as its own explicit boolean condition (`payment <= interest`), tested and reported independently of the 600-month cap — the cap is a safety bound, not the detection mechanism.
- Add a property-based test (the project already plans `fast-check`) asserting `dfits` is monotonic non-increasing in price across randomized snapshots — this is cheap insurance against a genuinely subtle bug class that unit fixtures alone won't catch.

**Warning signs:** Any amortisation/payoff schedule where a non-final row's principal+interest doesn't exactly equal the payment; any card scenario near the never-clears boundary that reports a specific payoff month instead of "never clears"; bisection results that change non-monotonically when re-run with a slightly higher target price.

**Phase to address:** Decide engine (all three, since this is explicitly the "build first, test hardest" phase with no UI dependency).

**Severity:** Rejected-trust-in-the-product severity if shipped wrong — this is the exact harm `PROJECT.md` identifies as the one place a wrong answer damages a real person's finances. Cheap to fix now (Decide engine phase, before UI exists), expensive to fix after Decide UI and real user decisions are already logged against a flawed engine.

---

### Pitfall 11: RevenueCat — anonymous-ID identity, restore-vs-sync, and product-ID mismatches

**What goes wrong:**
Three specific, well-documented RevenueCat failure modes apply:

1. **`restorePurchases()` triggers an OS-level sign-in prompt and should never be called programmatically** on app launch or silently in the background — it's meant for an explicit user-initiated "Restore Purchases" button. Calling it automatically produces unexpected sign-in interruptions. For any background/automatic entitlement check, `syncPurchases()` is the correct call instead.
2. **Cross-platform entitlement sync depends on RevenueCat's App User ID matching the same real identity across platforms** — if RevenueCat is keyed to a platform-specific identifier (Apple ID token subject, Google account ID) rather than this project's own Supabase user ID, a user who signs in with Apple on iOS and Google on Android (both valid per this project's auth design) will not see their entitlement carry over, because RevenueCat sees two different people. Since this project mandates account-at-onboarding with a single Supabase identity behind both sign-in methods, **RevenueCat must be `identify()`'d with the Supabase user ID**, not left on the anonymous ID or a platform token, immediately after auth succeeds.
3. **Product ID mismatches and leftover local StoreKit configuration files are a common source of "it works in dev, fails in review/production" surprises** — the product identifiers configured in RevenueCat's dashboard must exactly match App Store Connect and Play Console, and a StoreKit configuration file left attached to a build scheme causes local testing to bypass the real sandbox entirely, masking issues that only appear against genuine sandbox/production infrastructure.

**Why it happens:**
The anonymous-to-identified transition is the classic RevenueCat gotcha in apps that allow purchase before login — this project's mandatory-account-first design actually **avoids** the worst version of that problem (no anonymous purchase to merge later), but only if the identify-with-Supabase-ID step is actually wired in at auth time rather than left on RevenueCat's default anonymous ID generation.

**How to avoid:**
- Call `Purchases.configure()` and `identify(supabaseUserId)` together, immediately after Supabase auth completes, before any entitlement check or paywall is shown — never let a user reach a paywall on RevenueCat's anonymous ID given this project's account-first architecture.
- Reserve `restorePurchases()` for an explicit user-tapped "Restore Purchases" affordance (needed regardless, since Apple requires it); use `syncPurchases()`/`getCustomerInfo()` for any automatic/background entitlement refresh.
- Before every store submission, cross-check product IDs between RevenueCat, App Store Connect, and Play Console line-by-line, and confirm no StoreKit configuration file is attached to the release build scheme.

**Warning signs:** A test user's entitlement not appearing after switching from an iOS device to an Android device with the "same" account; unexpected OS sign-in prompts appearing without user action; sandbox purchases succeeding locally but the same product failing in App Review's test pass.

**Phase to address:** Tiers & onboarding (RevenueCat integration, tied to the auth work already landing in System/Foundation).

**Severity:** Days if caught in testing; can cost a launch-week support fire if the identify-on-auth step is missed and real cross-platform households start reporting "I paid but my partner doesn't see Pro."

---

### Pitfall 12: "Match it exactly" is the wrong instruction for a static HTML mock ported to a responsive native app

**What goes wrong:**
The 7,000-line HTML/CSS/JS prototype is a **static-viewport snapshot** (402×874, one font size, one accent, default OS text scaling, no real safe-area variance) being treated as ground truth for a native app that must run correctly across notch and Dynamic-Island devices, the project's own actual test device (414×896, a different aspect ratio than the design reference), multiple font pairings, four accent colours, and — critically, and not mentioned anywhere in the design-fidelity constraint — the OS-level Dynamic Type / font-scaling accessibility settings that real iOS and Android users actually have turned on. "Pixel-perfect against the mock" as a literal instruction breaks down at exactly the values that were hardcoded in the mock for convenience: the `874`-relative math, the fixed `68px` header offset (already correctly identified as needing to become `insets.top + 21`), and font sizes specified as fixed pixel values that were never tested against a user with larger system text.

A second, more subtle trap: **CSS constructs don't map 1:1 to React Native equivalents**, so "copy the CSS value" produces the wrong visual result even when followed literally. `box-shadow` with two shadow layers has no single-property RN equivalent (iOS needs `shadowOffset`/`shadowRadius`/`shadowOpacity`/`shadowColor`; Android needs `elevation`, which renders shadows differently and can't reproduce a two-layer CSS shadow at all) — copying the CSS shadow values verbatim into RN style objects produces a shadow that looks wrong on Android specifically, and "matching the mock" without understanding this makes the bug look like a design-fidelity failure rather than a platform-API gap it actually is.

**Why it happens:**
"Pixel-perfect" as an instruction is aimed at the right problem (protect a deliberately restrained, already-good design from scope-creep and substitution) but taken too literally, it optimizes for matching one static screenshot at one configuration instead of matching the *design intent* (spacing rhythm, hierarchy, restraint) across the actual range of devices, text sizes and accents the shipped app must support.

**How to avoid:**
- Reframe the instruction internally as: match the **token values and spacing rhythm exactly** (already directed correctly by §2's token table), but derive **layout** from safe-area insets and flex relationships, never from the mock's absolute pixel positions. The project's own docs already do this correctly for the `68px`/`874px` case — apply the same reasoning to every other absolute value in the mock (card padding relative to screen edge, FAB position, tab bar height) rather than treating that one case as a special exception.
- Test every screen at the default OS text size **and** at a larger accessibility text size (iOS "Larger Text" / Android font scale) before considering a screen done — the mock has no equivalent state to check against, so this has to be a deliberate, separate verification step, not a diff against a screenshot.
- Re-implement shadows, blur and translucency using each platform's actual primitives (`shadowOffset`/`shadowRadius`/`shadowOpacity` on iOS, `elevation` plus a manual shadow-colour workaround on Android if needed; `expo-blur` for the tab bar's blur) rather than transcribing CSS shadow/blur syntax — expect Android to need a materially different implementation to achieve a visually equivalent (not identical) result.
- Treat the 414×896 test device's different aspect ratio from the 402×874 design reference as the forcing function it's already correctly identified as being — verify layout flexibility there first, not as an afterthought once the 402×874 case looks right.

**Warning signs:** Any component whose implementation hardcodes a pixel value copied directly from the mock's CSS rather than deriving it from a token, an inset, or a flex relationship; any screen that hasn't been checked at a larger system font size; shadows that look flat or missing on Android.

**Phase to address:** Foundation (theme tokens, safe-area handling, shadow/blur primitives established correctly from the first screen) — a wrong pattern set here propagates through every subsequent UI phase (Shell, Decide UI, Grow, Insights, Household).

**Severity:** Weeks if discovered late — a layout system built on absolute-pixel assumptions from the mock has to be substantially reworked once it hits the first device or text-size configuration it wasn't built for, and by then dozens of screens may depend on the same wrong pattern.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Skipping the idempotency-key/dedupe design for queued writes in early System-phase builds ("we'll add it before launch") | Faster initial offline-queue implementation | Retrofitting idempotency onto an already-wired write path means re-touching every mutation call site; duplicate-write bugs may already be in production data | Never — build the idempotency key into the first queued-write implementation, per every offline-sync postmortem found |
| Using `.toFixed(2)`-style display rounding as if it were the engine's rounding policy | Quick to write, looks correct in casual testing | Silent off-by-one-cent errors that compound across amortisation rows or split calculations; exactly the bug class integer-minor-units was adopted to avoid, reintroduced at the display layer | Never in the engine; acceptable only for final display formatting of an already-correctly-rounded integer value |
| Deferring the App Review compliance-note explanation of "why account-before-use" until the first submission is rejected | No upfront copywriting effort | A 5.1.1(v) rejection cycle costs a review turnaround (days) that a one-paragraph note in App Review Notes would have avoided | Never — write it once, in the Compliance phase checklist, before first submission |
| Filing the Play Financial features declaration narrowly ("just what phase 1 ships") and expanding it later as features land | Simpler initial form | Real, documented multi-round "inaccurate declaration" rejection loops as Grow/Household/Tiers add financial surface area | Acceptable only if the declaration is explicitly re-reviewed and re-filed at every phase that adds financial-adjacent surface (Grow, Household, Tiers) — otherwise, file broad from day one |
| Copying CSS shadow/blur values directly into RN style objects instead of reimplementing per-platform | Fast initial visual match on iOS (where the mock was presumably eyeballed) | Android shadows silently wrong or missing; discovered late, often only when someone actually runs the Android build side-by-side with the mock | Never for shipped screens; fine as a throwaway prototype spike only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| RevenueCat | Leaving the App User ID on RevenueCat's anonymous default instead of `identify()`-ing with the Supabase user ID at auth time | Call `identify(supabaseUserId)` immediately after auth succeeds, before any paywall/entitlement check |
| RevenueCat | Calling `restorePurchases()` programmatically/automatically, triggering unwanted OS sign-in prompts | Reserve `restorePurchases()` for an explicit user-tapped button; use `syncPurchases()`/`getCustomerInfo()` for automatic checks |
| Sign in with Apple + Supabase | Assuming the user's name/email can be fetched again on a later sign-in | Capture and persist name/email server-side on the very first authorization only — it's `null` on every subsequent one |
| Frankfurter v2 / FX | Looking up rates live at read time instead of storing the rate on the transaction/settlement record | Store the rate at write time (already correctly decided in `PROJECT.md`) — re-confirm this is actually implemented that way, since it's easy to accidentally add a "live rate" convenience lookup later |
| EAS Build / provisioning | Assuming a provisioning profile automatically widens when a new native capability (notifications, biometrics, SIWA) is added to config | Explicitly re-run `eas credentials` / trigger a clean build and verify the entitlement is present after any config plugin change |
| Google Play Financial features declaration | Treating it as a one-time form filed at first upload | Re-review and re-file at every phase that changes financial feature surface (Grow, Household, Tiers) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Unbounded offline write queue | App becomes sluggish or queue silently truncates after extended offline use | Explicit queue size/age ceiling with a user-visible warning | A user genuinely offline for days (the project's own "planes and basements" scenario) with normal transaction volume |
| Re-running `dassess`'s five-ledger computation and the 22-iteration bisection on every keystroke in the Decide five-step flow | UI jank on lower-end Android devices during price entry | Debounce recomputation, or restrict full bisection to explicit "check" actions rather than live-as-you-type | Once the five-step flow ships on Grow-era feature volume (many logged months, many goals/debts feeding the ledgers) |
| FlashList rendering the full Activity history without pagination bounds as household transaction volume grows | Scroll jank once a household has multiple years of shared transactions | Paginate/windowed query from Supabase rather than fetching the full history client-side | Household + multi-year usage, likely post-v1 but worth designing the query pattern correctly from Record phase |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating RLS as sufficient without also testing settlement/household-scope boundary cases | A household member could read or write another household's data if an RLS policy has a gap in the settlement or invite-link flow specifically | Write explicit RLS-boundary tests for the household/settlement/invite-link tables, not just for the straightforward owner-scoped tables (transactions, accounts) |
| Storing the offline write queue unencrypted in plain local storage alongside cached financial reads | Cached financial data (which the project's own copy correction acknowledges is now cloud-derived, not "nothing leaves the device") sitting in plaintext on a lost/stolen device | Resolve the deferred §9-equivalent open question (what's in the on-device cache, does it need encrypting) before System phase ships the offline queue, not after |
| Expiring household invite links that don't actually expire server-side (only hidden client-side) | A "used" or "expired" invite link remains valid if expiry is only enforced in the UI | Enforce invite-link expiry as a server-side (Supabase Edge Function/RLS-adjacent) check, not a client-side display convention |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Account-creation screen appearing before any value is shown | 20–40% documented drop-off on forced signup walls generally | Sequence the 11-question onboarding flow to establish value before the account step, and make the account step itself one-tap (SIWA/Google) |
| Coach responses that read as prescriptive even when the underlying data is purely descriptive | Erodes the "not advice" positioning that both users and Apple review are sensitive to | Server-side post-filter rejecting/rewriting prescriptive trigger phrases; keep Coach output structurally separate from the deterministic Decide verdict |
| Queue/sync state that doesn't match reality ("synced 2 minutes ago" shown while a write actually failed silently) | User believes data is safe when it isn't — exactly the scenario this project's own "opened on planes" framing warns against | Make queue-state copy strictly honest, tied to actual queue contents, never optimistically defaulted |

## "Looks Done But Isn't" Checklist

- [ ] **Amortisation/payoff schedules:** Often missing the row-level `principal + interest == payment` invariant check — verify with a fixture test, not visual inspection of one example table.
- [ ] **`dSimMin` never-clears detection:** Often implemented as "ran out the 600-month cap" rather than an explicit `payment <= interest` check — verify the two are tested as distinct, separately-triggered code paths.
- [ ] **Offline queue:** Often missing durable (disk, not memory) persistence and an idempotency key — verify by force-quitting mid-flush and checking for duplicates after relaunch.
- [ ] **Financial features declaration:** Often filed once at first upload and never revisited — verify it still accurately describes the app after every phase that touches Grow/Household/Tiers.
- [ ] **Sign in with Apple:** Often missing the first-authorization-only name/email capture — verify by testing a second sign-in and confirming the name is still present in the user record (from the earlier capture, not a fresh Apple response).
- [ ] **RevenueCat identity:** Often left on the anonymous App User ID — verify entitlement actually syncs across a same-user, different-platform test (Apple sign-in on iOS, Google sign-in on Android, same Supabase account).
- [ ] **Provisioning profile entitlements:** Often stale after a new native capability is added — verify with `eas credentials` after every config-plugin change, not assumed current.
- [ ] **Larger system text size:** Often never tested at all against the static mock — verify every shipped screen at an increased OS text-scale setting.
- [ ] **Household RLS boundaries:** Often tested only for the "happy path" owner-scoped tables — verify explicit cross-household read/write denial tests exist for settlements and invite links specifically.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Missing idempotency keys discovered after some duplicate writes are already in production | MEDIUM | Add the idempotency key going forward; write a one-off reconciliation script to detect and merge/flag likely duplicate transactions (same user, amount, category, timestamp within a short window) for user review rather than silent auto-deletion |
| Guideline 5.1.1(v) rejection on first submission | LOW | Add the App Review Notes justification explaining cloud-sync/household as core functionality; resubmit — typically a single review-cycle fix per the documented 2026 rejection pattern |
| "Inaccurate" Financial features declaration rejection loop | MEDIUM-HIGH | Escalate via Play Console's help/appeal channel rather than repeatedly guessing at the mismatch blind, per the community-documented pattern of this becoming a multi-round loop without it |
| RevenueCat cross-platform entitlement not syncing for already-live users | MEDIUM | Backfill: identify affected users by comparing Supabase user IDs against RevenueCat App User IDs, manually grant entitlement via RevenueCat's dashboard/API for confirmed legitimate cases while fixing the `identify()` call going forward |
| Amortisation rounding-residual bug discovered post-launch | MEDIUM | Because FX rates and financial facts are already designed to be stored per-transaction (not recomputed live), a corrected engine can be rolled out via EAS Update without silently rewriting historical verdicts — but any user-facing "past decision" record computed with the buggy engine needs an explicit, honest correction path, not silent overwriting |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| Guideline citation drift (3.2.1 vs 3.2.2) | Foundation (fix in docs) / Compliance (final check) | Compliance checklist cites the correct, live-re-verified clause numbers |
| Subscription/IAP mechanical rejection (2.1(b), 3.1.2(c), 1.5 pattern) | Tiers & onboarding / Compliance & release | Pre-submission checklist: subscription attached to version, disclosure copy present, support URL real, demo video shows fresh purchase not restore |
| Coach advice-framing risk | Tiers & onboarding (scoping decision) / System (implementation) | Sample-graded Coach outputs against "no prescriptive language" bar before submission |
| EAS Simulator availability assumption | Foundation | Dev-loop plan works fully on Android emulator + physical iPhone without simulator access |
| Provisioning/entitlement staleness | Foundation / System (each new native capability) | `eas credentials` check after every config-plugin change |
| Financial features declaration accuracy | Money core (initial filing) / Grow, Household, Tiers (re-verification) | Declaration text re-read against actual shipped feature set at each relevant phase transition |
| Mandatory-account activation cost & 5.1.1(v) | System (auth) / Tiers & onboarding (flow sequencing) | Onboarding sequence shows value before account step; App Review Notes justify account requirement |
| Sign in with Apple data-capture and session bugs | System | First-sign-in name/email persisted and verified present on a simulated second sign-in; session survives extended backgrounding in testing |
| Offline queue failure modes (duplicate writes, clock skew, queue loss, unbounded growth, replay-against-moved-target) | System (queue mechanics) / Household (Realtime interaction) | Force-quit-mid-flush test, clock-change test, extended-offline-volume test, concurrent-household-edit-then-undo test |
| Amortisation rounding, never-clears detection, bisection monotonicity | Decide engine | Row-invariant fixture tests, explicit never-clears branch test, property-based monotonicity test via `fast-check` |
| RevenueCat identity/restore/product-ID issues | Tiers & onboarding | Cross-platform same-account entitlement test; restore-button-only test for `restorePurchases()` |
| Pixel-perfect-against-static-mock trap | Foundation (tokens, insets, shadow primitives) | Every shipped screen checked at the 414×896 test device and at an increased system text size, not just against the 402×874 mock screenshot |

## Sources

- Apple Developer — live App Review Guidelines, fetched 2026-09-21: https://developer.apple.com/app-store/review/guidelines/ (3.2.1(viii), 3.2.2(ix), 5.1.1(v) text — HIGH confidence, primary source)
- Indie Hackers — "After 8 months and 2 Apple rejections, my AI finance app is finally live" (CoinCoach): https://www.indiehackers.com/post/after-8-months-and-2-apple-rejections-my-ai-finance-app-is-finally-live-built-it-for-my-mom-heres-the-story-845d9b3a92 (MEDIUM confidence — single detailed real account, self-reported)
- Google Play Console Help — Financial features declaration: https://support.google.com/googleplay/android-developer/answer/13849271 (HIGH confidence, primary source)
- Google Play Developer Community — "App update keeps being rejected due to 'inaccurate' financial features declaration": https://support.google.com/googleplay/android-developer/thread/264875599 and https://support.google.com/googleplay/android-developer/thread/322937464 (MEDIUM confidence — multiple independent community reports of the same pattern)
- Expo — EAS Simulator waitlist page: https://expo.dev/services/eas-simulator-waitlist and blog post "You don't need a Mac to develop iOS apps": https://expo.dev/blog/build-ios-apps-on-windows-with-cloud-simulators (HIGH confidence for current early-access status, primary source)
- expo/eas-cli GitHub issue #2107 (provisioning profile device errors): https://github.com/expo/eas-cli/issues/2107 (MEDIUM confidence — specific real bug report)
- Apple Developer Forums — provisioning/entitlement threads (Family Controls, App Groups mismatches): https://developer.apple.com/forums/thread/817313, https://developer.apple.com/forums/thread/770292 (MEDIUM confidence — multiple independent reports of the same class of issue)
- Supabase Docs — Sign in with Apple, native mobile auth: https://supabase.com/docs/guides/auth/social-login/auth-apple, https://supabase.com/blog/native-mobile-auth (HIGH confidence, primary source)
- Digia — mobile app onboarding/activation metrics: https://www.digia.tech/post/mobile-app-onboarding-activation-retention/, https://www.digia.tech/post/app-onboarding-rates-statistics/ (MEDIUM confidence — aggregated industry statistics, not a single primary study)
- DEV Community — "The Retry That Charged a Customer Twice, and What We Learned About Idempotency": https://dev.to/krishnamm/the-retry-that-charged-a-customer-twice-and-what-we-learned-about-idempotency-1l8f, and "Offline Queue Replay and Idempotency in Offline-First PWAs": https://dev.to/crisiscoresystems/offline-queue-replay-and-idempotency-in-offline-first-pwas-3hpg (MEDIUM confidence — practitioner postmortem writeups)
- DEV Community — "Decoding an Amortization Schedule" and "Your amortisation schedule is one row short, and only sometimes": https://dev.to/lizely/decoding-an-amortization-schedule-how-to-audit-a-mortgage-calculators-output-row-by-row-41c1, https://dev.to/hammad4june1999/your-amortisation-schedule-is-one-row-short-and-only-sometimes-17f9 (MEDIUM confidence — practitioner technical writeups, cross-checked against standard financial-math conventions)
- RevenueCat Docs — Sandbox Testing, Restoring Purchases: https://www.revenuecat.com/docs/test-and-launch/sandbox, https://www.revenuecat.com/docs/getting-started/restoring-purchases (HIGH confidence, primary source)
- RevenueCat Community — restore/sync and sandbox-account threads: https://community.revenuecat.com/sdks-51/restore-purchases-is-transferring-entitlements-across-sandbox-accounts-5930, https://community.revenuecat.com/general-questions-7/how-to-test-restore-purchase-scenario-6775 (MEDIUM confidence — community-reported patterns, consistent with official docs' own warnings)
- React Native / RN-vs-CSS mapping general sources on shadow/elevation and pixel-perfect tooling (LOW-MEDIUM confidence, general practitioner content, not project-specific)

---
*Pitfalls research for: cloud-first personal/household finance app, iOS + Android, Windows-only dev environment*
*Researched: 2026-09-21*
