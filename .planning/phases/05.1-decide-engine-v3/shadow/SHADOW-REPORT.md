# Shadow report: today's engine against v3 (05.1-28)

## For review (05.1-32, refreshed 2026-10-26 after the I13 and candidate-ordering fixes; answers unchanged)

**Totals:** 780 comparisons. 430 same answer, 212 changed, 138 unsupported by the old engine (134 of them deposit-with-instalment, so plan purchases are thinly covered). **39 new fits**: cash_path_spread 19, unspent_confirmed 13, low_month_clause 3, other 4. Every new fit has a drafted reason in `approved-changes.json`; none are approved yet.

**Cause groups (changed answers):**
- `cash_path_spread` (100): the old engine raised its own cash/cash_dip warning and v3's 90-day cash path raises none, even on tiny purchases (for example 1,011 against a 316,487 month left).
- `needs_input_rules` (69): v3 asks for unspent money or up-to-date records where the old engine answered without them (66 of these were "no").
- `unspent_confirmed` (13): v3 counts unspent money the person confirmed (D-22).
- `emergency_locked` (11): v3 keeps the emergency fund out of reach (D-09); the old engine counted it toward the cushion.
- `erest_not_zero_spend` (6): v3 carries the rest of the month's everyday spending instead of treating it as zero.
- `median_ignores_outlier` (5): the typical month is a median, so one unusual month no longer moves it.
- `low_month_clause` (3): the low-month variant applies.
- `typical_month_short` (1): the typical month runs short.
- `other` (4): no named rule matched; the drafted reasons say so.

**Back-test I28** (seed 0x0128, 957 origin months; false fits / fits):

| Family | v3 | Old engine | Held-out month below the low month |
|---|---|---|---|
| salaried | 76/356 (21.3%) | 363/723 (50.2%) | 51/150 |
| gig | 225/746 (30.2%) | 20/35 (57.1%) | 43/150 |
| **seasonal** | **342/825 (41.5%)** | 19/80 (23.8%) | 12/165 |
| partial logger | 86/395 (21.8%) | 399/762 (52.4%) | 58/153 |
| couple | 42/532 (7.9%) | 100/825 (12.1%) | 50/165 |
| new user | 14/52 (26.9%) | 45/92 (48.9%) | 13/20 |
| large month | 47/304 (15.5%) | 248/470 (52.8%) | 42/154 |
| **overall** | **832/3210 (25.9%)** | 1194/2987 (40.0%) | 269/957 (28.1%, band 10–30%) |

The gate passes on the overall rate. Seasonal earners are worse under v3 than under the old engine, although the old engine says "fits" far less often there (80 fits against 825). The generator states gig and seasonal pay as a lean-month series at 60% and 62% of mean income; at 80% the low-month band failed (41.6%).

**Fixture corrections made in 05.1-25** (each has a CORRECTION line in its `working` field):
1. #08 Maya: `lowLeft` 65,000 → 75,000. The low month is judged at today's steady pay (300,000), so the second-lowest leftover is 75,000 (August); the old figure used each month's real pay.
2. #12 Tia: `everydayOverride: 60000` added. As written she dips below zero again before the Nov 28 pay, so the engine correctly says `not_covered`. With the override the answer is `payday`, ready by 2026-10-28. The as-written Tia is kept as a test asserting `not_covered`.
3. d18-return-refund: `unspentAfter` 240,000 → 235,000. The rolled unspent is 240,000; the check's own 5,000 leaves 235,000, the same subtraction as #02.
4. #14 Jordan, in `golden.test.ts` only: run with a balance of 300,000, because 100,000 cannot carry the rest of the month's spending to the Nov 1 pay.
5. #22 Dog, in `golden.test.ts` only: `food` is not a library question, so the test uses an own item type `pet` with one monthly own question `food`.

**Engine fixes since 05.1-28:**
- The judge no longer says "ready on payday" when the funding ladder would still fail by then (I13).
- Recurring candidates now come out in a stable order (I16). This affects setup offers only, not verdicts.

