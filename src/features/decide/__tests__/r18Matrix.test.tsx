/**
 * 05-130 (R18.11, R6): the R18 surfaces at 320 / 402 wide x 1.0x / 2.0x. Jest has no layout engine, so each cell renders the real
 * component at that width and text scale and asserts what the tree can show: no fixed text height, no unexpected clamp, no
 * negative margin around text, every target 44 or taller, labels whole, and the stacked or side by side form the rule S picks.
 * The Pots screen and sheet run in r18MatrixPots.test.tsx, which needs a different set of module mocks.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { DebtRow } from "@/db/debts";
import type { DecideSettingsRow } from "@/db/decideSettings";
import { minorUnits } from "@/engine/money";
import { carInputs } from "@/features/decide/__tests__/helpers/demoScenario";
import { demoSource } from "@/features/decide/__tests__/helpers/demoScenario";
import { buildDecideSnapshot } from "../snapshot/buildSnapshot";
import {
  TODAY,
  loggedSource,
  month,
} from "../snapshot/__tests__/helpers/snapshotFixtures";
import type { CheckInputs, SnapshotResult } from "../snapshot/types";
import { wrap } from "../check/steps/__tests__/helpers/stepProps";
import { Step3Verdict } from "../check/steps/Step3Verdict";
import { stepProps } from "../check/steps/__tests__/helpers/stepProps";
import { homeCardModel } from "../home/homeCardModel";
import { HomeSummaryCard } from "../home/HomeSummaryCard";
import { MonthDetailsSheet } from "../home/MonthDetailsSheet";
import { LinesCard } from "../home/LinesCard";
import { LoansCountedAsHousing } from "../home/DebtHousingSwitch";
import {
  MATRIX,
  expectFits,
  expectTargets,
  matrixName,
} from "./helpers/r18Fit";

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    width: mockWidth,
    height: 874,
    scale: 2,
    fontScale: mockScale,
  }),
}));
jest.mock("expo-router", () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../home/checkHref", () => ({ openNewCheck: jest.fn() }));
jest.mock("@/services/analytics", () => ({
  getAnalytics: () => ({ track: jest.fn() }),
}));
jest.mock("@/shell/navigation/pushOnce", () => ({ pushOnce: jest.fn() }));
jest.mock("@/state/undoToast", () => ({ showToast: jest.fn() }));
jest.mock("@/ui/haptics", () => ({
  hapticSelection: jest.fn(),
  hapticLight: jest.fn(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));
let mockDebts: DebtRow[] = [];
jest.mock("@/data/queries/decide", () => ({
  useOtherChecks: () => ({
    otherChecks: [],
    openCount: 0,
    leftOutIncomplete: 0,
    leftOutCurrency: 0,
  }),
  useDebts: () => ({ data: mockDebts }),
}));
jest.mock("@/data/mutations/debts", () => ({
  useSetDebtHousing: () => ({ setHousing: jest.fn(() => "step-1") }),
}));
jest.mock("@/data/mutations/decideSettings", () => ({
  useUpdateDecideSettings: () => ({ update: jest.fn() }),
}));
jest.mock("@/features/record/useRecordContext", () => ({
  useRecordContext: () => ({ userId: "u1", householdId: "h1" }),
}));

const whole = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n / 100))}`;
const months = (income: number[], spending = 300_000) =>
  income.map((inc, i) => month(`2026-0${6 + i}`, inc, spending));
const NBSP = " ";

beforeEach(() => {
  mockDebts = [];
});

function cell(m: { width: number; scale: number }) {
  mockWidth = m.width;
  mockScale = m.scale;
}

const settings = {
  user_id: "u1",
  currency: "USD",
  rough_income: null,
  rough_spending: null,
  reserve: null,
  dsr_line: null,
  housing_line: null,
  unsecured_multiple: null,
  investing_floor: null,
  saving_floor: null,
  basis_override: null,
  version: 1,
  updated_at: "2026-10-15T00:00:00Z",
} as DecideSettingsRow;
const longName =
  "Mortgage on the house by the lake with the very long official name that must wrap rather than clip";
const loan = (id: string, over: Partial<DebtRow> = {}): DebtRow =>
  ({
    id,
    household_id: "h1",
    account_id: null,
    check_id: null,
    series_id: null,
    name: `Loan ${id}`,
    kind: "loan",
    currency: "USD",
    balance: 20_000_000,
    apr: null,
    minimum_payment: 120_000,
    secured: true,
    term_months: null,
    start_date: null,
    min_percent: null,
    min_interest_added: null,
    min_floor: null,
    paid_in_full: false,
    is_housing: false,
    is_sample: false,
    deleted_at: null,
    version: 3,
    updated_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  }) as DebtRow;

const cardProps = (source: SnapshotResult) => ({
  source,
  settings: null,
  status: "ready" as const,
  homeBasisSeen: true,
  judgeOn: "month" as const,
  onChooseJudgeOn: jest.fn(),
  currency: "USD",
  today: TODAY,
  onOpenDetails: jest.fn(),
  onAddRough: jest.fn(),
  onRetry: jest.fn(),
  onRunFull: jest.fn(),
});

/** Runs the body at every cell of the R6 matrix, clearing the tree between cells. */
async function eachCell(
  body: (m: { width: number; scale: number }) => Promise<void>,
): Promise<void> {
  for (const m of MATRIX) {
    mockDebts = [];
    try {
      await body(m);
    } catch (e) {
      throw new Error(`${matrixName(m)}: ${(e as Error).message}`);
    }
    await cleanup();
  }
}

