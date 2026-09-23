# Website audit — Apple organisation-enrolment bar

Audited 2026-09-23 against the criteria in `docs/enrolment/apple-org-checklist.md`
and Apple's organisation-enrolment expectations (ENV-20, D-06). Fetched via
`curl -sI` and page content review; see Method below.

## Deviation from the plan

Plan 00-07 Task 1 was written assuming a single company website. There are two,
per `docs/ops/accounts.md`:

- **Entity site — `leadstrategy.ca`** (Lead Strategy Canada Inc): the domain
  Apple checks at organisation enrolment, and the home of the enrolment
  contact address.
- **Product site — `fincwin.com`** (FincWin): the public marketing and support
  site, linked from both store listings.

Both sites bear on the enrolment decision — Apple can reach either one from a
web search on the legal name or the app name — so both are audited below, in
two clearly separated tables, rather than folding two different sites into
one set of rows.

## Method

```
curl -sI https://leadstrategy.ca/      -> 200, redirects to https://www.leadstrategy.ca/
curl -sI https://www.fincwin.com/      -> 200
curl -sI https://www.fincwin.com/privacy  -> 200
curl -sI https://www.fincwin.com/contact  -> 200
```

All four requests returned 200 over HTTPS with a valid certificate. Page
content below was reviewed on the fetched HTML of each site's home page, plus
`/contact` (entity) and `/privacy`, `/contact` (product), on 2026-09-23.

## Entity site — leadstrategy.ca (Lead Strategy Canada Inc)

| Criterion | Result | Evidence | Remediation |
| --- | --- | --- | --- |
| Site loads over HTTPS on the company's own domain, not a parking or "coming soon" page | pass | `curl -sI https://leadstrategy.ca/` returns 200; apex redirects to `https://www.leadstrategy.ca/`; full navigation and content present, not a registrar placeholder | none |
| Legal company name appears and matches the D-U-N-S/registration name (D-02) | partial | Footer carries "Lead Strategy Canada Inc." verbatim, matching the name recorded in `docs/enrolment/apple-org-checklist.md`. But the D-U-N-S record does not exist yet (still pending, ETA 2026-10-13 per `docs/dependency-register.md`), so the match against D&B's own record cannot be confirmed until it issues | Re-check this row against the D&B record itself once the D-U-N-S is issued, before submitting enrolment (Task 3 of this plan already schedules a re-audit) |
| Real content describing the company and what it does, including FincWin as a personal money-management tool, with no bank/lender/adviser claims | fail | Site describes four practices (Build, Market, Create, Sell) and positions the company as "technology that puts your business in front of buyers." **FincWin is not mentioned anywhere on the entity site.** A reviewer checking that the enrolling entity is the operation behind the app finds no link | Add an About paragraph naming FincWin as one of the company's own products — drafted below |
| A contact route: a contact email on the domain and/or a contact form | partial | Working contact form at `/contact/` (name, email, company, "what do you need first," free text) and two email addresses shown on the page. But the contact page also displays a live system message: *"Online delivery is being configured. Please email [address redacted] in the meantime,"* which is itself a visible admission of an unfinished setup step | Complete whatever "online delivery" configuration the form is waiting on, or remove the placeholder message before enrolment; the form and the work email already exist and the underlying `mailto:` route already works (`docs/dependency-register.md`) |
| A physical or registered address, or at least country of registration | partial | No street address anywhere on the site. Canada is implied only indirectly — "Canadian operators use Lead Strategy..." and the "Lead Strategy Canada Inc." legal-name string — never stated as a plain "registered in Canada" line | Add an explicit "registered in Canada" line near the legal name; Apple does not strictly require a street address, but an implied country is weaker than a stated one |
| No broken primary navigation and no lorem ipsum | fail | Primary navigation (About, Services, Sectors, Work, Insights, Store, Contact us) works. But the site carries three separate, visible placeholder admissions: footer — *"Photography and figures are placeholders"*; research section — *"Illustrative example. Replace with a real client result before launch"*; charts — *"Illustrative figures — placeholders until the audit runs."* These are worse than lorem ipsum for review purposes: they are the site itself declaring its own content is not real, which is exactly the "parked or placeholder site" signal Apple's org-enrolment review rejects on | Replace or remove all three placeholder strings and the underlying illustrative content (photography, case-study figures, chart data) before enrolling. This is the single most serious finding in this audit |
| Room for future privacy/terms/support pages; note what exists now | fail | No privacy or terms pages exist or are linked anywhere on the entity site today | Not launch-blocking for Apple's org-enrolment bar specifically (it does not live-check for a privacy policy on the *entity* domain — the product domain already carries one), but should be added before this site is used for anything beyond the enrolment contact |

## Product site — fincwin.com (FincWin)

