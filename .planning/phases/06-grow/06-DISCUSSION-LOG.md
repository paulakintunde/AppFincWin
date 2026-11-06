# Phase 6: Grow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 6-Grow
**Areas discussed:** Start now vs shared model (05.5), Safety net move to Grow (with locked goals), Investments depth, Debts payoff and contributions, Calculators

---

## Start now vs shared model (05.5)

| Option | Description | Selected |
|--------|-------------|----------|
| Grow builds its plugs first | First wave writes the safety net, goal and debt connection points to 05.5's design with contract tests; rest of 05.5 alongside | ✓ |
| Grow on its own, wire later | Build tables and screens now; connect Decide in 05.5 or 08.1 | |
| Do 05.5 first | Keep the fix plan's order | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, live in this phase | Grow feeds Decide's answers as soon as it ships | ✓ |
| Grow first, link in 08.1 | Decide keeps its own settings until the rebuild | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ship in slices | Goals and safety net, then debts, then investments | |
| All at once | One release when all are done | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| The clickable prototype | G01..G12 become the UI contract via /gsd-ui-phase | ✓ |
| Fresh UI design phase | New design round | |

**Notes:** Owner wants Grow to start now in parallel with Decide going live; every day costs money.

---

## Safety net move to Grow (with locked goals)

Owner added in the area list: "Calculators, locking savings goals, using total balance in savings goal as safety net if it makes sense. If a goal is 500 and 300 is in now, 300 will be added to safe as goal grows."

| Option | Description | Selected |
|--------|-------------|----------|
| Protect what's saved | Saved amount in a locked goal is never spent; grows as the goal fills | ✓ |
| Protect the target | Full target kept out | |
| Only the safety net is protected | Goals never protected | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep them separate | Safety net = one flagged goal; locked goals shown separately | ✓ |
| Count locked goals in the net | Net = flagged goal + locked goals | |

| Option | Description | Selected |
|--------|-------------|----------|
| Copy, then confirm | Current figure copied into the flagged goal; "We moved your safety net here" confirm | ✓ |
| Ask them to set it up again | Start Grow empty | |

| Option | Description | Selected |
|--------|-------------|----------|
| Allow, with a plain warning | Withdrawals allowed; sheet says what changes in Decide | ✓ |
| Unlock first | Two-step withdrawal | |

---

## Investments depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full lots, simple by default | Lots built; holding starts as name, paid, value | ✓ |
| Holdings only now | Lots later | |

| Option | Description | Selected |
|--------|-------------|----------|
| Generic types | Brokerage, retirement, pension, crypto, other | ✓ |
| Region-specific wrappers | 401(k), ISA, TFSA, RRSP | |

| Option | Description | Selected |
|--------|-------------|----------|
| Never spent, shown as context | Decide never spends investments | ✓ |
| Counted as backup | Mention selling as last resort | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gentle reminder | "Update value?" after 30 days | ✓ |
| No reminders | As-of date only | |

---

## Debts, payoff and contributions

| Option | Description | Selected |
|--------|-------------|----------|
| Side by side, user picks | Highest rate first / Smallest balance first with date, interest, extra payment | ✓ |
| One shown, other on tap | | |

| Option | Description | Selected |
|--------|-------------|----------|
| A repeating transfer in Activity | Counted once, visible in records | ✓ |
| Grow-only schedule | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Paid in full, or carried | Payoff plan only for carried balances | ✓ |
| Treat every card as a debt | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Close loan, record sale | One save records sale in, final payment out, debt paid off | ✓ |
| Just mark paid | | |

---

## Calculators

| Option | Description | Selected |
|--------|-------------|----------|
| Goal: how long / how much | On each goal | ✓ |
| Debt: extra payment effect | On debts | ✓ |
| Growth: what it could become | Illustration, not a forecast | ✓ |
| A separate Calculators page | New capability | ✓ (deferred to Phase 06.1) |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one tap to make it real | "Make this the plan" after confirm | ✓ |
| No, explore only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| New phase 06.1 after Grow | Standalone page reusing Grow's calculators | ✓ |
| Roadmap backlog | | |
| Fold into Phase 6 | | |

## Claude's Discretion

- Empty states, Grow first run, sequencing of the setup steps moved from Decide.
- Table and module structure within engine purity and money rules.
- Feature-level gating until Phase 9 (show everything to testers).

## Deferred Ideas

- Separate Calculators page (Phase 06.1).
- Region-specific investment wrappers.
- Live market prices (out of v1).
