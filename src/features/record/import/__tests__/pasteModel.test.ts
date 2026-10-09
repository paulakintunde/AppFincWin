import { buildPastePreview, type PastePreviewContext } from "../pasteModel";

const ctx = (over: Partial<PastePreviewContext> = {}): PastePreviewContext => ({
  parse: {
    locale: "en-GB",
    currency: "GBP",
    exponent: 2,
    today: "2026-10-06",
    month: "2026-10",
  },
  guess: {
    learned: new Map(),
    builtinIds: new Map([
      ["Housing", "cat-rent"],
      ["Income", "cat-income"],
    ]),
  },
  existing: [],
  overrides: new Map(),
  ...over,
});

describe("buildPastePreview", () => {
  it("parses ready lines, guesses categories and lists skipped lines", () => {
    const p = buildPastePreview(
      "Studio rent 1450\n+ Freelance 600\nbad line",
      ctx(),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.lines).toHaveLength(2);
    expect(p.lines[0]).toMatchObject({
      name: "Studio rent",
      amount: -145000,
      direction: "out",
      categoryId: "cat-rent",
      duplicate: false,
    });
    expect(p.lines[1]).toMatchObject({
      name: "Freelance",
      amount: 60000,
      direction: "in",
    });
    expect(p.skipped.map((s) => s.lineNo)).toEqual([3]);
  });

  it("flags a line matching an existing row as a duplicate", () => {
    const existing = [
      {
        id: "e1",
        localDate: "2026-10-06",
        amount: -145000,
        name: "Studio rent",
        externalId: null,
        importFormat: null,
      },
    ];
    const p = buildPastePreview(
      "Studio rent 1450\nCoffee 3",
      ctx({ existing }),
    );
    if (!p.ok) throw new Error("expected ok");
    expect(p.lines.map((l) => l.duplicate)).toEqual([true, false]);
  });

  it("applies a category override, including an explicit null", () => {
    const p = buildPastePreview(
      "Studio rent 1450\nCoffee 3",
      ctx({
        overrides: new Map([
          [1, "mine"],
          [2, null],
        ]),
      }),
    );
    if (!p.ok) throw new Error("expected ok");
    expect(p.lines.map((l) => l.categoryId)).toEqual(["mine", null]);
  });

  it("refuses an over-limit paste", () => {
    const text = Array.from({ length: 5001 }, (_, i) => `Item ${i} 1`).join(
      "\n",
    );
    expect(buildPastePreview(text, ctx())).toEqual({
      ok: false,
      error: "too-many-lines",
      limit: 5000,
    });
  });
});
