import {
  array,
  assert as fcAssert,
  boolean,
  integer,
  property,
  record,
} from "fast-check";
import { minorUnits as mu } from "../../../../money/types";
import type {
  CustomOptions,
  IncomeProfile,
  V3Line,
  V3Month,
  V3Series,
} from "../../types";
import {
  eligibility,
  incomeThisMonth,
  planOf,
  typicalIncome,
  type IncomeInput,
} from "../incomeProfile";

function ser(over: Partial<V3Series> & { id: string }): V3Series {
  return {
    role: "pay",
    cadence: { unit: "month", every: 1 },
    anchorDate: "2026-04-01",
    endDate: null,
    amount: mu(400000),
    status: "live",
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: null,
    isHousing: false,
    savingMode: null,
    ...over,
  };
}

function line(over: Partial<V3Line> & { id: string }): V3Line {
  return {
    date: "2026-10-01",
    amount: mu(400000),
    role: "income",
    status: "paid",
    seriesId: null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
    ...over,
  };
}

const month = (m: string, lines: V3Line[]): V3Month => ({
  month: m,
  full: false,
  mark: null,
  lines,
});
const NO_CUSTOM: CustomOptions = {
  itemTypes: [],
  purposes: [],
  cadences: [],
  incomeKinds: [],
};
const prof = (over: Partial<IncomeProfile>): IncomeProfile => ({
  types: ["salary"],
  variable: null,
  steady: null,
  billsHorizonMonths: null,
  ...over,
});

function inp(over: Partial<IncomeInput>): IncomeInput {
  return {
    asOf: "2026-10-03",
    current: null,
    history: [],
    series: [],
    profile: prof({}),
    rough: null,
    custom: NO_CUSTOM,
    ...over,
  };
}

const PAY = ser({ id: "pay" });

