# Launch Positioning & ASO

**Researched:** 2026-09-25/26 · **Stage:** pre-launch · **Full report:** https://claude.ai/artifact/VNLwqQYYNz7LLAHWgB61wW (private)
**Evidence:** repo and prototype; 17 live competitor listings (US App Store and Play); store autocomplete on both stores; 2,280 competitor reviews; competitors' icons and first four screenshots, viewed.
**Re-run:** `/app-launch-audit` 30 days after launch, or on any trigger in §9.

## 1. Positioning

| | |
|---|---|
| Core promise | Know what fits before you buy, worked out from your own money. |
| Primary user | Someone about to spend a meaningful amount who wants to know if it fits, often in a shared household, often wary of linking a bank. |
| Secondary | Couples, families and housemates who share costs. Canadians, whose banks competitors link poorly ("if ur canadian u will have to do everything manually", YNAB review). |
| Trigger | Looking at a price; about to sign finance; just moved in with someone; bank sync broke again. |
| Gap | 6 of 10 competitors' screenshots lead with where money went and 7 sell a budgeting method. None shows a purchase decision about to be made. Broken bank sync is the #1 review complaint (180 of 2,280), and no listing says "no bank login". Honeydue holds "couples" and is going stale. |

## 2. Recommended direction (Differentiated)

| Field | Text | Count |
|---|---|---|
| Store name (both stores) | FincWin: Can I Afford It? | 25/30 |
| iOS subtitle | Household Budget & Spending | 27/30 |
| iOS keyword field | `planner,expense,tracker,money,couples,shared,family,split,savings,debt,networth,purchase,should,buy` | 99/100 bytes, 0 repeats |
| Play short description | Household budget & expense tracker that checks if a purchase fits before you buy | 80/80 |
| Tagline (web, splash, ads) | Know what fits before you buy. | — |

Why: "can i afford it" and "should i buy this" are real autocomplete terms on both stores, and every app ranking for them has 0–2 ratings. The volume is small, so the subtitle carries "household budget", which gets plenty of suggestions and which no leader has in its name.

When another direction wins:
- **Hybrid** ("FincWin: Budget Planner"): switch if "can i afford it" brings little traffic 60 days after launch.
- **Search-first** ("Household Budget - FincWin"): switch if household turns out to drive installs.
- **Brand-first**: move once there is real branded search (100K+ ratings, or press driving it).

Drop "United" from store names. "FincWin United" reads like a credit union, which works against the not-a-bank position.

## 3. Keywords

- **Primary:** can i afford it · household budget · budget planner
- **Secondary:** expense / spending / money tracker · couples / shared / family budget · net worth · savings · debt
- **Long-tail:** should i buy this · household budget planner · couples budget app · manual budget app
- **Avoid:**
  - finance, money (unwinnable)
  - bank statement converter (wrong intent)
  - private / offline (crowded and overstated)
  - AI, coach, advice, loan, credit, free, competitor names

## 4. Decide-specific findings → Phase 5

- **First answer before history (DCU-10).** The name promises an answer. Today that answer needs months of history, and the prototype's onboarding takes 14 taps to reach *sample* data. Proposed onboarding: welcome → consent → one account and balance → rough monthly in and out → first check → "Bring your history". About 7 taps and one typed line, roughly 60 seconds.
  - **Open (discuss-phase):** may a verdict rest on rough figures, labelled as a first read? This is a Core Value question. If not, screen 5 uses sample data plus an import prompt.
- **Screenshots come from the real app (DCU-11).** Frames 1–3 are the verdict, what breaks, and the alternatives, captured from the App Review demo account's sample scenario (sofa $1,800 in a household of two; car $14,500 on a loan).
- **The quick check is free.** The store name promises it (see `PRICING.md`).
- **Review prompts** only after: an import reconciles, an estimate-vs-actual lands at or under the estimate, or a household settles up. Never after "You cannot afford this", in the first session, or after a failure.

## 5. Store screenshots (captions of 7 words or fewer; Apple indexes captions)

1. Can I afford it? Ask first. (verdict)
2. See what breaks before you buy (impact)
3. Cheaper, later, or skip it (alternatives)
4. Import statements. No bank login. (import reconciliation)
5. One household budget, split fairly (household)
6. Every account, any currency (activity)
7. Simple to start. Deep when you want. (levels)
8. Savings, debt payoff and net worth (Grow)

The iOS preview video runs 25 seconds, with the verdict showing within 4 seconds. The Play feature graphic is 1024×500 with no call to action.

## 6. Icon (decided 2026-09-26: "A · Refine")

The F mark sits on a navy (#172A4F) tile, with canvas (#FBFAF7) stem and arm and a #1FA06B block (4.25:1 on navy). This replaced the white tile, which had the weakest silhouette in the category row. Generated by `scripts/brand/generate-icons.py` (quick 260926-0mn). The splash keeps the navy/green glyph on canvas. Test the ink "verdict" variant (B) against it with Product Page Optimization after launch.

## 7. Descriptions

The full iOS and Play descriptions, promotional text and in-app purchase names are in the report. The Play description runs 2,711 characters, with budget at 1.5%, afford at 1.1%, and household, import and statement at 0.9% each.

## 8. Scores

| | Now | Launch | 90 days | 12 months |
|---|---|---|---|---|
| Store listing (weighted /100) | 0 | 59 | 69 | 82 |
| Store listing, ratings left out | 0 | 74 | 76 | 84 |

For comparison, Monarch scores 81 on iOS and Wallet 83 on Play.

## 9. Loop

Re-run the audit:
- 30 days after launch
- after releases that change Decide, import or household
- when a competitor moves into purchase decisions (watch Rocket Money's Rowan and PocketGuard's "Leftover")
- when conversion drops more than 15% for two weeks
- when the rating moves by 0.2 or more

Keep each run's metadata and scores under `.planning/aso/`.

## Limitations

- Search volume wasn't available. Apple's suggestions endpoint returns no priority scores, so check popularity in Apple Search Ads before submitting.
- The Apple reviews feed mostly failed, so iOS review themes rely on featured reviews.
- Every claim depends on Phases 2–9 shipping as planned.
