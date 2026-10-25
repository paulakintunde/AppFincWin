import fc from "fast-check";
import { currencyCode, minorUnits } from "../../money/types";
import { occurrencesBetween } from "../../recurring/schedule";
import { prepareContext } from "../assess";
import { expectedMonth, expectedMonthMoney } from "../expectedMonth";
import { SOLE_SHARE } from "../share";
import type { DecideSnapshot, RecordLine, SpendingShare } from "../types";
import { bill, fullMonth, income, line, snapshotOf } from "./helpers/fixtures";

const SOLE: SpendingShare = { byDefault: SOLE_SHARE, byCategory: [] };
const mu = minorUnits;

type LineIn = Parameters<typeof line>[0];

/** A snapshot whose only record is October 2026, as of the 10th. */
/** The same with a full September behind it, so prepareContext has a basis. */
function octWithHistory(
  lines: readonly RecordLine[],
  over: Partial<DecideSnapshot> = {},
): DecideSnapshot {
  const s = oct(lines, over);
  return {
    ...s,
    months: [fullMonth("2026-09", 600_000, 300_000), ...s.months],
  };
}
function oct(
  lines: readonly RecordLine[],
  over: Partial<DecideSnapshot> = {},
): DecideSnapshot {
  return snapshotOf({
    asOf: "2026-10-10",
    months: [{ month: "2026-10", full: false, lines }],
    ...over,
  });
}
const out = (p: Omit<LineIn, "direction">): RecordLine =>
  line({ ...p, direction: "out" });
const inn = (p: Omit<LineIn, "direction">): RecordLine =>
  line({ ...p, direction: "in" });

const RENT = bill({
  seriesId: "rent",
  freq: "monthly",
  anchorDate: "2026-01-01",
  latestAmount: 100_000,
});
const POWER = bill({
  seriesId: "power",
  freq: "monthly",
  anchorDate: "2026-01-28",
  latestAmount: 20_000,
});
const PAY = income({
  seriesId: "pay",
  freq: "monthly",
  anchorDate: "2026-01-25",
  latestAmount: 500_000,
});