describe("incomeThisMonth", () => {
  it("C15 Sam October: pay received on the 1st", () => {
    const cur = month("2026-10", [line({ id: "l1", seriesId: "pay" })]);
    const r = incomeThisMonth(inp({ current: cur, series: [PAY] }));
    expect(r).toEqual({
      received: 400000,
      dueConfirmed: 0,
      total: 400000,
      reasons: [],
    });
  });

  it("salary due later: counted as due confirmed", () => {
    const p = ser({ id: "pay", anchorDate: "2026-04-28" });
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-20", current: month("2026-10", []), series: [p] }),
    );
    expect(r.dueConfirmed).toBe(400000);
    expect(r.total).toBe(400000);
  });

  it("two weekly lines for one series both count as received", () => {
    const p = ser({
      id: "pay",
      cadence: { unit: "week", every: 1 },
      anchorDate: "2026-10-01",
      amount: mu(10000),
    });
    const cur = month("2026-10", [
      line({ id: "a", date: "2026-10-01", amount: mu(10000), seriesId: "pay" }),
      line({ id: "b", date: "2026-10-08", amount: mu(10000), seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-09", current: cur, series: [p] }),
    );
    expect(r.received).toBe(20000);
    expect(r.dueConfirmed).toBe(30000); // 10-15, 10-22, 10-29
  });

  it("H-02 early: monthly pay due 10-31 received 10-26 counts once, nothing due", () => {
    const p = ser({ id: "pay", anchorDate: "2026-01-31" });
    const cur = month("2026-10", [
      line({ id: "e", date: "2026-10-26", seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(inp({ asOf: "2026-10-28", current: cur, series: [p] }));
    expect(r.received).toBe(400000);
    expect(r.dueConfirmed).toBe(0);
    expect(r.total).toBe(400000);
  });

  it("H-02 missed: biweekly 10-01 and 10-15 with only the 10-15 line is one pay, 10-01 missed", () => {
    const p = ser({
      id: "pay",
      cadence: { unit: "week", every: 2 },
      anchorDate: "2026-10-01",
      amount: mu(100000),
    });
    const cur = month("2026-10", [
      line({ id: "b", date: "2026-10-15", amount: mu(100000), seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(inp({ asOf: "2026-10-16", current: cur, series: [p] }));
    expect(r.received).toBe(100000);
    // D-58 asks instead of counting: the unmatched 10-01 pay is listed unanswered, with no reason code until the user says
    expect(r.reasons).not.toContain("missed_pay_excluded");
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 100000, arrived: null }]);
    // 10-29, the third occurrence, is still to come: the total is two pays (10-15 and 10-29), not three
    expect(r.dueConfirmed).toBe(100000);
    expect(r.total).toBe(200000);
  });

  it("H-02 a late line within 7 days settles its own due date", () => {
    const p = ser({ id: "pay", anchorDate: "2026-04-05" });
    const cur = month("2026-10", [
      line({ id: "l", date: "2026-10-10", seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(inp({ asOf: "2026-10-12", current: cur, series: [p] }));
    expect(r.dueConfirmed).toBe(0);
    expect(r.received).toBe(400000);
  });

  it("nothing is matched across series", () => {
    const other = ser({ id: "pay2", anchorDate: "2026-04-05", amount: mu(1000) });
    const cur = month("2026-10", [
      line({ id: "l", date: "2026-10-05", seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(inp({ asOf: "2026-10-06", current: cur, series: [PAY, other] }));
    // D-58 asks instead of counting: pay2's 10-05 occurrence is before asOf with no line, so it is unseen, not due
    expect(r.dueConfirmed).toBe(0);
    expect(r.unseenPay).toEqual([{ seriesId: "pay2", date: "2026-10-05", amount: 1000, arrived: null }]);
  });

  it("W4 boundary: pay due Sun 11-01 received Fri 10-30 belongs to November", () => {
    const oct = month("2026-10", [
      line({ id: "own", date: "2026-10-01", seriesId: "pay" }),
      line({ id: "early", date: "2026-10-30", seriesId: "pay" }),
    ]);
    const a = incomeThisMonth(inp({ asOf: "2026-10-31", current: oct, series: [PAY] }));
    expect(a.received).toBe(400000); // October's own pay once, not the 10-30 line
    expect(a.dueConfirmed).toBe(0);
    expect(a.total).toBe(400000);
    const nov = incomeThisMonth(
      inp({ asOf: "2026-11-02", current: month("2026-11", []), history: [oct], series: [PAY] }),
    );
    expect(nov.received).toBe(400000); // counted once, as received, nothing due
    expect(nov.dueConfirmed).toBe(0);
    expect(nov.total).toBe(400000);
  });

  it("W4 a variable-income series settled by last month's line counts in the variable bucket", () => {
    const side = ser({
      id: "side",
      role: "other_income",
      anchorDate: "2026-04-01",
      amount: mu(50000),
      incomeKind: { kind: "preset", value: "rent" },
      countsAs: "available",
    });
    const oct = month("2026-10", [
      line({ id: "early", date: "2026-10-30", amount: mu(50000), seriesId: "side", incomeKind: { kind: "preset", value: "rent" }, countsAs: "available" }),
    ]);
    const r = incomeThisMonth(
      inp({ asOf: "2026-11-02", current: month("2026-11", []), history: [oct], series: [side] }),
    );
    expect(r.received).toBe(50000);
    expect(r.dueConfirmed).toBe(0);
  });

  it("D-56 typed pay line: a typed or statement income line of the right amount settles a pay occurrence", () => {
    for (const source of [undefined, "statement"] as const) {
      const cur = month("2026-10", [
        line({ id: "t", date: "2026-10-02", amount: mu(405000), seriesId: null, source }),
      ]);
      const r = incomeThisMonth(inp({ asOf: "2026-10-12", current: cur, series: [PAY] }));
      expect(r.received).toBe(405000);
      expect(r.dueConfirmed).toBe(0);
      expect(r.reasons).not.toContain("missed_pay_excluded");
    }
    // 15% off: not the pay, so the 10-01 occurrence is unseen (D-58 asks instead of counting)
    const off = month("2026-10", [line({ id: "t", date: "2026-10-02", amount: mu(340000), seriesId: null })]);
    const r = incomeThisMonth(inp({ asOf: "2026-10-12", current: off, series: [PAY] }));
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: null }]);
  });

  it("works with no current month at all", () => {
    const r = incomeThisMonth(inp({ series: [PAY], profile: null }));
    // D-58 asks instead of counting: 10-01 is before asOf with no line, so it is not counted until answered
    expect(r.total).toBe(0);
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: null }]);
  });

  it("I3 missed paycheque is never counted; D-58 asks instead of counting by a grace window", () => {
    const cur = month("2026-10", []);
    for (const asOf of ["2026-10-08", "2026-10-13"]) {
      const r = incomeThisMonth(inp({ asOf, current: cur, series: [PAY] }));
      expect(r.total).toBe(0);
      expect(r.dueConfirmed).toBe(0);
      expect(r.reasons).not.toContain("missed_pay_excluded");
      expect(r.unseenPay).toHaveLength(1);
    }
    // a pay dated on asOf is still due
    const today = incomeThisMonth(inp({ asOf: "2026-10-01", current: cur, series: [PAY] }));
    expect(today.dueConfirmed).toBe(400000);
    expect(today.unseenPay).toBeUndefined();
  });

  it("D-58 answered arrived: the unseen pay counts as received for that occurrence", () => {
    const r = incomeThisMonth(
      inp({
        asOf: "2026-10-13",
        current: month("2026-10", []),
        series: [PAY],
        payArrivals: [{ seriesId: "pay", date: "2026-10-01", arrived: true }],
      }),
    );
    expect(r.received).toBe(400000);
    expect(r.total).toBe(400000);
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: true }]);
    expect(r.reasons).not.toContain("missed_pay_excluded");
  });

  it("D-58 answered arrived for a non-salary series counts in the variable bucket", () => {
    const side = ser({
      id: "side",
      role: "other_income",
      countsAs: "available",
      incomeKind: { kind: "preset", value: "rent" },
      amount: mu(50000),
    });
    const r = incomeThisMonth(
      inp({
        asOf: "2026-10-13",
        current: month("2026-10", []),
        series: [side],
        profile: prof({ types: ["salary"] }),
        payArrivals: [{ seriesId: "side", date: "2026-10-01", arrived: true }],
      }),
    );
    expect(r.received).toBe(50000);
    expect(r.unseenPay).toHaveLength(1);
  });

  it("D-58 answered not yet: missed, no income, reason missed_pay_excluded", () => {
    const r = incomeThisMonth(
      inp({
        asOf: "2026-10-13",
        current: month("2026-10", []),
        series: [PAY],
        payArrivals: [{ seriesId: "pay", date: "2026-10-01", arrived: false }],
      }),
    );
    expect(r.total).toBe(0);
    expect(r.reasons).toContain("missed_pay_excluded");
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: false }]);
  });

  it("D-58 unanswered: neither received nor due, listed with arrived null; an answer for another date does not apply", () => {
    const r = incomeThisMonth(
      inp({
        asOf: "2026-10-13",
        current: month("2026-10", []),
        series: [PAY],
        payArrivals: [{ seriesId: "pay", date: "2026-09-01", arrived: true }],
      }),
    );
    expect(r.total).toBe(0);
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: null }]);
  });

  it("a line paid up to 3 days early satisfies the occurrence", () => {
    const p = ser({ id: "pay", anchorDate: "2026-04-30" });
    const cur = month("2026-10", [
      line({ id: "e", date: "2026-10-28", seriesId: "pay" }),
    ]);
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-29", current: cur, series: [p] }),
    );
    expect(r.dueConfirmed).toBe(0);
    expect(r.received).toBe(400000);
  });

  it("weekly pay: each occurrence needs its own line", () => {
    const p = ser({
      id: "pay",
      cadence: { unit: "week", every: 1 },
      anchorDate: "2026-10-02",
      amount: mu(10000),
    });
    const cur = month("2026-10", [
      line({
        id: "w1",
        date: "2026-10-02",
        amount: mu(10000),
        seriesId: "pay",
      }),
    ]);
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-10", current: cur, series: [p] }),
    );
    expect(r.received).toBe(10000);
    expect(r.dueConfirmed).toBe(30000); // 10-16, 10-23, 10-30; 10-09 is before asOf with no line, so D-58 asks instead of counting
  });

  it("D-18 raise: the series amount is used before the October line exists", () => {
    const p = ser({ id: "pay", amount: mu(430000) });
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-01", current: month("2026-10", []), series: [p] }),
    );
    expect(r.dueConfirmed).toBe(430000);
  });

  it("D-18 job loss: ended series adds nothing", () => {
    const p = ser({ id: "pay", status: "ended", endDate: "2026-09-30" });
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-01", current: month("2026-10", []), series: [p] }),
    );
    expect(r.dueConfirmed).toBe(0);
    expect(r.total).toBe(0);
  });

  it("rough figures: no confirmed income uses rough income", () => {
    const rough = {
      income: mu(250000),
      expenses: mu(0),
      saving: mu(0),
      debt: mu(0),
      invest: mu(0),
      asOf: "2026-10-01",
    };
    const r = incomeThisMonth(inp({ rough }));
    expect(r.total).toBe(250000);
    expect(r.reasons).toEqual(["rough_figures_used"]);
    // a confirmed pay series (even a missed one) blocks the rough fallback
    const r2 = incomeThisMonth(
      inp({
        asOf: "2026-10-20",
        series: [PAY],
        current: month("2026-10", []),
        rough,
      }),
    );
    expect(r2.total).toBe(0);
  });

  it("D-19 other income: only available counts; unmarked adds a reason", () => {
    const rent = { kind: "preset", value: "rent" } as const;
    const cur = month("2026-10", [
      line({
        id: "a",
        amount: mu(50000),
        incomeKind: rent,
        countsAs: "available",
      }),
      line({ id: "k", amount: mu(70000), incomeKind: rent, countsAs: "kept" }),
      line({ id: "u", amount: mu(90000), incomeKind: rent }),
      line({ id: "n", amount: mu(11000) }),
    ]);
    const r = incomeThisMonth(inp({ current: cur }));
    expect(r.received).toBe(50000);
    expect(r.reasons).toContain("income_kind_unmarked");
  });

  it("D-19 own income type uses its custom mark", () => {
    const custom: CustomOptions = {
      ...NO_CUSTOM,
      incomeKinds: [
        { id: "c1", countsAs: "available" },
        { id: "c2", countsAs: "kept" },
      ],
    };
    const cur = month("2026-10", [
      line({
        id: "a",
        amount: mu(10000),
        incomeKind: { kind: "custom", id: "c1" },
      }),
      line({
        id: "b",
        amount: mu(20000),
        incomeKind: { kind: "custom", id: "c2" },
      }),
      line({
        id: "c",
        amount: mu(30000),
        incomeKind: { kind: "custom", id: "gone" },
      }),
    ]);
    const r = incomeThisMonth(inp({ current: cur, custom }));
    expect(r.received).toBe(10000);
    expect(r.reasons).toContain("custom_option_missing");
  });

  it("other-income series under a salary profile: due when available, never when unmarked", () => {
    const avail = ser({
      id: "r1",
      role: "other_income",
      amount: mu(60000),
      anchorDate: "2026-04-05",
      countsAs: "available",
    });
    const unmarked = ser({
      id: "r2",
      role: "other_income",
      amount: mu(70000),
      anchorDate: "2026-04-05",
      incomeKind: { kind: "preset", value: "rent" },
    });
    const r = incomeThisMonth(
      inp({ current: month("2026-10", []), series: [avail, unmarked] }),
    );
    expect(r.dueConfirmed).toBe(60000);
    expect(r.reasons).toContain("income_kind_unmarked");
    const none = ser({
      id: "r3",
      role: "other_income",
      amount: mu(1),
      anchorDate: "2026-04-05",
      incomeKind: { kind: "custom", id: "x" },
    });
    expect(incomeThisMonth(inp({ series: [none] })).reasons).toEqual(
      expect.arrayContaining(["custom_option_missing"]),
    );
  });

  it("spending lines in the month are not income; a series-tagged other income line takes the series mark", () => {
    const rent = ser({
      id: "rent",
      role: "other_income",
      amount: mu(60000),
      anchorDate: "2026-04-01",
      countsAs: "available",
      incomeKind: { kind: "preset", value: "rent" },
    });
    const bad = ser({
      id: "bad",
      role: "other_income",
      amount: mu(1),
      anchorDate: "2026-04-01",
      incomeKind: { kind: "preset", value: "rent" },
    });
    const cur = month("2026-10", [
      line({ id: "sp", role: "spending", amount: mu(9999) }),
      line({ id: "r", amount: mu(60000), seriesId: "rent" }),
      line({ id: "b", amount: mu(5), seriesId: "bad" }),
    ]);
    const r = incomeThisMonth(inp({ current: cur, series: [rent, bad] }));
    expect(r.received).toBe(60000);
    expect(r.dueConfirmed).toBe(0);
  });

  it("a series marked kept never counts and raises no unmarked reason", () => {
    const kept = ser({
      id: "k",
      role: "other_income",
      amount: mu(70000),
      anchorDate: "2026-04-05",
      countsAs: "kept",
    });
    const r = incomeThisMonth(
      inp({ current: month("2026-10", []), series: [kept] }),
    );
    expect(r.total).toBe(0);
    expect(r.reasons).toEqual([]);
    expect(typicalIncome(inp({ series: [kept] })).reasons).toEqual([]);
  });

  it("spread works with no current month, from history alone", () => {
    const hist = [
      month("2026-09", [
        line({
          id: "h",
          date: "2026-09-05",
          amount: mu(300000),
          coversMonths: 3,
        }),
      ]),
    ];
    const r = incomeThisMonth(
      inp({
        current: null,
        history: hist,
        profile: prof({ types: ["freelance"], variable: "spread" }),
      }),
    );
    expect(r.received).toBe(100000);
  });

  it("D-41 an ended pay series with no end date has nothing due from asOf on, and its paid line still counts", () => {
    const p = ser({ id: "pay", anchorDate: "2026-04-28", status: "ended" });
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-20", current: month("2026-10", []), series: [p] }),
    );
    expect(r.dueConfirmed).toBe(0);
    expect(r.total).toBe(0);
    const paid = ser({ id: "pay", status: "ended" });
    const cur = month("2026-10", [line({ id: "l1", seriesId: "pay" })]);
    const r2 = incomeThisMonth(inp({ current: cur, series: [paid] }));
    expect(r2.received).toBe(400000);
    expect(r2.dueConfirmed).toBe(0);
  });

  it("unconfirmed pay series never counts (I34)", () => {
    const p = ser({ id: "pay", confirmed: false });
    expect(incomeThisMonth(inp({ series: [p] })).total).toBe(0);
  });

  describe("I39 profile (a) match", () => {
    const profile = prof({ types: ["freelance"], variable: "match" });
    it("counts received plus expected, never an unmarked future invoice", () => {
      const cur = month("2026-10", [
        line({ id: "got", amount: mu(100000) }),
        line({
          id: "exp",
          amount: mu(50000),
          status: "pending",
          expected: true,
          date: "2026-10-25",
        }),
        line({
          id: "unm",
          amount: mu(70000),
          status: "pending",
          expected: false,
          date: "2026-10-26",
        }),
        line({
          id: "next",
          amount: mu(80000),
          status: "pending",
          expected: true,
          date: "2026-11-02",
        }),
        line({
          id: "old",
          amount: mu(9000),
          status: "pending",
          expected: true,
          date: "2026-10-01",
        }),
      ]);
      const r = incomeThisMonth(
        inp({ asOf: "2026-10-12", current: cur, profile }),
      );
      expect(r.received).toBe(100000);
      expect(r.dueConfirmed).toBe(50000);
      expect(r.reasons).toContain("missed_pay_excluded");
    });
    it("null variable acts as match; kept and unmarked expected lines are ignored", () => {
      const cur = month("2026-10", [
        line({
          id: "k",
          status: "pending",
          expected: true,
          date: "2026-10-20",
          countsAs: "kept",
          incomeKind: { kind: "preset", value: "rent" },
        }),
        line({
          id: "u",
          status: "pending",
          expected: true,
          date: "2026-10-20",
          incomeKind: { kind: "preset", value: "rent" },
        }),
        line({
          id: "ok",
          amount: mu(1000),
          status: "pending",
          expected: true,
          date: "2026-10-20",
        }),
      ]);
      const r = incomeThisMonth(
        inp({
          current: cur,
          profile: prof({ types: ["commission"], variable: null }),
        }),
      );
      expect(r.dueConfirmed).toBe(1000);
    });
    it("pay series are not dated under a variable-only profile", () => {
      const r = incomeThisMonth(
        inp({ series: [PAY], current: month("2026-10", []), profile }),
      );
      expect(r.total).toBe(0);
    });
    it("I3 removing pending income never raises the total (property)", () => {
      const lineArb = record({
        day: integer({ min: 1, max: 28 }),
        amount: integer({ min: 1, max: 500000 }),
        pending: boolean(),
        expected: boolean(),
      });
      fcAssert(
        property(
          array(lineArb, { minLength: 1, maxLength: 8 }),
          integer({ min: 1, max: 28 }),
          integer({ min: 0, max: 7 }),
          (specs, asOfDay, pick) => {
            const lines = specs.map((s, i) =>
              line({
                id: `l${i}`,
                date: `2026-10-${String(s.day).padStart(2, "0")}`,
                amount: mu(s.amount),
                status: s.pending ? "pending" : "paid",
                expected: s.expected,
              }),
            );
            const asOf = `2026-10-${String(asOfDay).padStart(2, "0")}`;
            const total = (ls: V3Line[]): number =>
              incomeThisMonth(
                inp({ asOf, current: month("2026-10", ls), profile }),
              ).total;
            const pendIdx = lines
              .map((l, i) => (l.status === "pending" ? i : -1))
              .filter((i) => i >= 0);
            if (pendIdx.length === 0) return true;
            const drop = pendIdx[pick % pendIdx.length] as number;
            return total(lines.filter((_, i) => i !== drop)) <= total(lines);
          },
        ),
      );
    });
    it("I3 an overdue unpaid pay occurrence never raises the total (property)", () => {
      fcAssert(
        property(
          integer({ min: 1, max: 28 }),
          integer({ min: 1, max: 28 }),
          (payDay, asOfDay) => {
            const p = ser({
              id: "pay",
              anchorDate: `2026-04-${String(payDay).padStart(2, "0")}`,
            });
            const asOf = `2026-10-${String(asOfDay).padStart(2, "0")}`;
            const paid = line({
              id: "x",
              date: `2026-10-${String(payDay).padStart(2, "0")}`,
              seriesId: "pay",
            });
            const without = incomeThisMonth(
              inp({ asOf, current: month("2026-10", []), series: [p] }),
            ).total;
            const withLine = incomeThisMonth(
              inp({ asOf, current: month("2026-10", [paid]), series: [p] }),
            ).total;
            return without <= withLine;
          },
        ),
      );
    });
  });

  describe("profile (b) spread", () => {
    const profile = prof({ types: ["freelance"], variable: "spread" });
    const big600 = line({
      id: "big",
      date: "2026-08-10",
      amount: mu(600000),
      coversMonths: 3,
    });
    it("spreads a 3-month payment over Aug, Sep, Oct", () => {
      const hist = [month("2026-08", [big600])];
      for (const [ym, expected] of [
        ["2026-08", 200000],
        ["2026-09", 200000],
        ["2026-10", 200000],
      ] as const) {
        const cur = ym === "2026-08" ? hist[0] : month(ym, []);
        const r = incomeThisMonth(
          inp({
            asOf: `${ym}-20`,
            current: cur as V3Month,
            history: hist,
            profile,
          }),
        );
        expect(r.received).toBe(expected);
      }
      expect(
        incomeThisMonth(
          inp({
            asOf: "2026-11-20",
            current: month("2026-11", []),
            history: hist,
            profile,
          }),
        ).received,
      ).toBe(0);
    });
    it("remainder goes to the last month so the parts sum to the line", () => {
      const odd = line({
        id: "odd",
        date: "2026-08-10",
        amount: mu(100000),
        coversMonths: 3,
      });
      const hist = [month("2026-08", [odd])];
      const parts = ["2026-08", "2026-09", "2026-10"].map(
        (ym) =>
          incomeThisMonth(
            inp({
              asOf: `${ym}-20`,
              current: ym === "2026-08" ? (hist[0] as V3Month) : month(ym, []),
              history: hist,
              profile,
            }),
          ).received,
      );
      expect(parts).toEqual([33333, 33333, 33334]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(100000);
    });
    it("plain lines count in their month; history duplicates are not double counted; unmarked kinds are skipped", () => {
      const cur = month("2026-10", [
        line({ id: "p", amount: mu(1000) }),
        line({
          id: "s",
          date: "2026-10-02",
          amount: mu(300000),
          coversMonths: 3,
        }),
        line({
          id: "x",
          date: "2026-10-02",
          amount: mu(900000),
          coversMonths: 3,
          incomeKind: { kind: "preset", value: "rent" },
        }),
        line({
          id: "pend",
          date: "2026-10-02",
          amount: mu(900000),
          coversMonths: 3,
          status: "pending",
        }),
      ]);
      const r = incomeThisMonth(
        inp({ current: cur, history: [cur, month("2026-09", [])], profile }),
      );
      expect(r.received).toBe(101000);
    });
    it("a spread line outside the window is ignored", () => {
      const old = line({
        id: "old",
        date: "2026-01-10",
        amount: mu(600000),
        coversMonths: 3,
      });
      const r = incomeThisMonth(
        inp({
          current: month("2026-10", []),
          history: [month("2026-01", [old])],
          profile,
        }),
      );
      expect(r.received).toBe(0);
    });
    it("a salary part is never spread", () => {
      const mix = prof({ types: ["mix", "salary"], variable: "spread" });
      const cur = month("2026-10", [
        line({ id: "pay1", seriesId: "pay", coversMonths: 3 }),
      ]);
      const r = incomeThisMonth(
        inp({ current: cur, series: [PAY], profile: mix }),
      );
      expect(r.total).toBe(400000);
    });
  });

  describe("profile (c) steady", () => {
    it("Maya: total is the steady amount regardless of received", () => {
      const profile = prof({
        types: ["freelance"],
        variable: "steady",
        steady: mu(300000),
      });
      const cur = month("2026-10", [line({ id: "a", amount: mu(12345) })]);
      const r = incomeThisMonth(inp({ current: cur, profile }));
      expect(r.total).toBe(300000);
      expect(r.received).toBe(12345);
    });
    it("steady without an amount falls back to the received money", () => {
      const profile = prof({
        types: ["freelance"],
        variable: "steady",
        steady: null,
      });
      const r = incomeThisMonth(
        inp({
          current: month("2026-10", [line({ id: "a", amount: mu(500) })]),
          profile,
        }),
      );
      expect(r.total).toBe(500);
    });
    it("a mix keeps the salary part and replaces the rest by the steady amount", () => {
      const profile = prof({
        types: ["mix", "salary"],
        variable: "steady",
        steady: mu(100000),
      });
      const r = incomeThisMonth(
        inp({
          current: month("2026-10", [line({ id: "a", seriesId: "pay" })]),
          series: [PAY],
          profile,
        }),
      );
      expect(r.total).toBe(500000);
    });
  });

  describe("profile (d) balance", () => {
    it("counts what was received and nothing due", () => {
      const profile = prof({ types: ["commission"], variable: "balance" });
      const cur = month("2026-10", [
        line({ id: "a", amount: mu(700) }),
        line({
          id: "p",
          amount: mu(900),
          status: "pending",
          expected: true,
          date: "2026-10-20",
        }),
      ]);
      const r = incomeThisMonth(inp({ current: cur, series: [PAY], profile }));
      expect(r.total).toBe(700);
      expect(r.dueConfirmed).toBe(0);
    });
  });

  it("a mix applies salary dates to pay and the variable rule to the rest", () => {
    const profile = prof({
      types: ["mix", "salary", "freelance"],
      variable: "match",
    });
    const cur = month("2026-10", [
      line({ id: "f", amount: mu(25000) }),
      line({
        id: "fx",
        amount: mu(5000),
        status: "pending",
        expected: true,
        date: "2026-10-25",
      }),
    ]);
    const r = incomeThisMonth(
      inp({ asOf: "2026-10-03", current: cur, series: [PAY], profile }),
    );
    expect(r.received).toBe(25000);
    expect(r.dueConfirmed).toBe(5000); // the 10-01 pay is before asOf with no line: D-58 asks instead of counting
    expect(r.total).toBe(30000);
    expect(r.unseenPay).toEqual([{ seriesId: "pay", date: "2026-10-01", amount: 400000, arrived: null }]);
  });

  it("rough income is not used when a profile-less user has logged income", () => {
    const rough = {
      income: mu(999),
      expenses: mu(0),
      saving: mu(0),
      debt: mu(0),
      invest: mu(0),
      asOf: "2026-10-01",
    };
    const r = incomeThisMonth(
      inp({
        current: month("2026-10", [line({ id: "a", seriesId: "pay" })]),
        series: [PAY],
        profile: null,
        rough,
      }),
    );
    expect(r.total).toBe(400000);
  });
});