---


Synthetic data only (D-17): 300 seeded histories, the 9 personas, the 22 scenarios and the D-18 extras. Old engine on the `month` basis.

| Figure | Count |
|---|---|
| Comparisons | 780 |
| Same answer | 430 |
| Changed answer | 212 |
| New fits (v3 fits_month or fits_unspent, old did not fit) | 39 |
| Unsupported by the old engine (not counted as agreement or change) | 138 |
| Owner review | not yet reviewed |

## Changes by cause

### needs_input_rules (69)

v3 asks for a figure (unspent money or up-to-date records) where the old engine answered without it (UP 5.4). Accepted: no.

| Old -> v3 | Count |
|---|---|
| no -> needs_input | 66 |
| fits -> needs_input | 2 |
| adjust -> needs_input | 1 |

Examples:
- `generated:gen-001:1` no -> needs_input: price 2000020, dayOne 2000020, monthLeft -924011, erest 449992, e 449992, unspent 606186, emergency 0
- `generated:gen-005:0` no -> needs_input: price 1378884, dayOne 1489195, monthLeft -618371, erest 433599, e 449927, unspent -, emergency 2
- `generated:gen-005:2` no -> needs_input: price 2951878, dayOne 2951878, monthLeft -618371, erest 433599, e 449927, unspent -, emergency 2

### unspent_confirmed (13)

v3 counts unspent money the person confirmed; the old engine had no such figure (D-22). Accepted: no.

| Old -> v3 | Count |
|---|---|
| no -> fits_unspent | 8 |
| adjust -> fits_unspent | 5 |

Examples:
- `generated:gen-052:2` no -> fits_unspent: price 353530, dayOne 381812, monthLeft -151339, erest 357450, e 385880, unspent 485076, emergency 65097
- `generated:gen-078:2` no -> fits_unspent: price 1002, dayOne 1082, monthLeft -341042, erest 327990, e 342219, unspent 57649, emergency 1295781
- `generated:gen-123:0` adjust -> fits_unspent: price 354852, dayOne 383240, monthLeft 283915, erest 323586, e 347652, unspent 724072, emergency 1331017

### emergency_locked (11)

v3 keeps the emergency fund out of reach (D-09); the old engine counted it toward the cushion. Accepted: no.

| Old -> v3 | Count |
|---|---|
| adjust -> not_yet | 11 |

Examples:
- `generated:gen-047:1` adjust -> not_yet: price 3428759, dayOne 428595, monthLeft 427347, erest 355324, e 386905, unspent 177811, emergency 1126316
- `generated:gen-068:0` adjust -> not_yet: price 565481, dayOne 565481, monthLeft 266649, erest 310025, e 333052, unspent 472680, emergency 980061
- `generated:gen-101:2` adjust -> not_yet: price 1361919, dayOne 249843, monthLeft 209744, erest 385862, e 407560, unspent 46030, emergency 1746773

### erest_not_zero_spend (6)

v3 carries the rest of the month's everyday spending (Erest) instead of treating it as zero. Accepted: no.

| Old -> v3 | Count |
|---|---|
| adjust -> not_yet | 5 |
| fits -> monthly_short | 1 |

Examples:
- `generated:gen-125:2` adjust -> not_yet: price 1746390, dayOne 0, monthLeft -24619, erest 369082, e 390914, unspent 18488, emergency -
- `generated:gen-126:0` fits -> monthly_short: price 2418208, dayOne 0, monthLeft -113465, erest 316324, e 340004, unspent 281470, emergency 1767693
- `generated:gen-163:0` adjust -> not_yet: price 2768486, dayOne 0, monthLeft -52045, erest 534997, e 534997, unspent 493331, emergency 3

### cash_path_spread (100)

v3 judges the cash path with the real pay and bill dates; the old engine raised its own cash warnings. Accepted: no.

| Old -> v3 | Count |
|---|---|
| adjust -> fits_month | 17 |
| missing -> not_yet | 64 |
| adjust -> not_yet | 6 |
| no -> monthly_short | 11 |
| no -> fits_month | 2 |

