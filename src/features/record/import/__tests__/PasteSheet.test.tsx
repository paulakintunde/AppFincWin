// REC-21: the "Paste to add" sheet. Data hooks are mocked; the preview model and the engine
// parser run for real.
import React from "react";
import { fireEvent, render, screen, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PasteSheet } from "../PasteSheet";

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

const mockAdd = jest.fn();
const mockShowToast = jest.fn();
jest.mock("@/data/mutations/pasteLines", () => ({
  usePasteLines: () => ({ add: (...a: unknown[]) => mockAdd(...a) }),
}));
jest.mock("@/state/undoToast", () => ({
  ...jest.requireActual("@/state/undoToast"),
  showToast: (...a: unknown[]) => mockShowToast(...a),
}));
jest.mock("@/services/supabase", () => ({ supabase: {} }));
jest.mock("@/db/transactions", () => ({
  fetchCategorisedNames: jest.fn(async () => []),
}));
jest.mock("@/services/locale/deviceLocale", () => ({
  useDeviceLocale: () => ({
    locale: "en-GB",
    timeZone: "UTC",
    separators: { decimal: ".", group: "," },
  }),
}));
jest.mock("@/features/record/useRecordContext", () => ({
  useRecordContext: () => ({
    ready: true,
    userId: "u1",
    householdId: "h1",
    homeCurrency: "GBP",
    showCents: true,
    region: "GB",
    timeZone: "UTC",
    today: "2026-10-06",
  }),
}));
jest.mock("@/data/queries/accounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "a1",
        name: "Current",
        currency: "GBP",
        kind: "checking",
        archived_at: null,
      },
    ],
  }),
}));
jest.mock("@/data/queries/activity", () => ({
  useMonthView: () => ({
    rows: [
      {
        id: "x1",
        account_id: "a1",
        created_at: "2026-10-01T00:00:00Z",
        local_date: "2026-10-06",
        original_amount: -300,
        name: "Coffee",
        external_id: null,
        import_format: null,
      },
    ],
  }),
}));
jest.mock("@/data/queries/categories", () => {
  const housing = {
    id: "c1",
    builtin_key: "Housing",
    name: "Housing",
    color_key: "teal",
    is_system: false,
    archived_at: null,
  };
  return {
    useCategoryLookup: () => ({
      all: [housing],
      active: [housing],
      byId: new Map([["c1", housing]]),
      builtinIds: new Map([["Housing", "c1"]]),
      transferCategoryId: "tc",
      loading: false,
    }),
  };
});

async function renderSheet(
  props: Partial<React.ComponentProps<typeof PasteSheet>> = {},
) {
  const onClose = jest.fn();
  const onCsv = jest.fn();
  const qc = new QueryClient();
  const utils = await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <PasteSheet
          visible
          month="2026-10"
          onClose={onClose}
          onCsv={onCsv}
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onClose, onCsv };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("PasteSheet", () => {
  it("shows the title, helper, no privacy claim, and the empty-submit note", async () => {
    await renderSheet();
    expect(screen.getByText("Paste to add")).toBeTruthy();
    expect(screen.queryByText(/never uploaded/)).toBeNull();
    await fireEvent.press(screen.getByText("Add 0 lines"));
    expect(screen.getByText("Paste a few lines first.")).toBeTruthy();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("previews ready lines with a guessed category and flags a possible duplicate", async () => {
    await renderSheet();
    await fireEvent.changeText(
      screen.getByLabelText("Lines to add"),
      "Studio rent 1450\nCoffee 3",
    );
    expect(screen.getByText("2 lines ready")).toBeTruthy();
    expect(screen.getByText("Add 2 lines")).toBeTruthy();
    expect(screen.getByLabelText("Studio rent: Housing")).toBeTruthy();
    expect(screen.getByText(/Possible duplicate/)).toBeTruthy();
  });

  it("CSV file… calls onCsv", async () => {
    const { onCsv } = await renderSheet();
    await fireEvent.press(screen.getByText("CSV file…"));
    expect(onCsv).toHaveBeenCalled();
  });

  it("adds the ready lines once, closes, and queues a skipped toast", async () => {
    jest.useFakeTimers();
    const { onClose } = await renderSheet();
    await fireEvent.changeText(
      screen.getByLabelText("Lines to add"),
      "Studio rent 1450\nbad line\nworse",
    );
    expect(screen.getByText("1 ready, 2 skipped")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add 1 line"));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toMatchObject({
      accountId: "a1",
      currency: "GBP",
      month: "2026-10",
      lines: [
        expect.objectContaining({
          name: "Studio rent",
          amount: -145000,
          categoryId: "c1",
        }),
      ],
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(3300);
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      kind: "info",
      text: {
        key: "importCsv.paste.skipped",
        params: { count: 2, lines: "line 2, line 3" },
      },
    });
    jest.useRealTimers();
  });
});