describe("typicalIncome", () => {
  it("sums live confirmed pay at its monthly equivalent", () => {
    const weekly = ser({
      id: "w",
      cadence: { unit: "week", every: 2 },
      amount: mu(100000),
    });
    const r = typicalIncome(inp({ series: [PAY, weekly] }));
    expect(r.amount).toBe(400000 + 216667); // 100000 * 52 / (12 * 2) = 216666.67
    expect(r.hasConfirmedIncome).toBe(true);
  });

  it("D-41 an ended pay series with no end date is not in the typical income", () => {
    const ended = ser({ id: "e", status: "ended" });
    const r = typicalIncome(inp({ series: [ended] }));
    expect(r.amount).toBe(0);
    expect(r.hasConfirmedIncome).toBe(false);
  });

  it("adds available other income, flags unmarked, skips ended series", () => {
    const avail = ser({
      id: "r",
      role: "other_income",
      amount: mu(50000),
      countsAs: "available",
    });
    const unm = ser({
      id: "u",
      role: "other_income",
      amount: mu(70000),
      incomeKind: { kind: "preset", value: "rent" },
    });
    const old = ser({ id: "o", endDate: "2026-09-01", status: "ended" });
    const r = typicalIncome(inp({ series: [PAY, avail, unm, old] }));
    expect(r.amount).toBe(450000);
    expect(r.reasons).toContain("income_kind_unmarked");
  });

  it("steady: the steady amount, plus the salary part in a mix", () => {
    const steady = prof({
      types: ["freelance"],
      variable: "steady",
      steady: mu(300000),
    });
    expect(typicalIncome(inp({ profile: steady, series: [PAY] })).amount).toBe(
      300000,
    );
    const mix = prof({
      types: ["mix", "salary"],
      variable: "steady",
      steady: mu(100000),
    });
    expect(typicalIncome(inp({ profile: mix, series: [PAY] })).amount).toBe(
      500000,
    );
    expect(typicalIncome(inp({ profile: steady })).hasConfirmedIncome).toBe(
      false,
    );
  });

  it("falls back to rough figures, otherwise zero", () => {
    const rough = {
      income: mu(250000),
      expenses: mu(0),
      saving: mu(0),
      debt: mu(0),
      invest: mu(0),
      asOf: "2026-10-01",
    };
    const r = typicalIncome(inp({ rough }));
    expect(r).toEqual({
      amount: 250000,
      hasConfirmedIncome: false,
      reasons: ["rough_figures_used"],
    });
    expect(typicalIncome(inp({})).amount).toBe(0);
  });
});

describe("exports used by the income pattern (05.1-43)", () => {
  it("planOf and eligibility behave as before", () => {
    expect(planOf(null)).toEqual({ paySalary: true, hasVariable: false, rule: "series" });
    expect(planOf(prof({ types: ["freelance"], variable: "spread" }))).toEqual({
      paySalary: false,
      hasVariable: true,
      rule: "spread",
    });
    const idx = new Map([["pay", PAY]]);
    const ok = eligibility(line({ id: "a", seriesId: "pay" }), idx, planOf(null), NO_CUSTOM);
    expect(ok).toEqual({ ok: true, salary: true, reasons: [] });
    expect(eligibility(line({ id: "b", role: "spending" }), idx, planOf(null), NO_CUSTOM).ok).toBe(false);
  });
});