Examples:
- `generated:gen-000:0` adjust -> fits_month: price 1011, dayOne 0, monthLeft 316487, erest 271285, e 292799, unspent -, emergency 1235076
- `generated:gen-004:1` missing -> not_yet: price 685387, dayOne 76155, monthLeft 130184, erest 235889, e 235889, unspent 800000, emergency 1889297
- `generated:gen-005:1` missing -> not_yet: price 240048, dayOne 0, monthLeft -618371, erest 433599, e 449927, unspent -, emergency 2

### low_month_clause (3)

The second-lowest-month clause decided the answer (variant low_month). Accepted: no.

| Old -> v3 | Count |
|---|---|
| missing -> fits_month | 3 |

Examples:
- `generated:gen-038:1` missing -> fits_month: price 3075614, dayOne 174825, monthLeft 355844, erest 198831, e 198831, unspent 679179, emergency 1471378
- `generated:gen-121:2` missing -> fits_month: price 1022, dayOne 0, monthLeft 47135, erest 381090, e 411230, unspent 526238, emergency 10
- `generated:gen-196:2` missing -> fits_month: price 2948670, dayOne 128204, monthLeft 209645, erest 351109, e 375633, unspent 617343, emergency 1131118

### median_ignores_outlier (5)

v3 uses the median everyday spend, so a one-off heavy month no longer sets the typical figure. Accepted: no.

| Old -> v3 | Count |
|---|---|
| missing -> monthly_short | 4 |
| fits -> monthly_short | 1 |

Examples:
- `generated:gen-018:3` missing -> monthly_short: price 1008956, dayOne 0, monthLeft -268438, erest 295591, e 295591, unspent 12, emergency 1951166
- `generated:gen-079:3` missing -> monthly_short: price 3959917, dayOne 305480, monthLeft 17730, erest 214545, e 235875, unspent 799986, emergency 19
- `generated:gen-252:1` missing -> monthly_short: price 412234, dayOne 35836, monthLeft -645342, erest 108737, e 120387, unspent 259212, emergency 1999993

### typical_month_short (1)

Too few full months for a typical month; v3 says so and answers from this month only. Accepted: no.

| Old -> v3 | Count |
|---|---|
| missing -> monthly_short | 1 |

Examples:
- `generated:gen-243:3` missing -> monthly_short: price 3140177, dayOne 300834, monthLeft -353312, erest 303906, e 323989, unspent 573289, emergency 1318376

### other (4)

No named rule matched; each entry needs a direct look. Accepted: no.

| Old -> v3 | Count |
|---|---|
| missing -> fits_month | 2 |
| adjust -> fits_month | 2 |

Examples:
- `generated:gen-016:2` missing -> fits_month: price 4424441, dayOne 0, monthLeft 171724, erest 296689, e 313907, unspent 19, emergency 19
- `generated:gen-239:2` missing -> fits_month: price 1366969, dayOne 151886, monthLeft 545633, erest 151943, e 167235, unspent 567165, emergency -
- `scenario:21:0` adjust -> fits_month: price 160000, dayOne 80000, monthLeft 120000, erest 55000, e 60000, unspent 100000, emergency 150000

## New fits

Every case where v3 says fits and the old engine did not. Each needs the owner's approval before switch-on (D-14).

