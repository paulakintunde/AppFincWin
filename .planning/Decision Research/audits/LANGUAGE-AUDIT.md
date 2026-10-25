# Decide: language and information-structure audit

Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`. Audited 2026-10-24. Read-only: no code or catalogue was changed.

What was read: the whole `decide:` block of `src/i18n/locales/en.ts` (1,692 string leaves), `src/features/decide/copy/*` (verdictCopy, monthFigure, basisKey, codeMaps), the copy guard tests in `src/i18n/__tests__/`, `confidence.ts` in the engine, ~25 existing Pixel 9 screenshots (`x01`, `x02`, `x04`, `x05`, `x07`, `w20`, `w21`, `v23`, `v25`, `v27`, `y01`, `y06`, `dc01`, `dc03`, `x08`, `x12` and others, now in `.planning/Decision Research/screenshots/`), and a fresh read-only walk through the live app on the Pixel 9 (`lang-01` to `lang-19`, listed in section 4.8).

Not done: TalkBack was not switched on (that changes a device setting, which the brief forbids). Accessibility findings are from the catalogue strings, `formatMoneyA11y`, the layout seen on screen, and the research in section 8. They need one real TalkBack pass.

---

## 1. Executive summary

### 1.1 Verdict

The copy is **grammatically plain and conceptually dense**. Almost every sentence passes a readability formula (mean Flesch-Kincaid grade 3.8, section 2). That is the trap: the words are short, but many of them are used in a private sense that no user will guess. "Free", "basis", "line", "cushion", "pot", "check", "month" and "worst" are all grade-2 words doing grade-12 jobs. A distracted reader decodes each word correctly and still builds the wrong picture.

Three things make this serious for a feature whose only job is a trustworthy answer:

1. **The headline can contradict the screen it sits on.** On the live Impact step the card says **"It fits"** and "What breaks" says **"Nothing breaks"**, while the card directly beneath says **Worst month: "Doesn't fit right now", $5,883.85 overspent** (`x05.png`, `lang-14.png`). A skimming user reads the first, biggest, greenest thing. Nothing in the headline says "on this month's expected figures only". That is false reassurance by omission.
2. **The confidence label does not match the engine and the explanation does not explain it.** The card shows **"Rough basis"** for a user with 6 full months logged (`lang-13.png`). The footer says "anything less is rough", which reads as "less than 3 months". The engine (`confidence.ts`) makes a read rough for **volatile income** as well, and the copy never says so. The sheet lists "Income is volatile" as a bullet, but never links it to the rating.
3. **Alarm and blame words sit on a money screen.** "What breaks" (next to "I'm broke"), "Cash cushion broken", "worst month", "overspent" (blames the user for something that is a projection), "Volatile" in a red pill, "On the edge", "Needs adjustment". None is false, all are avoidable, and the users most likely to be frightened are the ones the app most wants to keep.

I would not call this a copy-polish job. Four terms need replacing and one structural rule needs adding (every verdict names the month type it was judged on, and says when another type disagrees).

### 1.2 Recommended reading level

**Target: US grade 6 for labels and headlines, grade 7 at most for ⓘ and sheet text. UK reading age 11 to 12.**

Why:

- 28% of US adults score at or below literacy Level 1 and **34% at or below numeracy Level 1** (PIAAC 2023, up from 19% and 29% in 2017) ([IES](https://www.ies.ed.gov/learn/press-release/u-s-adults-score-par-international-average-literacy-skills-below-international-average-numeracy-and)). Numbers are harder for more people than words. Decide is almost all numbers, so the number of figures per screen matters more than word length.
- WCAG 3.1.5 (AAA) asks for text no harder than lower secondary level, about nine years of schooling, or a simpler version alongside ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/reading-level.html)). That is a ceiling, not a target.
- GOV.UK makes plain English mandatory, tells writers to avoid jargon, to explain a specialist term the first time, and to split sentences over 25 words ([GOV.UK clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)). The "reading age 9" figure often quoted for GOV.UK comes from council summaries, not from that page.
- People scan. In Nielsen's study 79% always scanned and 16% read word by word; half the words, plus scannable layout and neutral wording, gave a 124% usability gain ([NN/g](https://www.nngroup.com/articles/how-users-read-on-the-web/)).

**The honest catch:** Decide already scores about grade 4 to 5, so a grade target is not the binding constraint. The binding constraints are the ones a formula cannot see:

| Rule | Limit |
|---|---|
| One word, one meaning, everywhere | no term used in two senses |
| Words per sentence | 20 or fewer (hard stop at 25) |
| ⓘ body | 40 words or fewer, 3 sentences or fewer, one new idea |
| Figures per fold preview | 1 |
| Jargon | none without a plain first mention |
| Comprehension | 5 of 5 test users paraphrase the verdict correctly (section 1.5) |

### 1.3 Top 10 language problems, ranked by risk of misunderstanding or harm

| # | Problem | Evidence | Why it ranks here |
|---|---|---|---|
| 1 | **Headline disagrees with the comparison below it.** "It fits" and "Nothing breaks" over "Worst month: Doesn't fit right now". | `x05`, `lang-14`, `x04` | Wrong answer in the one place a wrong answer harms. Reads as approval. |
| 2 | **"Basis" means two unrelated things** (which month type: "The outcome on each basis"; how much history: "Rough basis") **and the rating's reason is hidden.** | `lang-13`, `x05`, `confidence.ts` | A user cannot tell why it is rough or what to do about it. |
| 3 | **"$219,783.86 free"**. Free of charge? Free money? Untaxed? Available? | `x01`, `lang-03` | The biggest number on the home screen, worded with an ambiguous adjective. Paired with "Free a month" and "A month" on the verdict card. |
| 4 | **"What breaks", "broken", "worst", "overspent", "Volatile", "On the edge"**: alarm and blame vocabulary. | `x05`, `w21`, `en.ts` `warn.cashTitle` | Anxious users read catastrophe. "Overspent" says the user did something, but the figure is a projection. |
| 5 | **"Out of savings" / "Out of this month's spare" / "Needs spreading"** as the eyebrow over the verdict. | `x04`, `lang-12` | "Out of savings" most naturally reads "I have no savings left". It means "paid from savings". The ⓘ sheet is titled "How big this is", a third name. |
| 6 | **"Net free cash flow"** as the home headline, with a 94-word ⓘ (11 lines on the phone). | `x01`, `lang-08` | Textbook finance jargon at the top of the first screen. Two different sheets share the same title. |
| 7 | **"Judge on" / "Worst month" / "This month"**. | `x07`, `w21` | The app asks users to choose a scenario and calls it a courtroom word. "This month" is not the logged month, it is an expected end-of-month, and nothing on the card says so. |
| 8 | **"Go ahead", "Wait", "Pass"** as the commit choices. | `en.ts` `decision.goName`, `passName` | "Go ahead" is permission, close to a recommendation. "Pass" also means "succeed". The app records and does not execute. |
| 9 | **Concept overload on the Impact step.** About 20 named ideas, 9 ⓘ icons, 8 folds, before the Next button. | `lang-12` to `lang-16` | Users stop reading and tap Next. The folds carry the "what breaks" detail. |
| 10 | **Persistent red "22 changes couldn't save"** on every Decide screen, with no explanation or action; and "Records on this device", "didn't" vs "couldn't". | `lang-01`, `lang-09`, `lang-11` | Money-anxiety trigger with nothing to do about it. Sits above the content on every page. |

### 1.4 Top 10 fixes

| # | Fix | Where |
|---|---|---|
| 1 | The headline always names the month type it was judged on, and when another type disagrees, says so in the headline: "Fits this month. Doesn't fit in your tightest month." Do not show a green "It fits" over a red row. | `verdict.*`, Step3Verdict |
| 2 | Split "basis" into two words: **month type** ("Check against: This month / Tightest month / Average month") and **estimate** ("Rough / Fair / Firm estimate"). State the reason on the pill sheet: "Rough because your income varies a lot." Fix the footer to match `confidence.ts`. | `depth.confidence.*`, `info.confidence.*`, `verdict.compare.*` |
| 3 | Replace "free" and "overspent" with **"to spare"** and **"more out than in"**. If D-106 stays, add a frame line ("Money to spare this month") and keep "overspent" for logged actuals only. | `fig.*`, `home.hero.*`, `verdict.key.*` |
| 4 | Retire "What breaks" and "broken". Use **"Your limits"**: "Within every limit", "2 limits passed". Replace "On the edge" with "Close to a limit". | `fold.*`, `info.whatBreaks`, `depth.edge`, `warn.*` |
| 5 | Replace "Worst month" with **"Tightest month"**. Replace "Volatile" with **"Varies a lot"** and stop colouring it red. | `home.card.judge.*`, `basis.*`, `steadiness.*` |
| 6 | Rename the size labels: **"Paid from savings"**, **"Paid from this month's spare"**, **"Too big to pay at once"**. Make the ⓘ title match the label. | `size.*`, `info.size` |
| 7 | Replace "Net free cash flow" with **"Your month"** on the card, and shrink its ⓘ to about 45 words. | `home.card.eyebrow`, `info.netFreeCashFlow` |
| 8 | Rename the commit buttons to **"Record as bought" / "Save the plan" / "Record as not buying"**. They say what the app does, and nothing sounds like approval. | `decision.*Name`, `flow.commit.*` |
| 9 | Cut the Impact step to 3 visible blocks before the folds (verdict, how firm, the three-month-types card), and rename the fold jargon: "Where it lands" → "What it changes", "Cash path" → "Cash day by day", "Assumptions in play" → "What this assumes". | check/Step3Verdict |
| 10 | Give the sync banner a plain sentence and one action: "22 changes are not saved yet. They stay on this phone until they are. Review". Use one verb ("saved") in all sync, toast and undo copy. | sync line, `home.problems.*`, `toast.*` |

### 1.5 What to test before shipping (FCA expects testing, not assumption)

The FCA's consumer-understanding review (13 March 2026) expects proportionate testing before and after change, including with vulnerable customers ([FCA](https://www.fca.org.uk/publications/good-and-poor-practice/consumer-understanding-good-practice-areas-improvement)). Cheap version, 5 people, 15 minutes each, no app needed, screenshots only:

1. Show `x01` for 5 seconds. Ask: "What does $219,783.86 free mean?" Wrong if the answer is "free money", "I can spend it", or "I don't know".
2. Show `x05` (headline "It fits", row "Doesn't fit right now"). Ask: "Can you afford it? Why?" Wrong if the answer is a plain yes or no.
3. Show `x04`. Ask: "What does 'Out of savings' tell you?" Wrong if the answer is "I'm out of savings".
4. Show `lang-13`. Ask: "Why is it rough?" Wrong if they cannot name volatile income.
5. Ask the same four after the rewrites.

---

## 2. Measured readability

### 2.1 Method

- Source: all 1,692 string leaves under `en.decide`. The 948 with at least 4 words were scored (placeholders such as `{{amount}}` replaced by the number "100"; non-breaking spaces turned into spaces).
- Formula: Flesch-Kincaid grade = 0.39 x (words per sentence) + 11.8 x (syllables per word) - 15.59. Flesch Reading Ease reported alongside. Syllables counted with a vowel-group heuristic; digits counted as 2 syllables. Sentences split on `. ! ?`.
- Script: `.planning/Decision Research/working-files/lang-read.cjs` (transpiles `en.ts`, walks the object). It is a heuristic. It overstates ease for strings that are mostly numbers and understates the cost of private-sense words (see 2.3).

### 2.2 Results by area

| Area | Strings | Mean FK | Median | Share above grade 8 | Share above grade 12 |
|---|---|---|---|---|---|
| All Decide | 948 | 3.8 | 3.7 | 8% | 0% |
| ⓘ bodies (`info.*.body`) | 69 | 5.5 | 5.1 | 13% | 0% |
| ⓘ "What this changes" | 65 | 4.1 | 3.8 | 3% | 0% |
| Verdict titles and missing-terms titles | 37 | 3.9 | 3.7 | 8% | 0% |
| Warnings (`warn.*`) | 37 | 4.5 | 3.8 | 11% | 0% |
| Home (`home.*`) | 77 | 3.1 | 2.5 | 8% | 0% |
| Decision step (`decision.*`) | 50 | 5.0 | 5.7 | 18% | 0% |
| Alternatives (`alt.*`) | 31 | 3.6 | 2.6 | 6% | 0% |
| Quick result (`quick.line.*`) | 24 | 4.1 | 4.0 | 4% | 0% |
| Sections (`section.*`) | 72 | 3.5 | 3.7 | 6% | 4% |

ⓘ bodies average 32 words; the longest is 94.

### 2.3 What the number hides

A score of 3.8 does not mean "easy to understand". It means short words and short sentences. These examples score grade 2 to 5 and still fail:

| String | FK | What it hides |
|---|---|---|
| "$219,783.86 free" | ~2 | "free" has at least four readings |
| "What breaks" | ~1 | "breaks" reads as "I'm broke" or "it fails" |
| "Rough basis" | ~3 | "basis" is used for two things |
| "Out of savings" | ~2 | reads as "no savings left" |
| "Lines you will not cross" | ~3 | idiom; "line" also means a row, a rate line, a limit |
| "Where it lands" (Five ledgers) | ~3 | "ledger" is accountant jargon |
| "Cushion: Over 50 years" | ~3 | three meanings of cushion; "50 years" is a cap, not a forecast |

Readability needs a second measure: a **sense count** (how many different things one word names in the catalogue). Section 4.3 has it.

### 2.4 Worst offenders (by FK, strings of 12 words or more)

| FK | Words | Key | Problem |
|---|---|---|---|
| 11.5 | 59 | `decide.alt.footer` | two sentences of 28 and 30 words; "genuinely spare", "capped at" |
| 11.3 | 23 | `decide.alt.tradeThin` | one sentence, three figures, a dash |
| 11.2 | 94 | `decide.info.netFreeCashFlow.body` | the home headline's ⓘ: three sentences, 25+ words each, defines two other terms inside |
| 9.8 | 16 | `decide.decision.writtenRunning` | "recurring monthly lines, net ... and ... existing expenses closed" |
| 9.7 | 50 | `decide.info.totalCost.body` | longest sentence 31 words |
| 9.3 | 27 | `decide.warn.monthAlreadySame` | "That gap is borrowed money covering ordinary bills" |
| 9.0 | 26 | `decide.pay.loanSavedLine_*` | "financedNoDeposit" repeated |
| 8.9 | 21 | `decide.info.treatLike.body` | "built-in type", "secured default" |
| 8.9 | 9 | `decide.verdict.titleNoAlreadyShortSame` | short but grade 9: "already ... overspent either way" |
| 8.7 | 20 | `decide.home.noFigures.body` | one sentence, two nested options |
| 8.5 | 46 | `decide.info.investedInstead.body` | one 38-word sentence with a nested parenthesis |
| 8.1 | 20 | `decide.quick.line.cashFits` | one sentence, 3 figures, 2 clauses; "lands at" |

After the proposed rewrites (section 7), the 70 changed strings of 5 or more words move from a mean of 4.2 to 3.6. That is small by design: the rewrites remove private senses and long sentences, not syllables.

---

## 3. Word by word

Format: how a confused, lazy or anxious reader might read it, the worst plausible reading, the risk, 2 to 3 alternatives, and my pick. "Test" means a guard test in `src/i18n/__tests__` pins the current string and would need updating. Decisions D-105 to D-107 were made by the user on 2026-10-24; where I recommend reversing one I say so, and give a fallback that keeps it.

### 3.1 Money-figure words

**"free"** (`fig.free`: "$1,240 free", `verdict.key.freeCaption`: "Free a month")
- Readings: money I can spend; free of charge; free money (a refund?); free from tax; "available to me right now" (it is a monthly projection, not a balance).
- Worst: the user sees $219,783.86 and believes that sum is in their account and spendable today.
- Risk: **high** (home screen, largest figure). The sentence under it ("this month, after spending, debts and everything set aside") is grey, small, and the one part that carries the meaning.
- Alternatives: "$1,240 to spare"; "$1,240 left over" (D-106 retired "left": it reads as "remaining balance"); "$1,240 available" (reads as balance).
- **Pick: "to spare."** It is a plain phrase for "more than needed", it is already used in the app ("still spare at month end", "Out of this month's spare"), and it does not read as a balance. Fallback within D-106: keep "free" but change the eyebrow to "Money to spare this month" so the adjective is explained by the noun. Test: `d106Wording`.

**"overspent"** (`fig.overspent`, titles, warnings)
- Readings: I spent too much (past, my fault); I have already overspent; a bank overdraft.
- Worst: "I've done something wrong and I'm in debt". In "Your worst month is already $6,003.85 overspent either way" the word "already" adds blame. The figure is a hypothetical month, not a fact.
- Risk: **high** for anxious users; it also asserts a past act. YNAB uses "overspending" for something that has happened in a category ([YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi.md)); here the same word is used for scenarios.
- Alternatives: "$5,884 more out than in"; "$5,884 over"; "$5,884 gap".
- **Pick: "more out than in".** Grade 3, neutral, true in every case (this month, worst month, with saving paused), and it names both sides. It is longer; on the hero use the figure on one line and the phrase on the next. Use "overspent" only when the logged month is already negative. Test: `d106Wording`, `decideNamePause`.

**"short"** (retired by D-106; survives in `quick.line.cashNo`, `section.lineShort`)
- Reads as "short of money" (fine) or "short of time" (ESL), and in "Cash covers it, but the month would end $X short" as a shortfall of something unnamed. Retiring it was right. Keep it only as "below your minimum cash".

**"spare"** (`size.from_spare_this_month`, `titleFits`, quick lines)
- Reads as "spare tyre", "spare room", "can be spared". Good word, but it is used as an adjective ("still spare"), a noun ("this month's spare"), and a verb-like phrase. Pick one form: **"to spare"** after an amount. The noun form ("Out of this month's spare") reads awkward; use "Paid from this month's spare money" or "Fits in this month".

**"left"** (retired from month figures; still in cash lines: "cash left after", "Left blank")
- "Left blank" is clean (empty field) but "left" alone means three things (remaining, departed, direction). Where it remains, it is allowed by `d106Wording` for cash. Replace "Left blank" with "If left empty" or "If you leave it empty" in the six ⓘ bodies.

### 3.2 Month and basis words

**"worst month" / "Your worst month"**
- Readings: the month I did worst; my failure; a bad month (judgement); the lowest-earning month; the highest-spending month; a combination of the two that never actually happened (with under 3 months, the card combines the lowest income with the highest spending, `info.tightestFigures`).
- Worst: "the app is telling me I had a bad month". In "Your worst month is already $6,003.85 overspent" the possessive points at the person.
- Risk: **medium to high**; shame plus an inaccurate description.
- Alternatives: "Tightest month"; "Lowest month"; "Hardest month".
- **Pick: "Tightest month."** Neutral, describes the money not the person, and already used in the catalogue ("Your tightest figures"). Define it once: "the month with the least money in and the most going out". Tests that pin the current strings will need updating.

**"average month"**: clear. Minor risk: reads as "ordinary, so OK". Keep. Define once in the sheet: "Add up your logged months and divide".

**"This month" vs "expected"**
- `This month` on the card is the month **as expected to end** (logged so far plus pay and bills still due). A user reads "this month" as "what has happened so far". The ⓘ and sheet say it ("this month as it is expected to end") but the label never does.
- Risk: **medium**. A user checking on the 3rd sees a figure that includes pay not yet received and assumes it is real.
- Alternatives: "This month (expected)"; "This month, as expected"; "Expected this month".
- **Pick: "This month, as expected"** in the sheet row and compare row; "This month" stays on the chip with the sub-line "as it should end".

**"Net free cash flow"**
- Readings: for most people a meaningless chain of finance words; "free cash flow" is a company-accounts term; "net" means after tax to some, and "net of something" to others.
- Worst: skim past the eyebrow and read only the figure.
- Risk: **high** on the first screen.
- Alternatives: "Your month"; "Money to spare"; "Spare each month".
- **Pick: "Your month"** on the eyebrow, "Your month, in detail" on the sheet, "To spare" on the result row. One word for the concept everywhere. Changes: `home.card.eyebrow`, `home.monthDetails.title`, `info.netFreeCashFlow.term` and about 10 references in prose (pots, waitGoal, wait copy).

**"Judge on"** (`home.card.judge.sheetTitle`)
- Readings: "judge" as in court; the grammar gives no object ("judge on what?"); "on" as in "on a scale".
- Worst: "the app is judging me".
- Alternatives: "Check against"; "Based on"; "Use".
- **Pick: "Check against"**, with the sheet body "Your month and every check use the one you pick." Tests that pin the current strings will need updating.

**"basis"** (`basis.*`, `verdict.compare.title` "The outcome on each basis", `depth.confidence.*` "Rough basis", `info.confidence.term` "Basis", `verdict.basisAverage`)
- Readings: "basis" as the cause; "basis" as in "on a monthly basis"; "on what basis" (justification); a tax basis.
- Used for two unrelated things on one screen (`x05`): the month type and the strength of evidence. Also "basis" appears in `basisMonth.term` ("Average or worst month"), `asIncomeValue`, and TalkBack ("Basis: rough, tap for reasons").
- Risk: **high**; the same word, two meanings, one screen.
- **Pick: retire "basis" from every user-facing string.** Month type: "Check against". Evidence strength: "estimate" (Rough, Fair, Firm). Compare card title: "How it looks in each kind of month". Keep `Basis` as an internal type name only.

**"Rough basis" / "Strong basis"** (and "Fair basis")
- Readings: "rough" as in approximate, or as in difficult/dangerous; "strong basis" as "strong yes".
- Worst: "Strong basis" read as "Strong approval". Rough read as "this is a bad idea".
- Alternatives: "Rough estimate / Fair estimate / Firm estimate"; "Early read / Fair read / Solid read"; "Low / Medium / High confidence".
- **Pick: "Rough / Fair / Firm estimate"** and add the reason on the pill sheet. The honest part (it is an estimate) is preserved, and the word describes the answer rather than endorsing it. Fix the footer: the engine marks a read rough for a first read, under 3 full months, or **volatile income**. The current footer omits the third.

**"Volatile"** (`steadiness.volatile`, red pill on Month details `w21.png`)
- Readings: dangerous, explosive; "unstable"; for ESL users "volatile" is a rare word.
- Worst: a red pill that appears unprompted on a money sheet reads as an alert about the user's finances or their character.
- Alternatives: "Varies a lot"; "Very uneven"; "Changes a lot month to month".
- **Pick: "Varies a lot"**, and use the neutral grey chip tint. Variable becomes "Varies".

**"cushion"** (`verdict.key.cushionCaption`, `reserve`, `cushionMonths`, `quick.line.cashFits`, `warn.cashTitle` "Cash cushion broken")
- Readings: three different things: (1) the cash line the user sets ("Cash never below $27,116.58"), (2) the months of costs the cash would cover ("Cushion: Over 50 years"), (3) "your own line". Metaphor: a soft pad; for ESL a sofa cushion.
- Worst: "broken" cushion reads as a failed safety net.
- Alternatives: "minimum cash"; "safety buffer"; "cash floor". ("Floor" is already used for saving and investing lines.)
- **Pick: "minimum cash"** for the line; **"Cash covers"** for the months figure ("Cash covers: 3 months"). Retire "cushion" from user-facing copy. Test: `decideCopy`, many `info.*` strings.

**"Lines you will not cross"** and **"What breaks"**
- Readings: "lines" as rows, rates, or red lines; "will not cross" reads like a vow the user made; "breaks" reads as "fails", "I'm broke", "the app breaks".
- Worst: "What breaks: 2 lines break" reads as a malfunction.
- Alternatives: "Your limits"; "Limits you set"; "Your rules".
- **Pick: "Your limits."** Results: "Within every limit"; "2 limits passed". Verbs: "passes a limit", not "breaks a line". Rename the six items with "at most"/"at least" as they are (those are clear).

**"On the edge"** (`depth.edge.tag`)
- Idiom (cliff edge); alarming; ESL unfriendly. **Pick: "Close to a limit".**

**"Needs adjustment"** (`state.adjust`)
- Readings: who adjusts, what, how? Sounds like a fault in the app or a task for the user.
- What it means: the month fits but one limit is passed.
- Alternatives: "Passes a limit"; "Fits, but over a limit"; "Tight".
- **Pick: "Passes a limit."**

**"It fits" / "Doesn't fit right now"**
- "It fits" reads as approval and does not say fits what. "right now" implies "later it will".
- **Pick: "Fits" and "Doesn't fit"**, plus the rule that the headline names the month type and flags disagreement (fix 1). "Doesn't fit right now" on a *worst-month* row suggests the scenario will pass; it will not.

**"Still overspent with saving paused"** (D-105)
- Readings: has my saving been paused? Did the app pause it? "Still" assumes the reader knew it was overspent.
- The idea (naming the pause) is right. The wording asks the reader to hold a hypothetical.
- **Pick:** "Still more out than in, even with saving stopped" (48 characters). "Stopped" is plainer than "paused", and "even with" marks it as a what-if.

### 3.3 Words for set-aside money

**"pots"**: UK banking metaphor (Monzo). In US English "pot" is cannabis or a cooking pot. First use is defined in a sheet. Alternatives: "Savings goals" (collides with the app's own goals); "Funds"; "Envelopes" (US budgeting term). **Pick: keep "Pots"**, because it is distinct and defined, but define it on first sight in the Pots row on home ("Pots: money kept for one cost"). Check US test users.

**"set aside"** (`hero.sub*`: "everything set aside", `monthDetails.pots`: "Set aside for pots", `deleteConfirm`: "Its set-aside")
- Readings: three meanings: money in pots, money in saving, money paid out. The hero says "everything set aside" and the sheet shows 5 lines of which only one is "set aside".
- **Pick:** name the parts: "after spending, debts, saving and pots".

**"Out of savings"** (`size.from_savings`)
- Reads: "I'm out of savings" (broke). Real meaning: paid from savings.
- **Pick: "Paid from savings."** "Out of this month's spare" becomes "Paid from this month's spare". "Needs spreading" becomes "Too big to pay at once".

**"Not from cash"** (`state.noCash`): reads as a negation with no subject. Pick "Cash can't cover it" and "Credit doesn't fit".

### 3.4 Actions and the "record, not advice" voice

**"Go ahead / Wait / Pass"** (`decision.*Name`, `flow.commit.*`, `info.whatGetsWritten`)
- "Go ahead" is the app granting permission. A reader who sees "It fits" then "Go ahead" gets two nudges in a row. "Pass": to pass a test is to succeed; to pass on a deal is to decline. "Wait" is an instruction.
- The compliance angle: the app is a record-keeper (`flow.notLender`). Buttons that name the record are on-brand; buttons that sound like approval are not.
- **Pick:** "Record as bought" / "Save the plan" (exists) / "Record as not buying". `ACTION_LABELS` in `decideCopy.test.ts` would need the new keys.

**"Check it" / "Full check" / "Run the full check" / "New check"**: four names for starting a check. "Check it" is clear. "Full check" is ambiguous (full of what?). **Pick: "Check it" (quick) and "Detailed check".** "New check" on the button is fine.

**"Something and a price"** (`home.field.placeholder`, grey on dark, low contrast in `x01`): reads as a template left in by mistake. **Pick: "Item and price, like laptop 1200"** (a real example).

**"Clear"** (next to "Run the full check" and next to "With other checks" on the Impact header): clear what? In `lang-10` it sits beside "Run the full check" and discards the quick text; in `lang-12` it sits beside the "With other checks" pill and discards the whole check (`clear.hint`: "Discards this check and starts an empty one"). The visible word has two scopes. **Pick:** "Clear text" for the quick field; "Discard check" for the flow.

### 3.5 Other terms on the list

| Term | Reading, worst plausible | Pick |
|---|---|---|
| **"Needs: price, rate"** (`pay.card.needs`) | A to-do list that sounds like the app's demand. Mostly fine. | "Still needed: price, rate" |
| **"With other checks"** (pill) | Looks like a status chip or a toggle. Meaning: the other open checks are counted as if bought. Unexplained on tap target ("With my other open checks" in TalkBack). | "Counts other open checks" |
| **"Over 50 years"** (cushion, runway) | A cap rendered as a forecast: "my cash lasts over 50 years" is not a claim anyone should read as true. | "More than 50 years" with label "Cash covers", or "No limit reached" |
| **"Runway"** (`setbacks`) | Start-up jargon. | "Cash lasts N months" |
| **"Invested instead: $X after 5 years at 7%"** | Reads as a promise or as something that happened. The rate is user-entered. | "If invested instead: about $X after 5 years at 7% (a projection)" |
| **"Over 5 years: $466.27 in all"** (`lang-12`) | "in all" what? Includes interest? For a $280 loan. | "Total cost over 5 years: $466.27" |
| **"Housing costs at most"** | Clear. The ⓘ ("stricter than a test on gross income") is jargon. | keep label; simplify ⓘ |
| **"Debt payments at most"** / **"Debt service"** (`section.lineDsr`) | "Debt service" is banker jargon and still shown in the lines section. | "Debt payments" everywhere |
| **"Share of money in"** (`lines.shareField`) | "money in" is plain once learned; first use unclear. | "Share of your income" in the editor label |
| **"Unsecured debt"** | Jargon; the ⓘ explains. | "Debt with nothing backing it" in sentences; keep the label with ⓘ |
| **"Lines you will not cross" tag "default · 6 months"** | "default" next to debt reads as "defaulted on debt". | "standard" or "app's usual" |
| **ⓘ "What this changes"** | "changes" what? often "Nothing in the verdict". | "Effect on the answer" |
| **"the verdict"** | Courtroom again. | "the answer" |
| **"ledger" / "Five ledgers"** | Accounting. | "Five areas" |
| **"Cooling-off"** (`info.size.changes`) | Undefined in the sheet that mentions it. | "A 48-hour reminder" |
| **"Cash path"** | Hiking trail. | "Cash day by day" |
| **"Assumptions in play"** | Idiom. | "What this assumes" |
| **"Where it lands"** | Idiom; "lands" as in an aeroplane. | "What it changes" |
| **"stand-in rate", "provisional rate"** | Two names for one thing. | "an earlier exchange rate" |
| **"Instalment"** | UK spelling in a USD app. | en-US "installment", en-GB "instalment" |

### 3.6 Error, loading, empty and undo copy

| String | Read as | Note |
|---|---|---|
| "Your figures didn't load" / "A check needs your latest figures." / "Try again" | Good: says what happened and the action. Add "Nothing was changed." | `quick.error.*` |
| "22 changes couldn't save" (red banner on every Decide screen) | The app lost my data. | Add why and what happens next. "couldn't" and "didn't" both used. |
| "Loading your figures", "Checking", "Updating" | Fine. | |
| "Nothing to judge against yet" | Courtroom again; "judge". | "Nothing to check against yet" |
| "Not worked out yet" | Fine. | "Can't work this out yet" is clearer |
| "No pots yet. A car service in March is one." | "is one" is awkward; ESL. | "No pots yet. A pot could be for a car service in March." |
| "Nothing decided yet" / "Checks you act on, save for or pass on are kept here." | "pass on" repeats the Pass issue. | "Checks you record as bought, plan for or decide against are kept here." |
| Toast "Pot saved" + "Undo" | Undo what? Other toasts carry the name ("Pot deleted · Name"). | "Pot saved · {{name}}" |
| Toasts: "Written to your records", "Logged. The record notes it breaks a line.", "Saved.", "Passed. Nothing moved." | Four verbs for one act (written, logged, saved, passed); "breaks a line" again; "Nothing moved" is ambiguous. | "Saved to your records." / "Saved to your records. It notes it goes over a limit." / "Saved as not buying. No money moved." |
| "Undo last change" (TalkBack `a11y.toastUndo`) | Fine for TalkBack; the toast text is the label. | add the label: "Undo: Pot saved" |
| "Opened as a new check", "Line attached", "Line unlinked" | "Line" is a row of the user's records here: a third meaning. | "Record attached" or "Transaction attached" |
| Delete confirm: "It leaves Open checks. Nothing was written, so no balance changes." | "written" is database speak. | "Nothing was recorded, so no balance changes." |
| "Its set-aside stops coming off net free cash flow. Undo is available right after." | Two jargon terms. | "The monthly amount stops coming off your spare money. You can undo this right after." |

---

## 4. Structure and flow

### 4.1 Hierarchy

Home (`x01`, `lang-03`): good. One card, one number, one input, three rows. The card does three jobs (headline figure, scenario picker, quick check) and the big figure wraps to a second line at 8 digits ("$219,783.86 / free"), so the word "free" lands alone, in the largest type on screen, pushing the sub-line below the fold of attention. When the quick-check result opens (`lang-06`), the big figure disappears and becomes a wrapped line: "$219,783.86 free · In $220,624.89 · Out / $841.03" with a single orphan word on the second line.

Impact step (`lang-12`, `x04`): first screen shows: eyebrow ("OUT OF THIS MONTH'S SPARE ⓘ"), "Rough basis ⓘ" pill, headline, one sentence, three key figures with three captions, basis line, and below it a 3-line grey sentence joining two unrelated facts ("Includes amounts converted from CAD, GBP ... · Card payments not counted until the minimum is set"). The three-month-types card is below the fold; "What breaks" is below that. Header, step bar and the sticky footer line ("Nothing here changes your balances. Step five is where anything gets written.") use about 40% of the screen height.

The reader's likely path: read the headline, read the first figure, tap Next. Everything that qualifies the headline (the rough pill, the compare card, the limits) comes after it. The qualifications have to move into the headline (fix 1).

### 4.2 How many concepts a user must hold

On the Impact step, before reaching the Next button, the user meets about 20 named ideas:

verdict state, size, estimate strength, free-a-month, cushion, a-month, 5-year total, check-against basis, "with other checks", converted amounts, card minimum, three month types, then folds: what breaks, month line by line, cash path, where it lands, if something goes wrong, if invested instead, assumptions (11 of them). There are **9 ⓘ icons** visible across the page (`lang-12` to `lang-16`).

Cognitive-load rule of thumb: a first-time user can hold 3 to 4 new ideas per screen. Proposed first screen: headline, why (one line), how firm (one pill), three-month-types card. Everything else stays folded and is labelled as detail.

### 4.3 Sense count: one word, many meanings

| Word | Senses in Decide |
|---|---|
| **line** | a row in the month table; a limit ("Lines you will not cross"); a transaction record ("Attach a line"); a running-cost line; "line under it"; "each line" in What breaks |
| **check** | a quick check; a full check; an open check; "With other checks"; "check it"; "Check cleared"; to verify; a bank cheque in US English |
| **basis** | month type; evidence strength; "basis" in prose |
| **month** | calendar month; "this month" (expected); worst month; average month; a month figure; "the month closes"; months of a loan; months of cover |
| **cushion** | the cash line; months of cover; "your own line" |
| **pot** | a savings pot; "set aside" in prose |
| **free** | free of charge; spare; "free a month" |
| **closes** | "the month closes", "closes with", "Month closes": an accounting-period term |
| **pause** | pausing saving; "pauses" in "Investing pauses to close the month" |
| **record / written / logged / saved** | the same act |
| **decision / plan / check / purchase** | the same object at different stages |

### 4.4 Consistency: same idea, different words

| Idea | Words currently used | Pick |
|---|---|---|
| the headline monthly figure | net free cash flow, free, spare, left, "Free a month", "Month end", "money kept" | **spare** ("to spare") |
| the cash line | cushion, Cash never below, reserve, protected, minimum | **minimum cash** |
| the six limits | lines, floors, limits, "your debt line", "the line" | **limits** |
| the answer | verdict, state, outcome, answer, read, basis | **answer** (and "estimate" for strength) |
| money coming in | income, money in, In, "expected income", earnings | **income** in sentences; **In** / **Out** as figure labels |
| making a record | written, logged, saved, recorded | **saved to your records** / **recorded** |
| stopping saving | paused, pause, stops | **stopped** |
| a month not balancing | overspent, short, the month does not close, gap, more than comes in | **more out than in** |
| the person | you, your, the user's household, "your share" | **you** |

### 4.5 Jargon density

Terms a first-time user will not know without help, with a count of strings (rough): ledger, runway, unsecured/secured, APR, instalment, deferred interest, promotional rate, stand-in/provisional rate, floors (investing floor, saving floor), debt service, DSR (in code), cooling-off, projection, net free cash flow, cash path, assumptions in play, "the month closes", "series" (recurring series), "stamped", "converted at the latest stored rate". About 20 terms across about 250 strings. Each is defined somewhere, but not where the reader meets it.

### 4.6 Labels versus explanations; the ⓘ pattern

Strengths: 65 explained terms; every ⓘ has a TalkBack label ("About {term}", hint "Opens an explanation"); the "What this changes" box gives the effect.

Problems (all seen on device):

- **The sheet title is not the label that was tapped.** Tapping ⓘ next to "Out of this month's spare" opens "How big this is" (`lang-07`). Two names, neither the user's.
- **Two sheets with the same title.** ⓘ and "Details ›" both open a sheet titled "Net free cash flow" (`lang-08`, `x07`, `w21`).
- **Length.** `info.netFreeCashFlow.body` is 94 words, 11 lines at the sheet's font size on the Pixel 9 (`lang-08`). 13% of bodies exceed grade 8. Mean 32 words.
- **"What this changes" is mostly "Nothing in the verdict".** At least 12 of the 65 open with "Nothing in the verdict." That is bookkeeping for the team, not information for the reader.
- **A second ⓘ inside an ⓘ.** The size sheet mentions "Cooling-off" and "cushion", neither defined there.
- **Definitions that need other definitions.** The Net free cash flow ⓘ defines "pots" inside itself.
- **The ⓘ carries the meaning the label should.** "Net free cash flow" cannot be understood without its ⓘ, which means many users will not understand it.
- **Nine ⓘ on one screen** dilute each other.

Fix: a label that is self-explanatory beats an ⓘ. Keep ⓘ for the "why" and the exception, not for the definition of the headline word. ⓘ bodies: 40 words, 3 sentences, one idea; title equals the tapped label.

### 4.7 Empty, loading, error, undo and TalkBack

Empty: Pots (`lang-01`) is good: sentence, one example, one button. The explanation ("Money kept for a cost with a set amount and a date. What each pot needs a month comes off net free cash flow.") is repeated in the ⓘ (`lang-02`) almost word for word. One of them can go.

Loading and error: good in tone. One real defect: the keyboard is open when "Check it" is tapped; the first tap only dismissed the keyboard and ran nothing (`lang-04` to `lang-06`). A user who taps once and sees nothing change will tap again or give up.

Banner: "22 changes couldn't save" is red and appears on every Decide page above the title (`lang-01`, `lang-11`, `lang-18`). It carries no reason, no consequence, no action on that page. The "Needs a look" sheet says "22 changes didn't save · Affects: Records on this device · Review changes" (`lang-09`). Two phrasings, one fact.

Undo toasts: "Pot saved ... Undo" (`y01`, `y06`) has no noun. After two saves in a row the user cannot tell which one Undo reverses (`y06`). `undo.label.*` strings in the Activity log do carry names, so the data exists.

TalkBack (from strings, not run):

- Money is spoken as "dollars" through `formatMoneyA11y` ("1,240 dollars"), which is the safest form. The TPGi test found no single currency format that all five major screen readers announce as money ([TPGi](https://www.tpgi.com/money-talks-formatting-currency-in-web-content/)); spelling the currency out avoids it.
- `home.card.a11yNfcfFree`: "Net free cash flow: {amount} free {basis}. In {in}, out {out}." Reads "free" and a basis phrase in one breath. It would read "to spare, this month as expected" after the rename.
- The three-month-types rows: "{basis}: {state}, {figure}". Good structure. With the current wording TalkBack says "Worst month: Doesn't fit right now, 5,883 dollars and 85 cents overspent" and "This month: It fits, 219,776 dollars free" in a list: the contradiction is also audible.
- ⓘ: "About {term}. Opens an explanation." Good.
- Decorative brown/green dots before "3 items need a look" and "With other checks" carry colour meaning only; verify they are hidden from the accessibility tree and that the text carries the meaning.
- All-caps eyebrows are `textTransform` only, so screen readers should read the underlying mixed case; verify.
- Judge-on a11y: "Judged on {basis}. Opens the choices." Good; rename with the new words.
- Colour: red text for overspent and red cards for the verdict; the words also say it, so colour is not the only signal. Contrast on the grey sub-lines over dark (`x01`: "this month, after spending, debts and everything set aside") and on the placeholder ("Something and a price") looks low; measure.

### 4.8 What I saw on the device (read-only walk, Pixel 9)

No data was changed. I typed "laptop 1200" into the quick field and tapped Check it (does not save). I opened existing checks, ⓘ sheets and the Needs-a-look sheet, and left everything as found (the quick-field text stays in the field; I did not tap Clear). I did not touch Judge on.

| File | What it shows |
|---|---|
| `lang-01` | Pots empty state. Red "22 changes couldn't save" banner. Pots description wraps to 3 lines; a floating dev gear sits on the text (dev build only, ignore). |
| `lang-02` | Pots ⓘ. Body is nearly a copy of the page text above it. |
| `lang-03` | Decide home. Figure wraps ("$219,783.86 / free"). Grey sub-line is the only explanation. "Details ›" sits on a different line from the chip. |
| `lang-04` | Typing in the quick field. Placeholder gone; "Laptop 1200" auto-capitalised. |
| `lang-05` | Keyboard dismissed; first tap on Check it did nothing visible. |
| `lang-06` | Quick result. Card header collapses to "$219,783.86 free · In $220,624.89 · Out / $841.03" (orphan "$841.03"). 30-word result sentence. "With other checks" pill unexplained. "Cash / Credit", "+ Tax, fees", "Run the full check", "Clear" below. |
| `lang-07` | ⓘ on "Out of this month's spare" opens "How big this is". Mentions "Cooling-off". 7 lines. |
| `lang-08` | ⓘ on Net free cash flow: 94 words, 11 lines. |
| `lang-09` | "Needs a look": "22 changes didn't save / Affects: Records on this device". |
| `lang-10` | Home scrolled: Open checks, "Add a change coming up" (an action phrased as a row), "Lines you will not cross". |
| `lang-11` | Open checks: two checks both called "Sofa", all three show "$219,776.24 free a month" with "with the other open checks". |
| `lang-12` | Impact step for an existing check: "It fits", "Rough basis", FREE A MONTH $219,776.24, CUSHION "Over 50 years", A MONTH $7.62, "Over 5 years: $466.27 in all". Three-line grey note below. |
| `lang-13` | Rough basis sheet: "6 full months logged", "Income is volatile", two "Includes amounts converted from ..." bullets; footer "anything less is rough". |
| `lang-14` | "The outcome on each basis": This month "It fits" / Worst month "Doesn't fit right now, $5,883.85 overspent" / Average "It fits"; then "What breaks: Nothing breaks". |
| `lang-15`, `lang-16` | Seven folds with 5 ⓘ: "Where it lands: 2 worse · 3 unchanged"; "If something goes wrong: Runway over 50 years"; "Assumptions in play: 11 assumptions". |
| `lang-17` | Step 2: amount chip reads "USD 10.00" while every other figure uses "$"; "The rate can change" toggle with an ⓘ. |
| `lang-18` | Back-stack: back arrow returns one step at a time (check, step 2, list). |
| `lang-19` | Home again, quick result still open. |

Older screenshots used above: `x01`, `x02`, `x04`, `x05`, `x07`, `w21`, `y01`, `y06`, `x08`, `x12`, `v23`, `v27`, `w20`. `dc01` shows an **older build** ("US$5,876.23 short", "YOUR WORST MONTH") from before D-106; the current build no longer says "short" there. `v25` shows the same old wording on the verdict ("Your worst month is already $6,003.85 short either way", "LEFT A MONTH"). Both predate the catalogue read above.

---

## 5. Emotional tone

### 5.1 The words that carry judgement

| Word or phrase | Where | Emotion it carries | Honest, calmer version |
|---|---|---|---|
| "What breaks" | fold title, ⓘ | failure, "broke" | "Your limits" |
| "Cash cushion broken" | `warn.cashTitle` | a safety net failing | "Below your minimum cash" |
| "Your worst month" | verdict, card | shame, a person's failure | "Your tightest month" |
| "overspent" | everywhere | blame for a past act | "more out than in" |
| "already ... either way" | `titleNoAlreadyShortSame` | blame plus fatalism | "with or without this" in the body |
| "That gap is borrowed money covering ordinary bills" | `warn.monthAlready` | moralising | "A gap like this is covered by savings or by borrowing." |
| "Volatile" in a red pill | Month details | alarm | "Varies a lot", neutral tint |
| "On the edge" | chip | cliff | "Close to a limit" |
| "Doesn't fit right now" | verdict | "so it will later" (false hope) | "Doesn't fit" |
| "Needs adjustment" | chip | the user must fix something | "Passes a limit" |
| "Not spending is not saving" | `past.writtenPassNotSaving` | lecture | state the fact: "Nothing was added to savings." |
| "2 worse · 3 unchanged" | Where it lands | alarm without a referent | name the areas: "Cash and debt are worse" |
| "the month does not close" | `warn.monthTitleNoPause` | ominous, accounting | "More goes out than comes in" |
| "Declined" | `warn.cardNotAcceptedValue` | a bank refusing the user | "Not accepted on a card" |

### 5.2 False reassurance (the other failure)

| Phrase | Risk | Fix |
|---|---|---|
| "It fits" over a red row | reads as approval | name the month type and the disagreement |
| "Nothing breaks" when the tightest month does | wrong by omission | "Within every limit on this month. Passes 2 limits in your tightest month." |
| "It clears every line, with $X still spare" | "clears" sounds like a pass; "still spare" ignores the estimate's strength | "Within every limit, with $X to spare at month end (rough estimate)" |
| "Go ahead" | permission | "Record as bought" |
| "Over 50 years" | a number from a cap | "No limit reached" |
| "Strong basis" | endorsement | "Firm estimate" |

### 5.3 Staying honest without frightening (and inside "declarative, not advice")

Principles that keep to the compliance rule in `CLAUDE.md`:

1. **State the figure and its condition, not the conclusion about the person.** "Cash would drop $2,000 below your minimum" not "You can't afford this".
2. **Say what the app did, not what the user should do.** "Records it anyway" not "Go ahead".
3. **Name the hypothetical.** "In your tightest month" is a scenario; "your worst month is $X overspent" reads as a fact.
4. **Use concrete loss, not moral loss.** Loss-framed messages work: in a field study of about 39,000 Mint users, simple messages stressing loss avoidance ("Avoid overdraft fees") cut overdrafts about 9% the next week ([summary of the Management Science study](https://www.alphagalileo.org/en-gb/Item-Display/ItemId/258532)). That supports plain, concrete consequences ("cash would run out before payday"), but the study is about overdraft fees and says nothing about shame; the finding does not license blame words.
5. **No "should", "recommend", "best", "safe to".** Already enforced by `BANNED` and `REASSURING` in the tests. The proposed copy passes them. Every rewrite in section 7 is declarative.
6. **Calm colour follows the word.** Red only for a limit actually passed and a figure actually negative; neutral for "varies a lot" and for hypothetical months.

Background: loss aversion and framing effects are Kahneman and Tversky's (1979, 1981). They are cited here from background knowledge, not fetched.

---

## 6. Controlled vocabulary and style guide

### 6.1 Glossary (one word per concept)

| Term | Plain definition | Do not also say |
|---|---|---|
| **spare** (to spare) | Money a month has once spending, debts, saving, investing and pots are taken off. | free, left, net free cash flow, surplus |
| **more out than in** | A month where outgoings are bigger than income, by this amount. | overspent, short, deficit, gap (except as a noun in a body) |
| **your month** | The home figure. Always followed by its month type. | net free cash flow |
| **month type** (Check against) | Which month the check uses: **This month** (as expected to end), **Tightest month**, **Average month**. | basis, judge on, scenario |
| **tightest month** | The month with the least money in and the most going out. | worst month |
| **estimate** (Rough, Fair, Firm) | How much of your own history the answer rests on. | basis, confidence, read |
| **limit** | A boundary the user sets (six of them). A check can be within or past it. | line, floor, rule, threshold |
| **minimum cash** | The least cash to keep (the "Cash never below" limit). | cushion, reserve, buffer |
| **cash covers** | How many months of costs the cash could pay. | cushion months, runway |
| **pot** | Money kept for one cost with a target and a date. | goal (a different feature), set aside |
| **check** | One question about one purchase. | decision, plan (until recorded) |
| **open check** | A saved check not yet recorded. | draft |
| **recorded / saved to your records** | The act of writing it into Activity. | written, logged, committed |
| **answer** | The result of a check ("Fits", "Passes a limit", "Doesn't fit"). | verdict, outcome |
| **income** | Money coming in, in sentences. **In / Out** as figure labels. | earnings, money in (in sentences) |
| **stopped** | Saving or investing set to zero in the what-if. | paused |
| **varies / varies a lot** | How steady income has been. | variable, volatile |
| **debt with nothing backing it** | Unsecured debt (cards, personal loans). | unsecured (outside labels) |

### 6.2 Style guide

- **Voice**: declarative, second person, present tense or "would". States figures and conditions. Never "should", "recommend", "best", "safe", "worth it". Never an order to spend, save, buy or borrow. Buttons name what the app does ("Record as bought").
- **Sentence length**: 15 words typical, 20 maximum, 25 hard stop (GOV.UK splits at 25). One idea per sentence. One figure per sentence where possible.
- **Reading level**: US grade 6 for labels, grade 7 maximum for sheets.
- **Words**: everyday words ("buy", not "purchase"; "about", not "approximately"; "more out than in", not "deficit"). Explain a specialist word where it first appears; use it unchanged afterwards.
- **No idioms**: "on the edge", "where it lands", "in play", "cushion", "runway", "will not cross", "goes wrong" (acceptable but plain alternatives exist) cost ESL readers.
- **Numbers**: figures last in the sentence, with units attached: "$1,240 a month", "6 months". Digits for every number, including "step 5". Use the non-breaking space between count and unit (existing rule U). At most 3 figures per sentence; at most 1 in a fold preview.
- **Currency**: symbol and number ("$1,240.00"), one format per currency; never "USD 10.00" in one place and "$10" in another. Show cents only when the amount has them. Spoken form: spelled out ("1,240 dollars").
- **Dates**: "Mar 3" in sentences, "March 3, 2027" in rows; month names, never numeric dates. "by Mar 2027" in pots is fine.
- **Tense**: present for facts ("The month ends with..."), conditional for scenarios ("would drop", "would take"), past for what the app did ("Saved").
- **Labels versus explanations**: a label names the thing in 1 to 4 words and is understandable without its ⓘ. The ⓘ title equals the label that was tapped. ⓘ body at most 40 words, 3 sentences, one idea. "What this changes" says the effect on the answer in one sentence or is omitted.
- **Alarm words**: avoid break, broken, fail, worst, danger, wipe out, run out (use only where true and literal: "cash would run out before payday" is accurate and stays). Colour red only for a limit passed.
- **Spelling**: en-US ("installment") for a USD app; en-GB variant for UK. The catalogue uses "instalment" with "$".
- **Length limits (existing)**: verdict titles 64 characters, fold previews 44 characters. All rewrites in section 7 are checked against these and flagged in the Fit column.

---

## 7. Rewrites

127 strings. Key names are the catalogue's, so the team can apply them directly. "FK" is the heuristic grade from section 2. "Fit" shows the character count against the 64 and 44 limits where they apply (demo values filled in for placeholders).

Notes on applying:

- **These reverse parts of D-105, D-106 and D-107.** Tests that pin the old strings will fail and need updating, not the copy: `decideNamePause.test.ts`, `d106Wording.test.ts`, `decideCopy.test.ts` (ACTION_LABELS and the `short`/`left` list), `decideCopyFit.test.ts`, `d106Retired.test.ts`, `r18Retired.test.ts`. I did not run any of them.
- **The `short`/`left` ban is relaxed in one place**: `quick.line.cashFits` uses "still hold"; no new "left" or "short" is introduced.
- **If D-106 stays**: apply rows 2 to 6 only as "keep free/overspent, add the frame line"; apply every other row.
- **Strings not in the catalogue** (the sync banner "22 changes couldn't save") are outside `decide.*`; recommended text: "22 changes are not saved yet. They stay on this phone until they are." with a "Review" action.
- Rows 114 to 117 change the commit buttons; `flow.commit.wait` ("Save the plan") stays.

| # | Key | Current | Proposed | Words | FK now → new | Fit |
|---|---|---|---|---|---|---|
| 1 | `decide.home.card.eyebrow` | Net free cash flow | Your month | 2 | -2.2 → -3.0 |  |
| 2 | `decide.fig.free` | {{amount}} free | {{amount}} to spare | 3 | 2.9 → 1.3 |  |
| 3 | `decide.fig.overspent` | {{amount}} overspent | {{amount}} more out than in | 5 | 14.7 → 0.5 |  |
| 4 | `decide.home.hero.subMonth` | this month, after spending, debts and everything set aside | this month, after spending, debts, saving and pots | 8 | 7.6 → 3.8 |  |
| 5 | `decide.home.hero.subWorst` | in your worst month, after spending, debts and everything set aside | in your tightest month, after spending, debts, saving and pots | 10 | 6.9 → 4.8 |  |
| 6 | `decide.home.hero.subAverage` | in your average month, after spending, debts and everything set aside | in your average month, after spending, debts, saving and pots | 10 | 9.1 → 6.0 |  |
| 7 | `decide.home.card.judge.sheetTitle` | Judge on | Check against | 2 | -3.0 → 2.9 |  |
| 8 | `decide.home.card.judge.sheetBody` | The card and every check use this choice. | Your month and every check use the one you pick. | 10 | 2.3 → 2.5 |  |
| 9 | `decide.home.card.judge.worst` | Worst month | Tightest month | 2 | -3.0 → 2.9 |  |
| 10 | `decide.verdict.compare.worst` | Worst month | Tightest month | 2 | -3.0 → 2.9 |  |
| 11 | `decide.basis.worst` | Worst month · {{amount}} in | Tightest month · {{amount}} in | 5 | 0.7 → 3.7 |  |
| 12 | `decide.verdict.basisWorst` | worst | tightest | 1 | -3.4 → 8.4 |  |
| 13 | `decide.verdict.compare.title` | The outcome on each basis | How it looks in each kind of month | 8 | 2.9 → -0.7 |  |
| 14 | `decide.verdict.compare.chosen` | Used for this check | The one this check uses | 5 | -2.2 → -1.8 |  |
| 15 | `decide.steadiness.variable` | Variable | Varies | 1 | 20.2 → 8.4 |  |
| 16 | `decide.steadiness.volatile` | Volatile | Varies a lot | 3 | 32.0 → 1.3 |  |
| 17 | `decide.depth.confidence.rough` | Rough basis | Rough estimate | 2 | 2.9 → 8.8 |  |
| 18 | `decide.depth.confidence.fair` | Fair basis | Fair estimate | 2 | 2.9 → 8.8 |  |
| 19 | `decide.depth.confidence.strong` | Strong basis | Firm estimate | 2 | 2.9 → 8.8 |  |
| 20 | `decide.depth.confidence.footer` | Strong needs 6 full months with steady income; fair needs 3; anything less is rough. | Firm needs 6 full months and steady income. Fair needs 3 months. Less than 3 months, or income that varies a lot, is rough. | 24 | 6.8 → 2.8 |  |
| 21 | `decide.depth.confidence.sheetTitle` | What this rests on | What this estimate is built on | 6 | -2.2 → 2.5 |  |
| 22 | `decide.info.confidence.term` | Basis | How firm the estimate is | 5 | 8.4 → 2.9 |  |
| 23 | `decide.info.confidence.body` | How much history the verdict rests on. Strong needs 6 full months with steady income, fair needs 3, and anything less is rough. Lines converted at a stand-in rate keep it at fair at most. | How much of your own history the answer is built on. Firm: 6 full months and steady income. Fair: 3 months or more. Rough: under 3 months, or income that varies a lot. Amounts converted at an old rate keep it at fair at most. | 45 | 4.5 → 3.1 |  |
| 24 | `decide.home.field.placeholder` | Something and a price | Item and price, like laptop 1200 | 6 | 3.7 → 4.5 |  |
| 25 | `decide.home.field.full` | Full check | Detailed check | 2 | -3.0 → 2.9 |  |
| 26 | `decide.home.linesFold.title` | Lines you will not cross | Your limits | 2 | -1.8 → 2.9 |  |
| 27 | `decide.home.rows.lines` | Lines you will not cross | Your limits | 2 | -1.8 → 2.9 |  |
| 28 | `decide.lines.heading` | Lines you will not cross | Your limits | 2 | -1.8 → 2.9 |  |
| 29 | `decide.lines.sub` | These decide what counts as affordable. Tap any of them to change it. | A check is held against these limits. Tap one to change it. | 12 | 2.4 → 0.5 |  |
| 30 | `decide.lines.reserve.desc` | The cushion no purchase may break | The least cash to keep | 5 | 2.5 → -1.8 |  |
| 31 | `decide.home.notice.items_other` | {{count}} items need a look | {{count}} things to review | 4 | 2.9 → 3.7 |  |
| 32 | `decide.home.problems.failed_other` | {{count}} changes didn’t save | {{count}} changes are not saved yet | 6 | 0.7 → 0.5 |  |
| 33 | `decide.home.problems.recordsOnDevice` | Records on this device | Held on this phone only | 5 | 3.7 → 0.5 |  |
| 34 | `decide.home.sources` | {{months}} months of logged income, {{lines}} expense lines this month, {{debts}} debts and {{accounts}} accounts. Every figure here rescores when they change in Activity. | Built from {{months}} months of income, {{lines}} spending lines this month, {{debts}} debts and {{accounts}} accounts. Change any of them in Activity and these figures update. | 26 | 7.8 → 6.7 |  |
| 35 | `decide.state.fits` | It fits | Fits | 1 | -3.0 → -3.4 |  |
| 36 | `decide.state.adjust` | Needs adjustment | Passes a limit | 3 | 8.8 → 1.3 |  |
| 37 | `decide.state.no` | Doesn’t fit right now | Doesn’t fit | 2 | -2.2 → -3.0 |  |
| 38 | `decide.state.noCash` | Not from cash | Cash can’t cover it | 4 | -2.6 → 0.7 |  |
| 39 | `decide.state.noCredit` | Not from credit | Credit doesn’t fit | 3 | 1.3 → 1.3 |  |
| 40 | `decide.state.missing` | Missing terms | Needs more details | 3 | 2.9 → 1.3 |  |
| 41 | `decide.size.from_savings` | Out of savings | Paid from savings | 3 | 1.3 → 1.3 |  |
| 42 | `decide.size.from_spare_this_month` | Out of this month’s spare | Paid from this month’s spare | 5 | -1.8 → -1.8 |  |
| 43 | `decide.size.needs_spreading` | Needs spreading | Too big to pay at once | 6 | 2.9 → -1.4 |  |
| 44 | `decide.quick.line.cashFits` | Paid outright today your cash lands at {{cashAfter}}, above your {{cushion}} cushion, and the month still closes with {{left}} spare. | Paid in cash today, you would still hold {{cashAfter}}, above your {{cushion}} minimum. The month still ends with {{left}} to spare. | 21 | 8.1 → 4.2 |  |
| 45 | `decide.quick.line.cashMonthShort` | Cash covers it. Even with saving paused, the month would end {{short}} overspent. | Cash covers it. Even with saving stopped, the month would have {{short}} more out than in. | 16 | 4.2 → 2.3 |  |
| 46 | `decide.quick.line.cashNo` | Not from cash: {{short}} short of your cushion. | Cash can’t cover it: {{short}} below your minimum cash. | 9 | 2.3 → 6.3 |  |
| 47 | `decide.quick.line.pauseInvesting` | The month closes only if {{amount}} a month of investing pauses. | The month only balances if {{amount}} a month of investing stops. | 11 | 4.8 → 5.9 |  |
| 48 | `decide.quick.line.creditFits` | {{payment}} a month for {{count}} months. The month closes with {{left}} spare. | {{payment}} a month for {{count}} months. The month ends with {{left}} to spare. | 13 | 1.5 → 1.5 |  |
| 49 | `decide.quick.line.creditShort` | {{payment}} a month for {{count}} months. The month is {{short}} overspent. | {{payment}} a month for {{count}} months. With it, the month has {{short}} more out than in. | 16 | 3.7 → 1.5 |  |
| 50 | `decide.quick.line.creditDsr` | Debt payments would reach {{pct}} of money in. | Debt payments would take {{pct}} of the money coming in. | 10 | 3.8 → 4.8 |  |
| 51 | `decide.quick.line.creditOwe` | Unsecured debt would pass a year’s income. | Debt with nothing backing it would be over a year of income. | 12 | 4.0 → 4.8 |  |
| 52 | `decide.quick.parseError` | A figure is needed — “car 14500” works | No price found. Something like “car 14500” works. | 8 | 2.3 → 2.2 |  |
| 53 | `decide.quick.error.body` | A check needs your latest figures. | A check can’t run without your latest figures. Nothing was changed. | 11 | 2.5 → 2.6 |  |
| 54 | `decide.verdict.titleFits` | It clears every line, with {{left}} still spare at month end. | Within every limit, with {{left}} to spare at month end. | 10 | 3.7 → 6.0 | title 57/64 ok |
| 55 | `decide.verdict.titleNoAlreadyShortSame` | Your {{basis}} month is already {{already}} overspent either way. | Your {{basis}} month already has {{already}} more out than in. | 10 | 8.9 → 4.8 | title 59/64 ok |
| 56 | `decide.verdict.titleNoAlreadyShort` | Your {{basis}} month is {{already}} overspent. This makes it {{short}}. | This makes your {{basis}} month {{short}} more out than in. | 10 | 4.1 → 2.5 | title 58/64 ok |
| 57 | `decide.verdict.titleNoAlreadyShortSameMonth` | This month is already {{already}} overspent either way. | This month already has {{already}} more out than in. | 9 | 8.2 → 3.7 | title 50/64 ok |
| 58 | `decide.verdict.titleNoAlreadyShortMonth` | This month is {{already}} overspent. This makes it {{short}}. | This makes this month {{short}} more out than in. | 9 | 3.2 → 1.0 | title 49/64 ok |
| 59 | `decide.verdict.titleNoMonthShort` | The month ends {{short}} overspent. | The month ends with {{short}} more out than in. | 9 | 5.2 → 1.0 | title 47/64 ok |
| 60 | `decide.verdict.titleCash` | Your cash cushion breaks by {{amount}}. | Cash would drop {{amount}} below your minimum. | 7 | 2.5 → 5.7 | title 45/64 ok |
| 61 | `decide.verdict.titleCashDip` | Your cash dips {{amount}} under your cushion before payday. | Before payday, cash would fall {{amount}} below your minimum. | 9 | 6.3 → 7.6 | title 60/64 ok |
| 62 | `decide.verdict.titleDsr` | Debt payments would reach {{pct}} of money in. | Debt payments would take {{pct}} of your income. | 8 | 3.8 → 3.8 | title 44/64 ok |
| 63 | `decide.verdict.titleOwe` | Unsecured debt would pass a year’s income. | Debt with nothing backing it would top a year of income. | 11 | 4.0 → 3.7 | title 56/64 ok |
| 64 | `decide.verdict.titleNoEmptyCash` | This would empty your cash. | This would use up all your cash. | 7 | 0.5 → -1.1 | title 32/64 ok |
| 65 | `decide.verdict.titleInvInvesting` | The month closes only if {{amount}} a month of investing pauses. | The month only balances if {{amount}} a month of investing stops. | 11 | 4.8 → 5.9 | title 64/64 ok |
| 66 | `decide.verdict.missing.no_full_month` | No full month is logged yet, so only a first read is possible. | No full month logged yet, so this is a first estimate. | 11 | 4.0 → 2.6 | title 54/64 ok |
| 67 | `decide.verdict.key.freeCaption` | Free a month | Spare each month | 3 | -2.6 → -2.6 |  |
| 68 | `decide.verdict.key.overspentCaption` | Overspent a month | More out than in each month | 6 | 5.2 → -1.4 |  |
| 69 | `decide.verdict.key.cushionCaption` | Cushion | Cash covers | 2 | 8.4 → 2.9 |  |
| 70 | `decide.verdict.key.monthlyCaption` | A month | This costs each month | 4 | -3.0 → -2.2 |  |
| 71 | `decide.verdict.key.none` | None | Nothing | 1 | -3.4 → 8.4 |  |
| 72 | `decide.warn.monthTitle` | Still overspent with saving paused | Still more out than in, even with saving stopped | 9 | 5.2 → 2.3 | title 48/64 ok |
| 73 | `decide.warn.monthTitleNoPause` | The month does not close | More goes out than comes in | 6 | -1.8 → -1.4 | title 27/64 ok |
| 74 | `decide.warn.monthBodyNoPause` | Every month would need {{short}} more than comes in. | Each month, {{short}} more would go out than comes in. | 10 | 3.7 → 1.3 |  |
| 75 | `decide.warn.monthAlready` | Your {{basis}} month is already {{already}} overspent before this purchase. Adding {{added}} takes the gap to {{gap}}. That gap is borrowed money covering ordinary bills. | Before this purchase, your {{basis}} month already has {{already}} more out than in. This adds {{added}}, so the gap becomes {{gap}}. A gap like this is covered by savings or by borrowing. | 32 | 8.0 → 5.2 |  |
| 76 | `decide.warn.cashTitle` | Cash cushion broken | Below your minimum cash | 4 | 5.2 → 6.6 | title 23/64 ok |
| 77 | `decide.warn.cashBody` | You protect {{cushion}} as a cushion. Paying {{day}} on the day leaves {{cashAfter}}. | Your minimum is {{cushion}}. Paying {{day}} on the day leaves {{cashAfter}}. | 11 | 4.2 → 4.8 |  |
| 78 | `decide.warn.dsrTitle` | Debt takes a large share of your income | Debt payments pass your limit | 5 | 0.8 → 2.9 | title 29/64 ok |
| 79 | `decide.warn.oweTitle` | Unsecured debt above a year’s income | Debt with nothing backing it, over a year’s income | 9 | 6.4 → 5.0 | title 50/64 ok |
| 80 | `decide.warn.invTitleBoth` | Saving and investing pause to close the month | Saving and investing would stop to balance the month | 9 | 3.8 → 5.0 | title 52/64 ok |
| 81 | `decide.depth.edge.tag` | On the edge | Close to a limit | 4 | -2.6 → 0.7 |  |
| 82 | `decide.fold.title.whatBreaks` | What breaks | Your limits | 2 | -3.0 → 2.9 |  |
| 83 | `decide.fold.preview.whatBreaks_one` | {{count}} line breaks | {{count}} limit passed | 3 | 1.3 → 5.2 | fold 14/44 ok |
| 84 | `decide.fold.preview.whatBreaks_other` | {{count}} lines break | {{count}} limits passed | 3 | 1.3 → 5.2 | fold 15/44 ok |
| 85 | `decide.fold.preview.edgeSuffix` |  · on the edge |  · close to a limit | 5 | -2.6 → 0.7 | fold 19/44 ok |
| 86 | `decide.fold.preview.nothingBreaks` | Nothing breaks | Within every limit | 3 | 2.9 → 13.1 | fold 18/44 ok |
| 87 | `decide.fold.preview.nothingBreaksEdge` | Nothing breaks · on the edge | Within every limit · close to one | 7 | 0.5 → 6.4 | fold 33/44 ok |
| 88 | `decide.fold.preview.noMoves` | No ledger moves | Nothing changes | 2 | 1.3 → 2.9 | fold 15/44 ok |
| 89 | `decide.fold.preview.landsWorse` | {{count}} worse | {{count}} get worse | 3 | 2.9 → 1.3 | fold 11/44 ok |
| 90 | `decide.fold.preview.setbacksOver50` | Runway over 50 years | Cash lasts over 50 years | 5 | 6.6 → 2.9 | fold 24/44 ok |
| 91 | `decide.fold.preview.setbacks_other` | Runway {{count}} months, {{less}} less because of this | Cash lasts {{count}} months, {{less}} fewer | 6 | 5.2 → 4.5 | fold 36/44 ok |
| 92 | `decide.section.ledgersTitle` | Where it lands | What it changes | 3 | -2.6 → -2.6 |  |
| 93 | `decide.section.ledgersSummary` | Five ledgers | Five areas | 2 | 2.9 → 2.9 |  |
| 94 | `decide.section.ledgersNote` | Five ledgers. A purchase never touches only one. | Income, spending, debt, cash and investing. A purchase rarely touches only one. | 12 | 3.7 → 6.4 |  |
| 95 | `decide.info.whatBreaks.term` | What breaks | Your limits | 2 | -3.0 → 2.9 |  |
| 96 | `decide.info.edge.body` | At least one line holds or misses by less than 5% of the line. A small change in the price, the rate or a monthly figure can flip the verdict. | At least one limit is met, or missed, by less than 5%. A small change in price, rate or monthly cost could change the answer. | 25 | 3.6 → 3.0 |  |
| 97 | `decide.info.netFreeCashFlow.term` | Net free cash flow | Your month | 2 | -2.2 → -3.0 |  |
| 98 | `decide.info.netFreeCashFlow.body` | What is left of a month once everything planned has been taken off: money in, minus spending, minus debt payments, minus what goes to saving, to investing and to pots. By default it is this month as it is expected to end: what is logged so far, plus pay and bills still due before month end; it can instead be worked out on your worst month or the average, as the line under it says, and checks use the same choice. A pot is money kept for a set amount on a set date. | The money a month has to spare after spending, debt payments, saving, investing and pots are taken off. It uses the kind of month picked under Check against. A pot is money kept for one cost, on a set date. | 40 | 11.2 → 4.7 |  |
| 99 | `decide.info.netFreeCashFlow.changes` | Every check starts from this figure. A purchase lowers it by its monthly cost, and only saving and investing can pause to cover a shortfall. | Every check starts here. A purchase lowers it by its monthly cost. Saving and investing are the only things a check can pause to make up a gap. | 28 | 6.7 → 3.6 |  |
| 100 | `decide.info.size.term` | How big this is | Where the money comes from | 5 | -2.2 → 0.5 |  |
| 101 | `decide.info.size.body` | How big the cash price is against your own money. Out of this month’s spare means it fits in what this month leaves after saving and investing; out of savings means cash still stays above your cushion. Needs spreading means paying it at once would take cash under your cushion. | Paid from this month’s spare: it fits in what the month has after saving and investing. Paid from savings: cash stays above your minimum. Too big to pay at once: paying in one go would take cash below your minimum. | 40 | 5.8 → 5.0 |  |
| 102 | `decide.info.size.changes` | Nothing in the verdict. Cooling-off appears only for purchases that need spreading. | Nothing in the answer. A 48-hour reminder is offered only for purchases too big to pay at once. | 18 | 6.4 → 5.0 |  |
| 103 | `decide.info.cushionMonths.term` | Cushion | Cash cover | 2 | 8.4 → 2.9 |  |
| 104 | `decide.info.cushionMonths.body` | How many months of your costs the cash left would cover, after this purchase and the bills due in the next 90 days. | How many months of your costs the cash you would still hold could pay for, after this purchase and the bills due in the next 90 days. | 27 | 7.7 → 8.5 |  |
| 105 | `decide.info.reserve.body` | The cash cushion no purchase may break, on the day or before the next payday. Left blank, it is a number of months of your costs: 3 when income is steady, 4.5 when it varies, 6 when it is volatile. | The least cash to keep, on the day or before the next payday. If left empty, the app uses 3 months of your costs when income is steady, 4.5 when it varies and 6 when it varies a lot. | 39 | 8.1 → 6.8 |  |
| 106 | `decide.info.pots.body` | A pot is money kept for a cost with a set amount and a date. Each month, what is still needed is spread over the whole months left, rounded up, and taken off net free cash flow. Money already in a pot is kept out of what a check can spend. | A pot is money kept for one cost, with a target amount and a date. Each month, what is still needed is divided by the months to go (rounded up) and taken off your spare money. Money already in a pot is kept out of what a check can use. | 50 | 4.7 → 4.8 |  |
| 107 | `decide.info.combined.body` | Your other open checks are counted as if they were bought too, so two purchases that each fit on their own are not both shown as fitting. | Your other open checks are counted as if you bought them too. Two purchases can each fit alone but not together; this shows that. | 24 | 8.5 → 3.8 |  |
| 108 | `decide.depth.combined.pill` | With other checks | Counts other open checks | 4 | 1.3 → 3.7 |  |
| 109 | `decide.pots.sub` | Money kept for a cost with a set amount and a date. What each pot needs a month comes off net free cash flow. | Money kept for one cost, with a target and a date. Each pot’s monthly amount comes off your spare money. | 20 | 1.9 → 3.1 |  |
| 110 | `decide.pots.empty` | No pots yet. A car service in March is one. | No pots yet. A pot could be for a car service in March. | 13 | -0.7 → -0.3 |  |
| 111 | `decide.pots.deleteConfirm.body` | Its set-aside stops coming off net free cash flow. Undo is available right after. | The monthly amount stops coming off your spare money. You can undo this right after. | 15 | 5.7 → 3.9 |  |
| 112 | `decide.home.monthDetails.title` | Net free cash flow | Your month, in detail | 4 | -2.2 → 0.7 |  |
| 113 | `decide.home.monthDetails.result` | Net free cash flow | To spare | 2 | -2.2 → -3.0 |  |
| 114 | `decide.decision.goName` | Go ahead | Record as bought | 3 | 2.9 → 1.3 |  |
| 115 | `decide.decision.passName` | Pass | Record as not buying | 4 | -3.4 → 3.7 |  |
| 116 | `decide.flow.commit.go` | Go ahead | Record as bought | 3 | 2.9 → 1.3 |  |
| 117 | `decide.flow.commit.pass` | Record as passed | Record as not buying | 4 | 1.3 → 3.7 |  |
| 118 | `decide.decision.goDescShort` | Logs it anyway. The record will show the month was {{amount}} overspent when you signed. | Records it anyway. The record notes the month had {{amount}} more out than in at the time. | 17 | 3.9 → 3.0 |  |
| 119 | `decide.toast.passed` | Passed. Nothing moved. | Saved as not buying. No money moved. | 7 | 0.7 → 0.9 |  |
| 120 | `decide.toast.written` | Written to your records | Saved to your records | 4 | 3.7 → 0.7 |  |
| 121 | `decide.flow.hint.impact` | Nothing here changes your balances. Step five is where anything gets written. | Nothing here changes your balances. Anything is recorded only at step 5. | 12 | 3.5 → 5.4 |  |
| 122 | `decide.home.noFigures.heading` | Nothing to judge against yet | Nothing to check against yet | 5 | 2.9 → 2.9 |  |
| 123 | `decide.home.noFigures.body` | Rough figures for what comes in and goes out, or an imported statement, give every check something to rest on. | Rough monthly figures, or an imported statement, give each check something to work from. | 14 | 8.7 → 7.6 |  |
| 124 | `decide.home.unavailable.title` | Not worked out yet | Can’t work this out yet | 5 | -2.2 → -1.8 |  |
| 125 | `decide.month.fewLine` | Fewer than 3 full months so far, so this uses your lowest month for money in and your highest for spending. | Fewer than 3 full months so far. This uses your lowest month of money in with your highest month of spending, so it can be tighter than any single month. | 30 | 7.8 → 5.2 |  |
| 126 | `decide.month.variableLine` | {{count}} months ranging {{worst}} to {{best}}. Checks are judged on {{basis}}, the choice below. | {{count}} months of income, from {{worst}} to {{best}}. Checks use {{basis}}, the choice below. | 14 | 4.0 → 4.0 |  |
| 127 | `decide.alt.footer` | The last figure is money kept: the cash you keep on the day plus the payment you never make, capped at what is genuinely spare — {{spareCash}} above your cushion and {{spareMonth}} a month. Each row is measured against buying as planned — money set aside, plus growth only if you add a rate, no tax or fees, and no guarantee. | Kept is the money you would keep: cash not spent on the day, plus payments you never make, up to what is really spare. Each row is compared with buying as planned. Growth counts only if you add a rate. Tax and fees are ignored. Nothing is guaranteed. | 48 | 11.5 → 2.7 |  |

### 7.1 Four rewrites in context

The Impact headline, before and after, for the case in `x05`:

Before: eyebrow "OUT OF THIS MONTH'S SPARE ⓘ", pill "Rough basis ⓘ", headline "It fits", line "It clears every line, with $219,776.24 still spare at month end." (and, three screens down, "Worst month: Doesn't fit right now").

After:

- Eyebrow: "PAID FROM THIS MONTH'S SPARE" (title of the ⓘ matches)
- Pill: "Rough estimate ⓘ", sheet: "Rough because your income varies a lot."
- Headline: "Fits this month. Not in your tightest month."
- Line: "On this month's expected figures, $219,776.24 to spare. In your tightest month, $5,883.85 more goes out than comes in."

Home card:

Before: "NET FREE CASH FLOW ⓘ / This month ▾ / $219,783.86 free / this month, after spending, debts and everything set aside".

After: "YOUR MONTH ⓘ / This month ▾ / $219,783.86 to spare / after spending, debts, saving and pots".

Commit step:

Before: "Go ahead / Wait and save / Pass".

After: "Record as bought / Wait and save / Record as not buying", with the same ⓘ ("What gets saved").

Sync banner:

Before: "22 changes couldn't save".

After: "22 changes are not saved yet. They stay on this phone until they are. Review".

---

## 8. Sources

Fetched and read in this audit:

- GOV.UK, [Use clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/): plain English mandatory; avoid jargon; explain specialist terms at first use; split sentences over 25 words; paragraphs of 5 sentences or fewer.
- W3C, [WCAG 2.2 Understanding SC 3.1.5 Reading Level](https://www.w3.org/WAI/WCAG22/Understanding/reading-level.html): lower secondary level (about 9 years of schooling) or a simpler alternative.
- Nielsen Norman Group, [How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/) (Nielsen, 1997): 79% always scan; concise, scannable and objective text gave 124% better usability.
- IES / NCES, [U.S. adults and PIAAC 2023](https://www.ies.ed.gov/learn/press-release/u-s-adults-score-par-international-average-literacy-skills-below-international-average-numeracy-and): 28% at or below literacy Level 1; 34% at or below numeracy Level 1.
- FCA, [Consumer understanding: good practice and areas for improvement](https://www.fca.org.uk/publications/good-and-poor-practice/consumer-understanding-good-practice-areas-improvement) (13 March 2026; read via search summary): test communications before and after change, including with vulnerable customers; plain language, layered content, risks given equal prominence. Binding rules: PRIN 2A.5, "clear, fair and not misleading".
- digital.gov, [Plain language guide](https://digital.gov/guides/plain-language) (headings only: principles, writing, design, testing); CFPB, [Plain Writing Act compliance report 2025](https://files.consumerfinance.gov/f/documents/cfpb_plain-writing-act-compliance-report_2025-12.pdf) (search summary only; the "Know Before You Owe" testing history is about 2011).

Read via search results (summaries, not the full page):

- TPGi, [Money Talks! Formatting Currency in Web Content](https://www.tpgi.com/money-talks-formatting-currency-in-web-content/): no currency format is announced as money identically by JAWS, NVDA, Narrator, TalkBack and VoiceOver. A spelled-out aria-label is a common workaround (not tested there).
- YNAB, [Handling overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi.md): "overspending" means spending more than the category had; cash and credit overspending differ.
- Monzo, [Writing principles / tone of voice](https://monzo.com/tone-of-voice/): "straightforward kindness"; everyday words; active voice; sincere apology.
- Hebrew University / Management Science field study with about 39,000 Mint users, summarised at [AlphaGalileo](https://www.alphagalileo.org/en-gb/Item-Display/ItemId/258532): loss-framed simple alerts cut overdrafts about 9%.
- Somerset Council playbook on reading age ([link](https://playbook.somerset.gov.uk/digital-inclusion-and-accessibility/creating-accessible-documents/document-language-and-reading-age)): attributes "reading age 9" to GOV.UK content design; I could not confirm that on GOV.UK's own page.
- Torrey Podmajersky, *Strategic Writing for UX* (O'Reilly, 2019) and Kinneret Yifrah, *Microcopy: The Complete Guide*: consulted as described in book listings ([CareerFoundry list](https://careerfoundry.com/blog/ux-design/ux-writing-books)). Their practices that shaped this audit: voice and terminology charts, one term per concept, and testing copy. I did not read the books for this audit.

Cited from background knowledge (not fetched, treat as unverified here):

- Flesch-Kincaid grade-level and Reading Ease formulas (Kincaid et al., 1975; Flesch, 1948).
- Kahneman and Tversky, prospect theory and framing (1979, 1981).

Not found: Wise's tone-of-voice document, Starling's, Mailchimp's or Shopify's content style guides were not fetched for this audit; no claim above relies on them.

Project files used: `src/i18n/locales/en.ts`, `src/features/decide/copy/*`, `src/i18n/__tests__/*` (BANNED, REASSURING, IMPERATIVE_LEAD, INSTRUCTION_LEAD, d106Wording, decideNamePause), `src/engine/decide/confidence.ts`, `src/engine/money/formatAmount.ts`, `.planning/phases/05-decide-ui/05-CONTEXT.md` (D-105 to D-107).
