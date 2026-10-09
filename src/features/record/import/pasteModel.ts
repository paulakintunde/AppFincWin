// REC-21 (CONTEXT D-20, D-21): the pure preview behind the "Paste to add" sheet. Parses the
// pasted text with the strict engine parser, guesses a category per ready line with the
// existing rules, and flags lines that look like rows already stored. No React, no I/O.
import {
  DEFAULT_KEYWORD_RULES,
  guessCategory,
  type GuessContext,
} from "@/engine/categorize";
import {
  parseLines,
  type ParsedLine,
  type PasteContext,
  type PasteSkip,
} from "@/engine/paste";
import { findDuplicates, type ExistingRow } from "@/engine/statement";

export interface PasteLinePreview extends ParsedLine {
  categoryId: string | null;
  duplicate: boolean;
}

export type PastePreview =
  | { ok: true; lines: PasteLinePreview[]; skipped: PasteSkip[] }
  | { ok: false; error: "too-many-lines"; limit: number };

export interface PastePreviewContext {
  parse: PasteContext;
  /** keywordRules defaults to DEFAULT_KEYWORD_RULES. */
  guess: Omit<GuessContext, "keywordRules"> & {
    keywordRules?: GuessContext["keywordRules"];
  };
  existing: readonly ExistingRow[];
  /** Per-line category the user chose, keyed by lineNo; null is an explicit "Uncategorised". */
  overrides: ReadonlyMap<number, string | null>;
}

export function buildPastePreview(
  text: string,
  ctx: PastePreviewContext,
): PastePreview {
  const parsed = parseLines(text, ctx.parse);
  if (!parsed.ok) return parsed;

  const guessContext: GuessContext = {
    ...ctx.guess,
    keywordRules: ctx.guess.keywordRules ?? DEFAULT_KEYWORD_RULES,
  };
  const { matches } = findDuplicates(
    parsed.rows.map((r, index) => ({
      index,
      localDate: r.localDate,
      amount: r.amount,
      name: r.name,
      externalId: null,
    })),
    ctx.existing,
    { sourceFormat: "csv" },
  );

  const lines = parsed.rows.map((row, index): PasteLinePreview => {
    const override = ctx.overrides.get(row.lineNo);
    const categoryId =
      override !== undefined
        ? override
        : guessCategory({ name: row.name, amount: row.amount }, guessContext)
            .categoryId;
    return { ...row, categoryId, duplicate: matches.has(index) };
  });
  return { ok: true, lines, skipped: parsed.skipped };
}