| Key | Cause | Old -> v3 | Approved | Reason |
|---|---|---|---|---|
| `generated:gen-000:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 316,487 against 0 due on day one of a 1,011 purchase. |
| `generated:gen-016:1` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 171,724 against 1,085 due on day one of a 1,005 purchase. |
| `generated:gen-016:2` | other | missing -> fits_month | no | Old engine said missing; v3 says fits_month. v3 finds month left 171,724 covering the 0 due on day one of a 4,424,441 purchase, typical month left 171,724, and raises nothing else. The change was not tied to one named rule; the old engine's answer for this history was missing, which the owner should look at directly. |
| `generated:gen-038:1` | low_month_clause | missing -> fits_month | no | Old engine said missing; v3 says fits_month. v3's low-month figure (second-lowest month) leaves the plan affordable; month left 355,844 covers the 174,825 due on day one of a 3,075,614 purchase. Today's engine had no history to judge it (missing). |
| `generated:gen-052:2` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 485,076 unspent money the person confirmed, which covers the 381,812 due on day one of a 353,530 purchase. Today's engine judged only the month's free figure (-151,339) and has no confirmed unspent figure. |
| `generated:gen-078:2` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 57,649 unspent money the person confirmed, which covers the 1,082 due on day one of a 1,002 purchase. Today's engine judged only the month's free figure (-341,042) and has no confirmed unspent figure. |
| `generated:gen-121:2` | low_month_clause | missing -> fits_month | no | Old engine said missing; v3 says fits_month. v3's low-month figure (second-lowest month) leaves the plan affordable; month left 47,135 covers the 0 due on day one of a 1,022 purchase. Today's engine had no history to judge it (missing). |
| `generated:gen-123:0` | unspent_confirmed | adjust -> fits_unspent | no | Old engine said adjust; v3 says fits_unspent. v3 counts the 724,072 unspent money the person confirmed, which covers the 383,240 due on day one of a 354,852 purchase. Today's engine judged only the month's free figure (283,915) and has no confirmed unspent figure. |
| `generated:gen-131:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 155,822 against 5,065 due on day one of a 5,281 purchase. |
| `generated:gen-137:0` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 513,041 unspent money the person confirmed, which covers the 83,923 due on day one of a 83,923 purchase. Today's engine judged only the month's free figure (-545,520) and has no confirmed unspent figure. |
| `generated:gen-137:3` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 513,041 unspent money the person confirmed, which covers the 92,029 due on day one of a 92,029 purchase. Today's engine judged only the month's free figure (-545,520) and has no confirmed unspent figure. |
| `generated:gen-139:0` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 693,269 unspent money the person confirmed, which covers the 5,000 due on day one of a 1,007 purchase. Today's engine judged only the month's free figure (-736,808) and has no confirmed unspent figure. |
| `generated:gen-154:0` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 353,358 unspent money the person confirmed, which covers the 1,019 due on day one of a 1,019 purchase. Today's engine judged only the month's free figure (-596,186) and has no confirmed unspent figure. |
| `generated:gen-187:1` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 323,749 against 0 due on day one of a 18,801 purchase. |
| `generated:gen-196:2` | low_month_clause | missing -> fits_month | no | Old engine said missing; v3 says fits_month. v3's low-month figure (second-lowest month) leaves the plan affordable; month left 209,645 covers the 128,204 due on day one of a 2,948,670 purchase. Today's engine had no history to judge it (missing). |
| `generated:gen-220:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash,cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 466,278 against 0 due on day one of a 227,653 purchase. |
| `generated:gen-239:1` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 545,633 against 122,540 due on day one of a 2,083,179 purchase. |
| `generated:gen-239:2` | other | missing -> fits_month | no | Old engine said missing; v3 says fits_month. v3 finds month left 545,633 covering the 151,886 due on day one of a 1,366,969 purchase, typical month left 545,633, and raises nothing else. The change was not tied to one named rule; the old engine's answer for this history was missing, which the owner should look at directly. |
| `generated:gen-239:3` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash,cash_dip,dsr); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 545,633 against 213,397 due on day one of a 4,807,894 purchase. |
| `generated:gen-261:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 50,894 against 1,096 due on day one of a 1,015 purchase. |
| `generated:gen-261:1` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 50,894 against 1,004 due on day one of a 1,004 purchase. |
| `generated:gen-273:2` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash,cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 915,572 against 0 due on day one of a 836,623 purchase. |
| `generated:gen-274:0` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 386,808 unspent money the person confirmed, which covers the 1,102 due on day one of a 1,020 purchase. Today's engine judged only the month's free figure (-473,375) and has no confirmed unspent figure. |
| `persona:maya:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 80,000 against 100 due on day one of a 100 purchase. |
| `persona:leo:0` | unspent_confirmed | adjust -> fits_unspent | no | Old engine said adjust; v3 says fits_unspent. v3 counts the 10,000 unspent money the person confirmed, which covers the 100 due on day one of a 100 purchase. Today's engine judged only the month's free figure (-19,484) and has no confirmed unspent figure. |
| `persona:tia:0` | cash_path_spread | no -> fits_month | no | Old engine said no; v3 says fits_month. Today's engine raised its own cash warning (cash,cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 23,613 against 100 due on day one of a 100 purchase. |
| `persona:dana:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 83,710 against 100 due on day one of a 100 purchase. |
| `persona:kim:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 90,000 against 100 due on day one of a 100 purchase. |
| `persona:priya:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 120,000 against 100 due on day one of a 100 purchase. |
| `scenario:02:0` | unspent_confirmed | adjust -> fits_unspent | no | Old engine said adjust; v3 says fits_unspent. v3 counts the 240,000 unspent money the person confirmed, which covers the 120,000 due on day one of a 120,000 purchase. Today's engine judged only the month's free figure (42,500) and has no confirmed unspent figure. |
| `scenario:04:0` | unspent_confirmed | adjust -> fits_unspent | no | Old engine said adjust; v3 says fits_unspent. v3 counts the 240,000 unspent money the person confirmed, which covers the 500 due on day one of a 500 purchase. Today's engine judged only the month's free figure (-53,226) and has no confirmed unspent figure. |
| `scenario:08:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 80,000 against 6,000 due on day one of a 72,000 purchase. |
| `scenario:14:0` | cash_path_spread | no -> fits_month | no | Old engine said no; v3 says fits_month. Today's engine raised its own cash warning (cash,cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 40,000 against 15,000 due on day one of a 15,000 purchase. |
| `scenario:17:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash,dsr); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 83,710 against 0 due on day one of a 2,400,000 purchase. |
| `scenario:18:0` | unspent_confirmed | adjust -> fits_unspent | no | Old engine said adjust; v3 says fits_unspent. v3 counts the 350,000 unspent money the person confirmed, which covers the 120,000 due on day one of a 120,000 purchase. Today's engine judged only the month's free figure (90,000) and has no confirmed unspent figure. |
| `scenario:21:0` | other | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. v3 finds month left 120,000 covering the 80,000 due on day one of a 160,000 purchase, typical month left 120,000, and raises nothing else. The change was not tied to one named rule; the old engine's answer for this history was adjust, which the owner should look at directly. |
| `d18:d18-return-refund:0` | cash_path_spread | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. Today's engine raised its own cash warning (cash_dip); v3's cash path raises none and no payday or low-balance variant applies. v3's month left is 42,500 against 5,000 due on day one of a 5,000 purchase. |
| `d18:d18-shared-50-50:0` | other | adjust -> fits_month | no | Old engine said adjust; v3 says fits_month. v3 finds month left 120,000 covering the 50,000 due on day one of a 100,000 purchase, typical month left 120,000, and raises nothing else. The change was not tied to one named rule; the old engine's answer for this history was adjust, which the owner should look at directly. |
| `d18:d18-job-loss:0` | unspent_confirmed | no -> fits_unspent | no | Old engine said no; v3 says fits_unspent. v3 counts the 240,000 unspent money the person confirmed, which covers the 15,000 due on day one of a 15,000 purchase. Today's engine judged only the month's free figure (-357,500) and has no confirmed unspent figure. |

