// 06.1-53 (C-22, DB-11, H-8, DC-1 / DN-5 per OQ-53-1 A): the open-check sheet says why a row is greyed and does what each row says.
// Writers, the engine hook, the router and the inner sheets are mocked.
import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import type { DecideCheckRow } from "@/db/decideChecks";
import { toStoredV2, type CheckV2 } from "@/engine/decide/v3";
import { checkOnce } from "@/engine/decide/v3/__tests__/helpers/fixtures";
import { showToast } from "@/state/undoToast";
import { decision } from "@/test/pastFixtures";
import { wrap } from "@/test/stepProps";
import { KEY_KIND, KEY_VISITED, stepHref } from "../../check/useStepCheck";
import type { OpenCheckRowModel } from "../homeCardsModel";
import { editTarget, OpenCheckSheet } from "../OpenCheckSheet";
import { resetPushOnceForTests } from "@/shell/navigation/pushOnce";

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));
jest.mock("@/ui/haptics", () => ({
  hapticLight: jest.fn(),
  hapticSelection: jest.fn(),
}));
jest.mock("@/state/undoToast", () => ({ showToast: jest.fn() }));
const mockPass = jest.fn();
jest.mock("@/data/mutations/decideOutcome", () => ({
  useNotBuying: () => ({ pass: mockPass }),
}));
const mockDraftSave = jest.fn();
jest.mock("@/data/mutations/decideChecks", () => ({
  useRemoveDecision: () => ({ remove: jest.fn(() => "step-del") }),
  useSaveCheckDraft: () => ({ save: mockDraftSave }),
}));
// useStepCheck (stepHref, firstStepFor) sits beside its read hooks; those reads are stubbed so no client is built.
jest.mock("@/data/queries/categories", () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock("@/data/queries/decide", () => ({
  useDebts: () => ({ data: [] }),
  useDecideChecks: () => ({ data: [] }),
}));
jest.mock("@/data/queries/decideV3", () => ({
  useDecideV3: () => ({ inputs: null }),
}));
jest.mock("@/features/record/useRecordContext", () => ({
  useRecordContext: () => ({ userId: "u1", householdId: "h1" }),
}));
let mockEvaluation: unknown = null;
jest.mock("../../engine/useCheckEngine", () => ({
  useCheckEngine: () => ({ evaluation: mockEvaluation }),
}));
jest.mock("../../sheets/DatePickerSheet", () => ({
  DatePickerSheet: () => null,
}));
jest.mock("../../sheets/InstallmentPlanSheet", () => {
  const { Pressable } = require("react-native");
  return {
    InstallmentPlanSheet: ({
      visible,
      onUse,
    }: {
      visible: boolean;
      onUse: (p: unknown) => void;
    }) =>
      visible ? (
        <Pressable
          testID="plan-use"
          accessibilityRole="button"
          onPress={() =>
            onUse({
              mode: "plan",
              cadence: { unit: "month", every: 1 },
              count: 12,
              termMonths: 12,
              apr: null,
              fees: { setup: 0, perPeriod: 0, end: 0 },
              deposit: 0,
              tradeIn: 0,
              quotedPayment: null,
              firstPayment: { kind: "one_period" },
              deferredInterestTerm: false,
            })
          }
        />
      ) : null,
  };
});

const TODAY = "2026-11-12";

function rowOf(
  check: CheckV2,
  over: Partial<DecideCheckRow> = {},
): DecideCheckRow {
  return decision("c1", {
    name: "Used car",
    status: "open",
    furthest_step: 1,
    inputs: toStoredV2(check) as Record<string, unknown>,
    ...over,
  });
}

function modelOf(over: Partial<OpenCheckRowModel> = {}): OpenCheckRowModel {
  return {
    id: "c1",
    name: "Used car",
    price: 900_000,
    date: null,
    left: null,
    code: null,
    variant: null,
    once: true,
    draft: true,
    payNotChosen: false,
    changed: false,
    checkedOn: null,
    ...over,
  };
}

async function renderSheet(row: DecideCheckRow, model: OpenCheckRowModel) {
  const onDismiss = jest.fn();
  await wrap(
    <OpenCheckSheet
      visible
      check={row}
      model={model}
      currency="USD"
      today={TODAY}
      locale="en-US"
      formatMoney={(n) => `$${n / 100}`}
      formatDate={(d) => d}
      onDismiss={onDismiss}
    />,
  );
  return onDismiss;
}

const big = (): CheckV2 => ({
  ...checkOnce(900_000),
  layerAnswers: { [KEY_KIND]: "car", [KEY_VISITED]: [1, 2, 3] },
});
const small = (): CheckV2 => checkOnce(5_000);
const disabled = (label: string) =>
  screen.getByLabelText(label).props.accessibilityState.disabled;

beforeEach(() => {
  resetPushOnceForTests();
  jest.clearAllMocks();
  mockEvaluation = null;
});

describe("editTarget (H-8 CN-3, OQ-53-1 A)", () => {
  it("a big-buy draft resumes at the furthest step it reached", () => {
    expect(
      editTarget(
        { name: "Used car", furthest_step: 3 },
        { ...checkOnce(1), layerAnswers: { [KEY_KIND]: "car" } },
        true,
      ),
    ).toBe(3);
    expect(
      editTarget(
        { name: "Thing", furthest_step: 1 },
        { ...checkOnce(1), layerAnswers: { [KEY_VISITED]: [1, "x", 2] } },
        true,
      ),
    ).toBe(2);
    expect(
      editTarget({ name: "Thing", furthest_step: 9 }, checkOnce(1), true),
    ).toBe(3);
  });

  it("a big buy with nothing visited opens where the stepper starts", () => {
    expect(
      editTarget(
        { name: "Thing", furthest_step: 1 },
        { ...checkOnce(1), layerAnswers: { [KEY_KIND]: "other" } },
        true,
      ),
    ).toBe(1);
    expect(
      editTarget(
        { name: "Thing", furthest_step: 0 },
        {
          ...checkOnce(1),
          pay: { ...checkOnce(1).pay, mode: "plan" } as never,
        },
        true,
      ),
    ).toBe(1);
  });

  it("a small item, and any check with an answer, opens the Price step", () => {
    expect(
      editTarget({ name: "Coffee", furthest_step: 1 }, checkOnce(1), true),
    ).toBe(2);
    expect(
      editTarget({ name: "Used car", furthest_step: 3 }, big(), false),
    ).toBe(2);
  });
});

describe("OpenCheckSheet on a draft", () => {
  it("Edit the check on a big-buy draft at step 3 pushes the step-3 href", async () => {
    await renderSheet(rowOf(big(), { furthest_step: 3 }), modelOf());
    await fireEvent.press(screen.getByLabelText("Edit the check"));
    expect(mockPush).toHaveBeenCalledWith(stepHref(3, "c1"));
  });

  it("06.1-78 (DN-2): Edit the check routes once to the step href, even when pressed twice while the sheet closes", async () => {
    await renderSheet(rowOf(big(), { furthest_step: 3 }), modelOf());
    await fireEvent.press(screen.getByLabelText("Edit the check"));
    await fireEvent.press(screen.getByLabelText("Edit the check"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(stepHref(3, "c1"));
  });

  it("Edit the check on a small-item draft opens the Price step (OQ-53-1 A)", async () => {
    await renderSheet(
      rowOf(small(), { name: "Coffee" }),
      modelOf({ name: "Coffee" }),
    );
    await fireEvent.press(screen.getByLabelText("Edit the check"));
    expect(mockPush).toHaveBeenCalledWith(stepHref(2, "c1"));
  });

  it("greys Save for it and Mark as not buying with the answer-first line (C-22)", async () => {
    await renderSheet(rowOf(big()), modelOf());
    expect(disabled("Save for it in Grow")).toBe(true);
    expect(disabled("Mark as not buying")).toBe(true);
    expect(screen.getByTestId("need-line-answer").props.children).toBe(
      "Available once the check has an answer.",
    );
  });

  it("with no price: See today’s answer is greyed with a reason, and the draft says the price is not finished (CB-10, CS-10)", async () => {
    await renderSheet(
      rowOf(big()),
      modelOf({ price: null, payNotChosen: true }),
    );
    expect(disabled("See today’s answer")).toBe(true);
    expect(screen.getByTestId("need-line-see").props.children).toBe(
      "A price is needed to see an answer.",
    );
    expect(screen.getByTestId("open-check-not-finished").props.children).toBe(
      "Not finished: price",
    );
  });

  it("with a price but no way to pay: says how to pay is not finished (CS-10)", async () => {
    await renderSheet(rowOf(big()), modelOf({ payNotChosen: true }));
    expect(disabled("See today’s answer")).toBe(false);
    expect(screen.queryByTestId("need-line-see")).toBeNull();
    expect(screen.getByTestId("open-check-not-finished").props.children).toBe(
      "Not finished: how to pay",
    );
  });

  it("a draft with a price and a way to pay has no not-finished line", async () => {
    await renderSheet(rowOf(big()), modelOf());
    expect(screen.queryByTestId("open-check-not-finished")).toBeNull();
  });

  it("choosing installments saves the draft and says so in a toast (CC-9)", async () => {
    const onDismiss = await renderSheet(
      rowOf(big()),
      modelOf({ payNotChosen: true }),
    );
    await fireEvent.press(screen.getByLabelText("Choose how to pay"));
    await fireEvent.press(screen.getByTestId("plan-use"));
    expect(mockDraftSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", name: "Used car", furthestStep: 1 }),
    );
    expect(onDismiss).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({
      kind: "ordinary",
      text: {
        key: "decide.screens.sheetsHome.openCheck.payChosen.plan",
        params: { name: "Used car" },
      },
      stepId: null,
    });
  });
});

describe("OpenCheckSheet on a check with an answer (DB-11)", () => {
  const answered = () =>
    modelOf({
      draft: false,
      code: "fits_month",
      left: 20_000,
      checkedOn: "2026-11-10",
    });

  it("Save for it in Grow is live and opens the Save for it screen, making no goal here (CC-4, CF-5)", async () => {
    const onDismiss = await renderSheet(rowOf(big()), answered());
    expect(screen.queryByTestId("need-line-answer")).toBeNull();
    expect(screen.queryByTestId("open-check-not-finished")).toBeNull();
    expect(disabled("Save for it in Grow")).toBe(false);
    await fireEvent.press(screen.getByLabelText("Save for it in Grow"));
    expect(onDismiss).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/decide/save/[id]",
      params: { id: "c1" },
    });
    expect(mockDraftSave).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("Mark as not buying is live once the answer is worked out and passes the check", async () => {
    mockEvaluation = { result: { code: "fits_month" } };
    await renderSheet(rowOf(big()), answered());
    expect(disabled("Mark as not buying")).toBe(false);
    await fireEvent.press(screen.getByLabelText("Mark as not buying"));
    expect(mockPass).toHaveBeenCalledWith(
      expect.objectContaining({
        check: expect.objectContaining({ id: "c1" }),
        evaluation: mockEvaluation,
      }),
    );
  });

  it("See today’s answer opens the answer", async () => {
    await renderSheet(rowOf(big()), answered());
    await fireEvent.press(screen.getByLabelText("See today’s answer"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/decide/answer/[id]",
      params: { id: "c1" },
    });
  });

  it("Edit the check opens the Price step", async () => {
    await renderSheet(rowOf(big(), { furthest_step: 3 }), answered());
    await fireEvent.press(screen.getByLabelText("Edit the check"));
    expect(mockPush).toHaveBeenCalledWith(stepHref(2, "c1"));
  });
});

type J = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
/** Host nodes of the rendered JSON in document order. */
function nodesOf(node: unknown, out: J[] = []): J[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    for (const n of node) nodesOf(n, out);
    return out;
  }
  const j = node as J;
  out.push(j);
  nodesOf(j.children ?? null, out);
  return out;
}
/** How many svg glyphs sit inside the node with this testID. */
function glyphsIn(json: unknown, testID: string): number {
  const host = nodesOf(json).find((n) => n.props.testID === testID);
  return host === undefined ? -1 : nodesOf(host.children ?? null).filter((n) => n.type === 'RNSVGSvgView').length;
}

describe("OpenCheckSheet layout (06.1-58 A-SH-1, D46)", () => {
  it("an answered check shows its state badge (glyph and word), its figures and a Checked line", async () => {
    await renderSheet(
      rowOf(big()),
      modelOf({ draft: false, code: "fits_month", left: 20_000, date: "2026-12-15", checkedOn: "2026-11-10" }),
    );
    expect(screen.getByTestId("open-check-sheet-badge")).toBeTruthy();
    expect(screen.getByText("$9000 · 2026-12-15 · leaves $200")).toBeTruthy();
    expect(screen.getByTestId("open-check-checked")).toHaveTextContent("Checked 2026-11-10");
  });

  it("a draft shows the Draft badge and no Checked line", async () => {
    await renderSheet(rowOf(big()), modelOf({ checkedOn: "2026-11-10" }));
    expect(screen.getByTestId("open-check-sheet-badge")).toHaveTextContent("Draft");
    expect(screen.queryByTestId("open-check-checked")).toBeNull();
  });

  it("the actions are one grouped card; every row but Delete has a chevron", async () => {
    await renderSheet(rowOf(big()), modelOf({ draft: false, code: "fits_month", left: 20_000, checkedOn: null }));
    expect(screen.getByTestId("open-check-actions")).toBeTruthy();
    const chevrons = (key: string) => glyphsIn(screen.toJSON(), `open-check-action-${key}`);
    for (const key of ["see", "edit", "save", "pass"]) expect(chevrons(key)).toBe(1);
    expect(chevrons("delete")).toBe(0);
    expect(screen.queryByTestId("open-check-action-pay")).toBeNull();
  });

  it("records changed since the check: the note sits in its tint box", async () => {
    await renderSheet(rowOf(big()), modelOf({ draft: false, code: "fits_month", changed: true }));
    expect(screen.getByTestId("open-check-changed")).toHaveTextContent(
      "Your records changed since this check. Open it to see today’s answer.",
    );
  });
});