describe("expectedMonth (D-106, D-107)", () => {
  it("D-107 expectedMonthMoney equals the income and spending of expectedMonth for the same snapshot", () => {
    const s = octWithHistory(
      [
        out({ id: "a", date: "2026-10-02", amount: 7_000 }),
        inn({ id: "b", date: "2026-10-03", amount: 9_000 }),
      ],
      {
        bills: [POWER],
        incomeSeries: [PAY],
        monthlySaving: mu(1_000),
      },
    );
    const r = prepareContext(s);
    if (!r.ok) throw new Error("context");
    const wrapped = expectedMonth(r.context);
    const money = expectedMonthMoney(s, r.context.spendingShare);
    expect(wrapped.income).toBe(money.income);
    expect(wrapped.spending).toBe(money.spending);
    expect(wrapped.stillDue).toEqual(money.stillDue);
    expect(wrapped.month).toBe("2026-10");
  });

  it("D-106 early month: pay still due counts", () => {
    const s = oct([], {
      asOf: "2026-10-03",
      incomeSeries: [{ ...PAY, lastPaidDate: "2026-09-25" }],
    });
    const m = expectedMonthMoney(s, SOLE);
    expect(m.income).toBe(500_000);
    expect(m.stillDue.income).toBe(500_000);
  });

  it("D-106 a series already paid this month is not counted twice", () => {
    const s = oct(
      [out({ id: "r", date: "2026-10-01", amount: 100_000, seriesId: "rent" })],
      {
        bills: [{ ...RENT, lastPaidDate: "2026-10-01" }],
      },
    );
    const m = expectedMonthMoney(s, SOLE);
    expect(m.spending).toBe(100_000);
    expect(m.stillDue.spending).toBe(0);
  });

  it("D-106 a pending row for a series occurrence is not also added from the schedule", () => {
    const s = oct(
      [
        out({
          id: "p",
          date: "2026-10-28",
          amount: 20_000,
          seriesId: "power",
          status: "pending",
        }),
      ],
      {
        bills: [{ ...POWER, lastPaidDate: "2026-09-28" }],
      },
    );
    const m = expectedMonthMoney(s, SOLE);
    expect(m.spending).toBe(20_000);
    expect(m.stillDue.spending).toBe(0);
  });

  it("D-106 an edited pending date still counts once", () => {
    const monthly = oct(
      [
        out({
          id: "p",
          date: "2026-10-30",
          amount: 20_000,
          seriesId: "power",
          status: "pending",
        }),
      ],
      {
        bills: [{ ...POWER, lastPaidDate: "2026-09-28" }],
      },
    );
    expect(expectedMonthMoney(monthly, SOLE).spending).toBe(20_000);

    // weekly pay, first payday 2 Oct; the row for the 16th was moved two days to the 18th
    const weekly = income({
      seriesId: "wk",
      freq: "weekly",
      anchorDate: "2026-10-02",
      latestAmount: 1_000,
    });
    const s = oct(
      [
        inn({ id: "w1", date: "2026-10-02", amount: 1_000, seriesId: "wk" }),
        inn({ id: "w2", date: "2026-10-09", amount: 1_000, seriesId: "wk" }),
        inn({
          id: "w3",
          date: "2026-10-18",
          amount: 1_000,
          seriesId: "wk",
          status: "pending",
        }),
      ],
      { incomeSeries: [{ ...weekly, lastPaidDate: "2026-10-09" }] },
    );
    // paydays 2, 9, 16, 23, 30: three lines take 2, 9, 16; the 23rd and 30th remain
    expect(expectedMonthMoney(s, SOLE).income).toBe(5_000);
  });

  it("D-106 a paid line with lastPaidDate null is not added again", () => {
    const s = oct(
      [out({ id: "r", date: "2026-10-05", amount: 100_000, seriesId: "rent" })],
      { bills: [RENT] },
    );
    expect(expectedMonthMoney(s, SOLE).spending).toBe(100_000);
  });

  it("D-106 a second line of the same monthly series takes nothing more", () => {
    const s = oct(
      [
        out({
          id: "r1",
          date: "2026-10-01",
          amount: 100_000,
          seriesId: "rent",
        }),
        out({ id: "r2", date: "2026-10-04", amount: 5_000, seriesId: "rent" }),
      ],
      { bills: [RENT] },
    );
    expect(expectedMonthMoney(s, SOLE).spending).toBe(105_000);
  });

  it("D-106 a weekly pay series counts only the paydays not yet received", () => {
    const weekly = income({
      seriesId: "wk",
      freq: "weekly",
      anchorDate: "2026-10-02",
      latestAmount: 1_000,
    });
    const days = occurrencesBetween(
      {
        anchorDate: "2026-10-02",
        freq: "weekly",
        endDate: null,
        occurrenceCount: null,
      },
      "2026-10-01",
      "2026-10-31",
    ).map((o) => o.date);
    expect(days).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
    const s = oct(
      [
        inn({ id: "w1", date: days[0]!, amount: 1_000, seriesId: "wk" }),
        inn({ id: "w2", date: days[1]!, amount: 1_000, seriesId: "wk" }),
      ],
      { incomeSeries: [{ ...weekly, lastPaidDate: days[1]! }] },
    );
    const m = expectedMonthMoney(s, SOLE);
    expect(m.income).toBe(2_000 + 3_000);
    expect(m.stillDue.income).toBe(3_000);
  });

  it("D-106 a fortnightly series matches lines within 6 days", () => {
    const fn = income({
      seriesId: "fn",
      freq: "fortnightly",
      anchorDate: "2026-10-02",
      latestAmount: 1_000,
    });
    // paydays 2, 16, 30; a pending row moved to the 20th takes the 16th
    const s = oct(
      [
        inn({
          id: "f",
          date: "2026-10-20",
          amount: 1_000,
          seriesId: "fn",
          status: "pending",
        }),
      ],
      {
        incomeSeries: [{ ...fn, lastPaidDate: "2026-10-02" }],
      },
    );
    expect(expectedMonthMoney(s, SOLE).income).toBe(2_000); // the pending row plus the 30th
    // a row too far from every payday takes nothing
    const far = oct(
      [inn({ id: "f", date: "2026-10-09", amount: 1_000, seriesId: "fn" })],
      {
        incomeSeries: [
          { ...fn, anchorDate: "2026-10-25", lastPaidDate: "2026-09-27" },
        ],
      },
    );
    // payday 25 only: |9 - 25| > 6, so the row is extra and the 25th is still due
    expect(expectedMonthMoney(far, SOLE).income).toBe(2_000);
  });

  it("D-106 one-off lines this month count", () => {
    const s = oct([
      out({ id: "o1", date: "2026-10-02", amount: 30_000, oneOff: true }),
      inn({ id: "o2", date: "2026-10-03", amount: 40_000, oneOff: true }),
    ]);
    const m = expectedMonthMoney(s, SOLE);
    expect(m.spending).toBe(30_000);
    expect(m.income).toBe(40_000);
  });

  it("D-106 transfer legs add nothing, so a pot top-up is not counted twice with the set-aside", () => {
    const s = oct([
      out({ id: "t1", date: "2026-10-02", amount: 50_000, transferId: "tr1" }),
      inn({ id: "t2", date: "2026-10-02", amount: 50_000, transferId: "tr1" }),
    ]);
    const m = expectedMonthMoney(s, SOLE);
    expect(m.income).toBe(0);
    expect(m.spending).toBe(0);
    const withPot = octWithHistory(
      [
        out({
          id: "t1",
          date: "2026-10-02",
          amount: 50_000,
          transferId: "tr1",
        }),
      ],
      {
        pots: [
          {
            id: "p",
            kind: "pot",
            target: mu(120_000),
            monthlyAmount: mu(10_000),
            readyBy: null,
            saved: mu(0),
          },
        ],
      },
    );
    const r = prepareContext(withPot);
    if (!r.ok) throw new Error("context");
    const e = expectedMonth(r.context);
    expect(e.spending).toBe(0);
    expect(e.setAside).toBe(r.context.setAside);
  });

  it("D-106 pending and paid lines count alike, skipped lines count for nothing", () => {
    const s = oct([
      out({ id: "a", date: "2026-10-02", amount: 1_000 }),
      out({ id: "b", date: "2026-10-03", amount: 2_000, status: "pending" }),
      out({ id: "c", date: "2026-10-04", amount: 4_000, status: "skipped" }),
      inn({ id: "d", date: "2026-10-05", amount: 8_000, status: "skipped" }),
    ]);
    const m = expectedMonthMoney(s, SOLE);
    expect(m.spending).toBe(3_000);
    expect(m.income).toBe(0);
  });

  it("D-106 a refund nets against spending and is never income", () => {
    const s = oct([
      out({ id: "a", date: "2026-10-02", amount: 10_000 }),
      inn({ id: "r1", date: "2026-10-03", amount: 3_000, isRefund: true }),
      inn({
        id: "r2",
        date: "2026-10-04",
        amount: 2_000,
        isRefund: true,
        status: "pending",
      }),
    ]);
    const m = expectedMonthMoney(s, SOLE);
    expect(m.spending).toBe(5_000);
    expect(m.income).toBe(0);
  });

  it("D-106 a yearly bill counts only in the month it falls due", () => {
    const yearly = bill({
      seriesId: "ins",
      freq: "yearly",
      anchorDate: "2025-10-20",
      latestAmount: 60_000,
    });
    expect(
      expectedMonthMoney(oct([], { bills: [yearly] }), SOLE).spending,
    ).toBe(60_000);
    const march = { ...yearly, anchorDate: "2025-03-20" };
    expect(expectedMonthMoney(oct([], { bills: [march] }), SOLE).spending).toBe(
      0,
    );
  });

  it("D-106 a series that ends mid-month stops there", () => {
    const wk = income({
      seriesId: "wk",
      freq: "weekly",
      anchorDate: "2026-10-02",
      latestAmount: 1_000,
    });
    const byEnd = oct([], { incomeSeries: [{ ...wk, endDate: "2026-10-15" }] });
    expect(expectedMonthMoney(byEnd, SOLE).income).toBe(2_000); // 2nd and 9th
    const byCount = oct([], { incomeSeries: [{ ...wk, occurrenceCount: 3 }] });
    expect(expectedMonthMoney(byCount, SOLE).income).toBe(3_000); // 2nd, 9th, 16th
  });

  it("D-106 an unconfirmed series is ignored", () => {
    const s = oct([], {
      bills: [{ ...RENT, confirmed: false }],
      incomeSeries: [{ ...PAY, confirmed: false }],
    });
    const m = expectedMonthMoney(s, SOLE);
    expect(m.income).toBe(0);
    expect(m.spending).toBe(0);
  });

  it("D-106 no current-month record: only the schedule counts", () => {
    const s = snapshotOf({
      asOf: "2026-10-10",
      bills: [RENT],
      incomeSeries: [PAY],
    });
    const m = expectedMonthMoney(s, SOLE);
    expect(m.income).toBe(500_000);
    expect(m.spending).toBe(100_000);
  });

  it("D-106 household share applies to lines and bills, never to pay", () => {
    const share: SpendingShare = {
      byDefault: { weights: [1, 1], myIndex: 0 },
      byCategory: [
        { categoryId: "c1", share: { weights: [1, 3], myIndex: 0 } },
      ],
    };
    const s = oct(
      [
        out({ id: "a", date: "2026-10-02", amount: 100, categoryId: "c1" }),
        inn({ id: "b", date: "2026-10-02", amount: 900 }),
      ],
      {
        bills: [
          bill({
            seriesId: "b1",
            freq: "monthly",
            anchorDate: "2026-01-20",
            latestAmount: 400,
            categoryId: "c1",
          }),
          bill({
            seriesId: "b2",
            freq: "monthly",
            anchorDate: "2026-01-21",
            latestAmount: 400,
          }),
        ],
        incomeSeries: [
          income({
            seriesId: "p",
            freq: "monthly",
            anchorDate: "2026-01-25",
            latestAmount: 1_000,
          }),
        ],
      },
    );
    const m = expectedMonthMoney(s, share);
    expect(m.spending).toBe(25 + 100 + 200);
    expect(m.income).toBe(1_900);
  });

  it("D-106 result is income - spending - debts - saving - setAside and the equation holds exactly", () => {
    const s = snapshotOf({
      asOf: "2026-10-10",
      months: [
        {
          month: "2026-09",
          full: true,
          lines: [
            inn({ id: "i", date: "2026-09-15", amount: 600_000 }),
            out({ id: "o", date: "2026-09-15", amount: 300_000 }),
          ],
        },
        {
          month: "2026-10",
          full: false,
          lines: [out({ id: "x", date: "2026-10-02", amount: 12_345 })],
        },
      ],
      debts: [
        {
          id: "d",
          balance: mu(100_000),
          minimumPayment: mu(7_000),
          secured: false,
          apr: null,
          currency: currencyCode("USD"),
        },
      ],
      monthlySaving: mu(5_000),
      monthlyInvesting: mu(3_000),
      pots: [
        {
          id: "p",
          kind: "pot",
          target: mu(120_000),
          monthlyAmount: mu(10_000),
          readyBy: null,
          saved: mu(0),
        },
      ],
      incomeSeries: [PAY],
    });
    const r = prepareContext(s);
    if (!r.ok) throw new Error("context");
    const e = expectedMonth(r.context);
    expect(e.debtPayments).toBe(r.context.debtPayments);
    expect(e.saving).toBe(r.context.pausable);
    expect(e.setAside).toBe(r.context.setAside);
    expect(e.result).toBe(
      e.income -
        e.spending -
        r.context.debtPayments -
        r.context.pausable -
        r.context.setAside,
    );
    expect(e.income).toBe(500_000);
    expect(e.spending).toBe(12_345);
  });

  it("D-106 invalid input throws like the history", () => {
    expect(() =>
      expectedMonthMoney(
        oct([out({ id: "a", date: "2026-09-30", amount: 1 })]),
        SOLE,
      ),
    ).toThrow(RangeError);
    expect(() =>
      expectedMonthMoney(
        oct([
          out({
            id: "a",
            date: "2026-10-02",
            amount: 1,
            currency: currencyCode("CAD"),
          }),
        ]),
        SOLE,
      ),
    ).toThrow(RangeError);
    expect(() =>
      expectedMonthMoney(
        oct([], { bills: [{ ...RENT, anchorDate: "nope" }] }),
        SOLE,
      ),
    ).toThrow(RangeError);
    expect(() =>
      expectedMonthMoney(
        oct([], { incomeSeries: [{ ...PAY, anchorDate: "nope" }] }),
        SOLE,
      ),
    ).toThrow(RangeError);
    expect(() =>
      expectedMonthMoney(
        oct([], { bills: [{ ...RENT, currency: currencyCode("CAD") }] }),
        SOLE,
      ),
    ).toThrow(RangeError);
    expect(() =>
      expectedMonthMoney(
        oct([], { incomeSeries: [{ ...PAY, currency: currencyCode("CAD") }] }),
        SOLE,
      ),
    ).toThrow(RangeError);
  });

  it("D-106 month end is exact in February (leap and not) and December", () => {
    const last = (asOf: string): number => {
      const b = bill({
        seriesId: "x",
        freq: "monthly",
        anchorDate: "2024-01-31",
        latestAmount: 100,
      });
      const s = snapshotOf({ asOf, months: [], bills: [b] });
      return expectedMonthMoney(s, SOLE).spending;
    };
    expect(last("2028-02-10")).toBe(100); // 29 Feb exists
    expect(last("2027-02-10")).toBe(100); // clamped to 28 Feb
    expect(last("2026-12-10")).toBe(100); // 31 Dec
    const day30 = bill({
      seriesId: "y",
      freq: "monthly",
      anchorDate: "2024-01-30",
      latestAmount: 100,
    });
    expect(
      expectedMonthMoney(
        snapshotOf({ asOf: "2027-02-10", months: [], bills: [day30] }),
        SOLE,
      ).spending,
    ).toBe(100);
  });

  it("D-106 settling a pending line does not move the month", () => {
    const lineArb = fc.record({
      day: fc.integer({ min: 1, max: 28 }),
      amount: fc.integer({ min: 0, max: 1_000_000 }),
      direction: fc.constantFrom("in" as const, "out" as const),
      refund: fc.boolean(),
      oneOff: fc.boolean(),
      status: fc.constantFrom(
        "paid" as const,
        "pending" as const,
        "skipped" as const,
      ),
    });
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 12 }), (rows) => {
        const mk = (settle: boolean): RecordLine[] =>
          rows.map((r, i) =>
            line({
              id: `l${i}`,
              date: `2026-10-${String(r.day).padStart(2, "0")}`,
              direction: r.direction,
              amount: r.amount,
              isRefund: r.direction === "in" && r.refund,
              oneOff: r.oneOff,
              status: settle && r.status === "pending" ? "paid" : r.status,
            }),
          );
        const a = expectedMonthMoney(
          oct(mk(false), { bills: [RENT], incomeSeries: [PAY] }),
          SOLE,
        );
        const b = expectedMonthMoney(
          oct(mk(true), { bills: [RENT], incomeSeries: [PAY] }),
          SOLE,
        );
        expect(b).toEqual(a);
      }),
    );
  });
});