## Unsupported by the old engine

| Reason | Count |
|---|---|
| deposit_with_instalment_not_in_v1 | 134 |
| extras_not_in_v1 | 1 |
| cadence_or_start_not_in_v1 | 2 |
| foreign_currency_not_in_v1 | 1 |

Keys:
`generated:gen-001:0`, `generated:gen-001:2`, `generated:gen-003:0`, `generated:gen-011:0`, `generated:gen-011:3`, `generated:gen-019:0`, `generated:gen-019:1`, `generated:gen-023:2`, `generated:gen-024:1`, `generated:gen-030:0`, `generated:gen-031:0`, `generated:gen-034:1`, `generated:gen-035:0`, `generated:gen-037:1`, `generated:gen-038:2`, `generated:gen-039:0`, `generated:gen-047:2`, `generated:gen-048:0`, `generated:gen-048:1`, `generated:gen-050:0`, `generated:gen-051:0`, `generated:gen-053:1`, `generated:gen-055:1`, `generated:gen-065:0`, `generated:gen-069:0`, `generated:gen-070:0`, `generated:gen-071:0`, `generated:gen-081:0`, `generated:gen-081:2`, `generated:gen-087:1`, `generated:gen-090:2`, `generated:gen-093:1`, `generated:gen-095:2`, `generated:gen-096:0`, `generated:gen-105:1`, `generated:gen-106:1`, `generated:gen-107:0`, `generated:gen-112:0`, `generated:gen-113:3`, `generated:gen-115:2`, `generated:gen-117:3`, `generated:gen-120:0`, `generated:gen-120:2`, `generated:gen-123:2`, `generated:gen-124:1`, `generated:gen-128:1`, `generated:gen-134:1`, `generated:gen-137:1`, `generated:gen-144:2`, `generated:gen-145:0`, `generated:gen-148:0`, `generated:gen-150:1`, `generated:gen-150:2`, `generated:gen-152:1`, `generated:gen-152:2`, `generated:gen-153:0`, `generated:gen-156:0`, `generated:gen-158:1`, `generated:gen-164:2`, `generated:gen-164:3`, `generated:gen-165:0`, `generated:gen-166:1`, `generated:gen-169:0`, `generated:gen-170:0`, `generated:gen-170:2`, `generated:gen-171:0`, `generated:gen-171:2`, `generated:gen-172:1`, `generated:gen-172:2`, `generated:gen-174:3`, `generated:gen-175:2`, `generated:gen-175:3`, `generated:gen-177:1`, `generated:gen-178:0`, `generated:gen-182:1`, `generated:gen-183:0`, `generated:gen-185:0`, `generated:gen-188:0`, `generated:gen-189:0`, `generated:gen-191:2`, `generated:gen-191:3`, `generated:gen-194:0`, `generated:gen-197:0`, `generated:gen-197:2`, `generated:gen-198:0`, `generated:gen-199:1`, `generated:gen-203:0`, `generated:gen-205:0`, `generated:gen-207:0`, `generated:gen-211:0`, `generated:gen-211:3`, `generated:gen-212:2`, `generated:gen-215:3`, `generated:gen-219:0`, `generated:gen-222:0`, `generated:gen-222:2`, `generated:gen-222:3`, `generated:gen-223:0`, `generated:gen-226:1`, `generated:gen-230:1`, `generated:gen-231:2`, `generated:gen-233:1`, `generated:gen-233:3`, `generated:gen-235:0`, `generated:gen-236:0`, `generated:gen-236:1`, `generated:gen-237:1`, `generated:gen-238:1`, `generated:gen-238:2`, `generated:gen-241:0`, `generated:gen-242:1`, `generated:gen-243:1`, `generated:gen-244:0`, `generated:gen-249:2`, `generated:gen-251:3`, `generated:gen-258:0`, `generated:gen-258:1`, `generated:gen-259:3`, `generated:gen-266:0`, `generated:gen-267:1`, `generated:gen-272:1`, `generated:gen-272:2`, `generated:gen-273:0`, `generated:gen-273:3`, `generated:gen-274:1`, `generated:gen-274:3`, `generated:gen-277:0`, `generated:gen-277:1`, `generated:gen-277:2`, `generated:gen-280:2`, `generated:gen-281:2`, `generated:gen-293:1`, `generated:gen-295:3`, `generated:gen-299:1`, `scenario:22:0`, `d18:d18-deferred-6-then-24:0`, `d18:d18-deferred-unanswered:0`, `d18:d18-foreign:0`