| Criterion | Result | Evidence | Remediation |
| --- | --- | --- | --- |
| No claims of being a bank, lender or adviser; compliance voice held | pass | Copy describes a free personal-finance app that consolidates income, spending, debt and savings ("Track what you earn spend & save"). No use of "advice," "recommendation," "you should," or any lending/banking claim found | none |
| Data-handling copy matches the actual architecture | fail | Site repeatedly claims local-only storage: *"Your data locked to your device. AES-256 encryption available on all plans"* and *"Financial data — stays local."* The app being built is cloud-first — Supabase is the sole source of truth, with rows held in a Postgres database (see `.planning/PROJECT.md` Key Decisions and `docs/dependency-register.md`'s Supabase rows). This is a factual misstatement to users, it will contradict the App Store Privacy and Play Data Safety disclosures the app must file, and `CLAUDE.md`'s compliance rules explicitly forbid claiming data stays on the device | Replace both strings with accurate cloud-first data-handling copy — drafted below. This is not a partial fix; the current copy describes an architecture the product does not have |
| Cross-reference between the entity and product sites | fail | Neither site names the other anywhere. `fincwin.com` never mentions Lead Strategy Canada Inc; `leadstrategy.ca` never mentions FincWin. For a money app, a reviewer checking that the developer-account holder is the operation actually behind the app finds no link in either direction | Add a line to `fincwin.com`'s footer or About/legal copy stating FincWin is a product of Lead Strategy Canada Inc (drafted below), and add the matching line to the entity site (drafted above) |
| Privacy/terms/support infrastructure already in place | pass | Navigation carries Features, Pricing, Use cases, Blog, Account, Get started, About, Changelog, Contact, Privacy, Terms, Cookies, Cookie settings, Help guide and Budget categories. `curl -sI https://www.fincwin.com/privacy` and `/contact` both return 200 | none |
| No placeholder content in checkout/commerce flows | fail | Page source contains unresolved placeholder checkout URLs: `REPLACE_WITH_LS_PRO_ANNUAL_CHECKOUT_URL` and `REPLACE_WITH_LS_LIFETIME_CHECKOUT_URL`. These are not user-visible copy but are live in the shipped page source, and a reviewer or automated crawl inspecting the page can find them | Wire the real checkout URLs (or remove the pricing CTAs until RevenueCat/store products exist, per the plan's Phase 9 timeline) before this page is treated as launch-ready. Not an Apple org-enrolment blocker on its own, but tracked here since it was found during the same pass |

## Drafted copy

Declarative, plain, British spelling, typographic apostrophes, in the
prototype's non-prescriptive voice. Holds no data-locality claim of any kind
and never positions FincWin as a bank, lender or adviser.

### About paragraph — entity site (leadstrategy.ca)

> Lead Strategy Canada Inc is a Canadian technology company working across
> four practices: software and websites, search and advertising, media and
> design, and commerce operations. FincWin, a personal money-management app
> for iOS and Android, is one of Lead Strategy's own products. Lead Strategy
> does not hold money, extend credit or give financial advice — it builds the
> software other people use to track their own.

### Contact block — entity site (leadstrategy.ca)

> **Get in touch**
> For work enquiries, general questions or press, write to us at the work
> email on this domain, or use the form below — we read every message.
> Lead Strategy Canada Inc is registered in Canada.

### Corrected data-handling copy — product site (fincwin.com)

> Your data lives in your own account, not on your phone alone. FincWin
> encrypts everything in transit and at rest, keeps every household's
> records isolated from every other household, and lets you export or
> permanently delete your data at any time.

Replaces both *"Your data locked to your device. AES-256 encryption
available on all plans"* and *"Financial data — stays local."*

### Footer cross-reference line — product site (fincwin.com)

> FincWin is a product of Lead Strategy Canada Inc.

## Summary of findings driving the verdict

1. **Placeholder copy on the entity site** — three separate visible
   admissions that photography, figures and case-study results are
   placeholders. Apple rejects parked or placeholder-content organisation
   sites on sight; this is the strongest single reason this audit does not
   read READY.
2. **The product site contradicts the app's actual architecture** — it
   claims financial data stays on the device, while the app is cloud-first
   on Supabase. This is a factual misstatement, a store-disclosure risk, and
   a direct CLAUDE.md compliance violation.
3. **The two sites never reference each other** — nothing on either site
   connects the enrolling legal entity to the product a reviewer is
   evaluating.

Fails: 6 (entity: real content/FincWin mention, no-placeholder/nav, room for
future privacy/terms pages; product: data-handling copy, cross-reference,
placeholder checkout URLs). Partials: 3 (entity: legal-name match pending
D-U-N-S, contact-route "online delivery" message, address/country not stated
plainly). Passes: 3 (entity HTTPS/domain; product bank/lender/adviser voice;
product privacy/terms/support infrastructure).

Verdict: REMEDIATE (9 items)
