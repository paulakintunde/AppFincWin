/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-43; engine depth expansion).
 *
 * New behaviour with no prototype counterpart: the prototype gave a bare fits/adjust/no. D-43 reports how much room
 * each line has; a line passed (or failed) by less than 5% of its threshold is flagged on the edge, and the verdict
 * state itself is unchanged.
 */
import { minorUnits } from "../../../money/types";
import { percent } from "../../../payoff/types";
import { decide } from "../../decision";
import type {
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
} from "../../types";
import { USD, buyCash, snapshotOf } from "../helpers/fixtures";

const m = minorUnits;
const D1: DebtRecord = {
  id: "d1",
  balance: m(800_000),
  minimumPayment: m(20_000),
  secured: false,
  apr: percent("19.9"),
  currency: USD,
};
const D2: DebtRecord = {
  id: "d2",
  balance: m(15_000_000),
  minimumPayment: m(90_000),
  secured: true,
  apr: percent("5.1"),
  currency: USD,
};
const LIMITS: DecideLimits = {
  reserve: m(600_000),
  dsrLine: percent("36"),
  housingLine: null,
  unsecuredIncomeMultiple: 12,
  investingFloor: m(40_000),
  savingFloor: m(25_000),
  spareFloor: null,
};
const BL = (): DecideSnapshot =>
  snapshotOf({
    debts: [D1, D2],
    monthlySaving: m(25_000),
    monthlyInvesting: m(40_000),
    limits: LIMITS,
  });
const line = (price: number, name: string, over: Partial<BuyCheck> = {}) =>
  decide(BL(), buyCash(price, over)).margins.find((x) => x.line === name)!;

describe("D-43 on the edge", () => {
  it("D-43: a line passed by less than 5% of its threshold is on the edge, and the state is unchanged", () => {
    const d = decide(BL(), buyCash(1_370_001));
    expect(d.verdict.state).toBe("fits");
    expect(d.margins.find((x) => x.line === "cash")).toMatchObject({
      margin: 29_999,
      flag: "on_edge",
    });
  });

  it("D-43: exactly 5% is not on the edge", () => {
    expect(line(1_370_000, "cash")).toMatchObject({
      margin: 30_000,
      flag: null,
    });
  });

  it("D-43: the month line is measured against a month's costs", () => {
    // BL leaves 125_000 a month; running costs of 104_501 leave 20_499, under 5% of the 410_000 month's costs.
    expect(
      line(100_000, "month", { runningCostsNet: m(104_501) }),
    ).toMatchObject({
      margin: 20_499,
      base: 410_000,
      flag: "on_edge",
    });
    expect(
      line(100_000, "month", { runningCostsNet: m(104_500) }),
    ).toMatchObject({ margin: 20_500, flag: null });
  });

  it("a zero investing floor is not set and never makes the verdict on the edge", () => {
    // D-65: floor 0 and nothing invested leaves a margin of exactly 0, which used to flag on the edge.
    const snap = snapshotOf({
      monthlySaving: m(25_000),
      monthlyInvesting: m(0),
      limits: { ...LIMITS, investingFloor: m(0) },
    });
    const inv = decide(snap, buyCash(100_000)).margins.find(
      (x) => x.line === "inv",
    )!;
    expect(inv).toMatchObject({ margin: 0, flag: null });
    // a null floor resolves to what is invested now; 0 invested is also not set
    const nul = snapshotOf({
      monthlySaving: m(25_000),
      monthlyInvesting: m(0),
      limits: { ...LIMITS, investingFloor: null },
    });
    expect(
      decide(nul, buyCash(100_000)).margins.find((x) => x.line === "inv")!.flag,
    ).toBeNull();
  });

  it("a thin margin above a non-zero investing floor still fires", () => {
    // BL invests exactly the 40_000 floor: margin 0 against a real floor is on the edge.
    expect(line(100_000, "inv")).toMatchObject({
      margin: 0,
      threshold: 40_000,
      flag: "on_edge",
    });
  });
});