describe("R18 matrix", () => {
  it("D-100 the eyebrow row and sub-line hold at 320 and 402, 1.0x and 2.0x", async () => {
    await eachCell(async (m) => {
      cell(m);
      for (const source of [
        loggedSource({
          months: months([500_000, 500_000, 500_000, 500_000]),
          basisOverride: "worst",
        }),
        loggedSource({ months: months([500_000, 500_000]) }), // tightest figures: the sub-line carries ⓘ
        loggedSource({
          months: months([300_000, 300_000, 300_000, 300_000], 360_000),
          basisOverride: "worst",
        }), // short
      ]) {
        const view = await wrap(
          <HomeSummaryCard {...cardProps(source)} />,
          m.scale,
        );
        expect(
          screen.getByText("Net free cash flow", {
            includeHiddenElements: true,
          }),
        ).toBeTruthy();
        expect(
          screen.getByText(/after spending, debts and everything set aside$/),
        ).toBeTruthy();
        // the sub-line wraps: it is never clamped, and the hero is the one figure allowed to shrink
        expectFits({ clampCount: 1 });
        expectTargets("Month details", "Full check");
        // D-107: the Judge-on dropdown joins the top row (a plain label under 3 full months)
        if (source.kind === "logged" && source.snapshot.months.length >= 3) {
          expect(screen.getByText("This month ▾")).toBeTruthy();
          expectTargets(/^Judged on /);
        }
        await view.unmount();
      }
    });
  });

  it("D-100 Month details holds the breakdown and the pots link", async () => {
    await eachCell(async (m) => {
      cell(m);
      const pots = [
        {
          id: "p1",
          kind: "pot" as const,
          target: minorUnits(120_000),
          monthlyAmount: null,
          readyBy: "2027-04-30",
          saved: minorUnits(0),
        },
      ];
      const logged = loggedSource({
        months: months([500_000, 900_000, 100_000, 700_000]),
        monthlySaving: minorUnits(30_000),
        monthlyInvesting: minorUnits(20_000),
      });
      const source =
        logged.kind === "logged"
          ? ({
              ...logged,
              pots,
              snapshot: { ...logged.snapshot, pots },
            } as SnapshotResult)
          : logged;
      const card = homeCardModel(source, null, {
        status: "ready",
        homeBasisSeen: true,
        today: TODAY,
      });
      await wrap(
        <MonthDetailsSheet
          visible
          title="Net free cash flow"
          today={TODAY}
          card={card}
          source={source}
          settings={null}
          userId="u1"
          whole={whole}
          currency="USD"
          sourcesNote="4 months of logged income, 12 expense lines this month, 1 debts and 2 accounts."
          onClose={jest.fn()}
        />,
        m.scale,
      );
      expect(screen.getByLabelText(/^Set aside for pots, /)).toBeTruthy();
      expect(screen.getByLabelText(/^Money in, /)).toBeTruthy();
      expectFits();
    });
  });

  it("D-102 the total-cost and invested rows hold at the matrix, including the fee variant", async () => {
    await eachCell(async (m) => {
      cell(m);
      const car60: CheckInputs = {
        ...carInputs,
        loan: { ...carInputs.loan, termMonths: 60 },
      };
      const src = buildDecideSnapshot(demoSource(TODAY));
      for (const extra of [
        {},
        { projectionRates: ["0", "7"] },
        { projectionRates: ["0", "7"], investHoldingFeeText: "0.5" },
      ] as Partial<CheckInputs>[]) {
        const inputs = { ...car60, ...extra };
        const p = {
          ...stepProps(inputs, {}, src),
          lastSeenBasis: null,
          revealKey: "k",
        };
        const view = await wrap(<Step3Verdict {...p} />, m.scale);
        expect(screen.getByTestId("verdict-tco")).toBeTruthy();
        const row = screen.getByText(new RegExp(`^Over 5${NBSP}years: `));
        // rows wrap with their ⓘ beside them: no clamp, no fixed height
        expect(row.props.numberOfLines).toBeUndefined();
        expect(StyleSheet.flatten(row.props.style)?.height).toBeUndefined();
        if (extra.projectionRates) {
          const inv = screen.getByText(/^Invested instead: /);
          expect(inv.props.numberOfLines).toBeUndefined();
          expect(screen.getByLabelText("About Invested instead")).toBeTruthy();
        }
        // the basis marker is the pre-R18 inline text control with hit slop; R18 does not change it
        expectFits({ clampCount: 6, smallTargets: [/^Basis: /] });
        expectTargets("About Total cost");
        await view.unmount();
      }
    });
  });

  it("D-107 the outcome card holds at the matrix, stacked or side by side, with a fallback variant", async () => {
    await eachCell(async (m) => {
      cell(m);
      const src = buildDecideSnapshot(demoSource(TODAY));
      for (const source of [src, { ...src, monthFallback: { currencies: ["EUR", "GBP"] } }]) {
        const p = { ...stepProps(carInputs, {}, source), lastSeenBasis: null, revealKey: "k" };
        expect(p.computation.basisOutcomes).toBeTruthy();
        const view = await wrap(<Step3Verdict {...p} />, m.scale);
        expect(screen.getByText("The outcome on each basis")).toBeTruthy();
        const rows = screen.getAllByTestId(/^basis-outcome-(month|worst|average)$/);
        expect(rows).toHaveLength(3);
        // 05-146: at 320 / 402 wide the real chip ("Doesn’t fit right now") never fits a third of the card on one line, so every cell stacks
        const stacked = true;
        for (const r of rows) {
          const style = StyleSheet.flatten(r.props.style);
          expect(style?.height).toBeUndefined();
          expect(style?.position).toBeUndefined();
          // side by side the three rows share the width; stacked each takes its own line
          expect(style?.flex).toBe(stacked ? undefined : 1);
        }
        for (const t of screen.getAllByText(/ (free|overspent)$/)) {
          // D-107: an amount is one unbroken line that shrinks to fit, never a mid-number break
          expect(t.props.numberOfLines).toBe(1);
          expect(t.props.adjustsFontSizeToFit).toBe(true);
        }
        await view.unmount();
      }
    });
  });

  it("D-103 the housing editor and loan switches hold at the matrix", async () => {
    await eachCell(async (m) => {
      cell(m);
      mockDebts = [
        loan("a", { name: "Home loan", is_housing: true }),
        loan("b", { name: longName }),
        loan("c", { name: "Car loan" }),
      ];
      const source = loggedSource({ housingMonthly: 150_000 as never });
      await wrap(
        <LinesCard
          source={source}
          settings={settings}
          userId="u1"
          currency="USD"
          whole={whole}
          flat
        />,
        m.scale,
      );
      await fireEvent.press(screen.getByTestId("line-row-housing"));
      expect(
        screen.getByText(
          "Your housing costs come to $1500 a month, 30% of money in.",
        ),
      ).toBeTruthy();
      expect(screen.getByText("Loans counted as housing")).toBeTruthy();
      const long = screen.getByText(longName);
      expect(long.props.numberOfLines).toBeUndefined();
      const sw = screen.getByLabelText(`This is for housing, ${longName}`);
      expect(sw.props.accessibilityRole).toBe("switch");
      expect(
        Math.max(...[StyleSheet.flatten(sw.props.style)?.minHeight ?? 0]),
      ).toBeGreaterThanOrEqual(44);
      expectFits();
    });
  });

  it("D-103 the loan switches alone hold at the matrix", async () => {
    await eachCell(async (m) => {
      cell(m);
      mockDebts = [
        loan("a", { name: "Home loan", is_housing: true }),
        loan("b", { name: longName }),
      ];
      await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />, m.scale);
      expect(screen.getAllByText("This is for housing")).toHaveLength(2);
      expectFits();
    });
  });
});
