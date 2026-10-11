// Generic table reader, stage 3: raw rows and statement figures -> Phase 2's StatementDraft (D-40, D-43, D-45).
// Deterministic and string-only: every amount goes through the Phase 2 notation reader, nothing is signed here
// (the format profile decides that), and anything the reader is not sure of carries a pdf-* issue (D-23).
// Nothing in this file logs or throws for statement content (D-15).
import { notationFor, inferNumberNotation } from '../../csv/inferFormat';
import { markerSign, parseNotatedAmount } from '../../money';
import type { AmountMarker, MinorUnits, NumberNotation } from '../../money';
import { parseForeignNote } from '../foreign';
import { MAX_DESCRIPTION, MAX_LAYOUT_SIGNATURE, MAX_RAW_CELL } from '../types';
import type { DraftRow, DraftRowIssue, ForeignAmount, DraftWarning, LabelEvidence, StatedBalance, StatementDraft } from '../types';
import { balanceStep, learnDebitDirection, pickByDelta } from './balanceDelta';
import { assignYears, numericOrder, parsePdfDate, parsePeriod, resolveNumeric } from './dates';
import type { PdfDateParts } from './dates';
import { buildLayoutFingerprint } from './layoutFingerprint';
import type { LayoutFingerprint } from './layoutFingerprint';
import { groupLines } from './layout';
import type { ColumnRole, PdfLine } from './layout';
import { assembleTable, findSections } from './rows';
import type { AssembledTable, RawRow } from './rows';
import type { PdfExtraction } from './types';

export interface PdfDraftOptions {
  accountCurrency: string; // D-12: used when the PDF shows no currency
  exponentFor(code: string): number | null;
  dayFirst: boolean; // region default for ambiguous numeric dates
  decimalMark: '.' | ','; // region default when notation is ambiguous
  today: string; // 'YYYY-MM-DD' (D-27 question only)
  yearOverride: { section: number; year: number } | null;
}

export interface PdfDraft {
  draft: StatementDraft;
  yearQuestion: [number, number] | null;
  sectionLabel: 'checking' | 'savings' | 'card' | null;
}

export type PdfDraftResult = { kind: 'drafts'; drafts: PdfDraft[] } | { kind: 'unreadable'; fingerprint: LayoutFingerprint };

type Cell = { ok: true; magnitude: MinorUnits; marker: AmountMarker } | { ok: false; error: DraftRowIssue };

interface Ctx {
  notation: NumberNotation;
  exponent: number;
}

interface RowAmount {
  magnitude: MinorUnits | null;
  marker: AmountMarker;
  raw: string | null;
  issues: DraftRowIssue[];
}

const clip = (s: string): string => s.slice(0, MAX_RAW_CELL);
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

function add(issues: DraftRowIssue[], code: DraftRowIssue): void {
  issues.push(code);
}

function parseCell(text: string, ctx: Ctx): Cell {
  const r = parseNotatedAmount(text, ctx.notation, ctx.exponent);
  if (r.ok) return r;
  if (r.error === 'too-large') return { ok: false, error: 'amount-too-large' };
  if (r.error === 'conflicting-markers') return { ok: false, error: 'conflicting-markers' };
  return { ok: false, error: 'bad-amount' };
}

function signedOf(c: Cell | null): number | null {
  return c !== null && c.ok ? markerSign(c.marker) * c.magnitude : null;
}

function failed(code: DraftRowIssue, raw: string | null): RowAmount {
  return { magnitude: null, marker: 'none', raw, issues: [code] };
}

function fromCell(c: Cell, raw: string, marker: (m: AmountMarker) => AmountMarker): RowAmount {
  return c.ok ? { magnitude: c.magnitude, marker: marker(c.marker), raw, issues: [] } : failed(c.error, raw);
}

function detectCurrency(texts: readonly string[]): string | null {
  const found = new Set<string>();
  for (const t of texts) {
    if (t.includes('£')) found.add('GBP');
    if (t.includes('€')) found.add('EUR');
  }
  return found.size === 1 ? [...found][0]! : null;
}

function allNumericTexts(table: AssembledTable): string[] {
  const out: string[] = [];
  for (const r of table.rows) {
    for (const t of [r.amountText, r.debitText, r.creditText, r.balanceText, ...(r.candidates ?? [])]) {
      if (t !== null) out.push(t);
    }
  }
  const s = table.summary;
  for (const t of [s.openingText, s.closingText, s.limitText, s.availableText]) {
    if (t !== null) out.push(t);
  }
  return out;
}

function statedFrom(text: string | null, ctx: Ctx, asOf: string | null): StatedBalance | null {
  if (text === null) return null;
  const c = parseCell(text, ctx);
  return c.ok ? { magnitude: c.magnitude, marker: c.marker, asOf, raw: clip(text) } : null;
}

function headerlessAmount(cands: readonly string[], prev: number | null, cur: number | null, ctx: Ctx): RowAmount {
  const parsed = cands.map((t) => parseCell(t, ctx));
  const first = parsed[0]!; // the row reader only emits headerless rows with at least one candidate
  if (prev !== null && cur !== null) {
    const mags = parsed.map((c) => (c.ok ? c.magnitude : -1));
    const pick = pickByDelta(prev, cur, mags);
    if (pick !== null) {
      return { magnitude: mags[pick.index] as MinorUnits, marker: pick.step > 0 ? 'plus' : 'minus', raw: clip(cands[pick.index]!), issues: [] };
    }
  } else if (parsed.length === 1) {
    return fromCell(first, clip(cands[0]!), (m) => m);
  }
  const base = fromCell(first, clip(cands[0]!), () => 'none');
  add(base.issues, 'pdf-ambiguous-column');
  return base;
}

function bothColumnsAmount(r: RawRow, ctx: Ctx): RowAmount {
  const raw = clip(`${r.debitText} | ${r.creditText}`);
  const debit = parseCell(r.debitText!, ctx);
  const credit = parseCell(r.creditText!, ctx);
  if (!debit.ok) return failed(debit.error, raw);
  if (!credit.ok) return failed(credit.error, raw);
  const net = credit.magnitude - debit.magnitude;
  return { magnitude: Math.abs(net) as MinorUnits, marker: net > 0 ? 'cr' : 'dr', raw, issues: ['pdf-ambiguous-column'] };
}

function betweenAmount(r: RawRow, prev: number | null, cur: number | null, learned: 1 | -1 | null, ctx: Ctx): RowAmount {
  const c = parseCell(r.amountText!, ctx);
  const raw = clip(r.amountText!);
  if (!c.ok) return failed(c.error, raw);
  const step = prev !== null && cur !== null ? balanceStep(prev, cur, c.magnitude) : null;
  if (step === null || learned === null) return { magnitude: c.magnitude, marker: 'none', raw, issues: ['pdf-ambiguous-column'] };
  return { magnitude: c.magnitude, marker: step === learned ? 'dr' : 'cr', raw, issues: [] };
}

function columnAmount(r: RawRow, ctx: Ctx): RowAmount {
  const column = r.amountColumn;
  const text = column === 'amount' ? r.amountText : column === 'debit' ? r.debitText : column === 'credit' ? r.creditText : null;
  if (text === null) return failed('bad-amount', null);
  const c = parseCell(text, ctx);
  const raw = clip(text);
  if (column === 'amount') return fromCell(c, raw, (m) => m);
  const wrong = column === 'debit' ? 'cr' : 'dr';
  if (c.ok && c.marker === wrong) return failed('conflicting-markers', raw);
  return fromCell(c, raw, () => (column === 'debit' ? 'dr' : 'cr'));
}

// IMP-05 / D-30, D-35: the first recognised foreign note on a continuation line. The description and the
// wrapped-description flag are untouched, so the row still needs review (D-23).
function foreignOf(parts: readonly string[], currency: string, ctx: Ctx, opts: PdfDraftOptions): ForeignAmount | null {
  for (const part of parts.slice(1)) {
    const hit = parseForeignNote(part, { notation: ctx.notation, exponentFor: opts.exponentFor });
    if (hit !== null && hit.currency !== currency) return hit;
  }
  return null;
}

function readSegment(table: AssembledTable, index: number, label: PdfDraft['sectionLabel'], opts: PdfDraftOptions): PdfDraft {
  const texts = allNumericTexts(table);
  const guess = inferNumberNotation(texts);
  const warnings: DraftWarning[] = [];
  let notation: NumberNotation;
  if (guess.kind === 'ambiguous') notation = notationFor(opts.decimalMark);
  else {
    notation = guess.notation;
    if (guess.kind === 'mixed-grouping') warnings.push('mixed-grouping');
  }
  if (table.summary.summaryLinesRemoved) warnings.push('summary-lines-removed');

  const detected = detectCurrency(texts);
  const currency = detected ?? opts.accountCurrency;
  const exponent = opts.exponentFor(currency);
  const ctx: Ctx = { notation, exponent: exponent ?? 2 };

  // ---- dates ----
  const parsedDates = table.rows.map((r) => (r.dateText === null ? null : parsePdfDate(r.dateText)));
  const numerics = parsedDates.filter((p): p is Extract<NonNullable<typeof p>, { kind: 'numeric' }> => p !== null && p.kind === 'numeric');
  const periodLine = table.summary.periodLine;
  const periodTokens = (periodLine ?? '').split(/\s+/).map((t) => parsePdfDate(t));
  const periodNumerics = periodTokens.filter((p): p is Extract<NonNullable<typeof p>, { kind: 'numeric' }> => p !== null && p.kind === 'numeric');
  const order = numericOrder([...numerics, ...periodNumerics]);
  const orderUsed: 'DMY' | 'MDY' = order === 'DMY' || order === 'MDY' ? order : opts.dayFirst ? 'DMY' : 'MDY';
  const period = periodLine === null ? null : parsePeriod(periodLine, orderUsed === 'DMY');

  const issues: DraftRowIssue[][] = table.rows.map(() => []);
  let previous: PdfDateParts | null = null;
  const parts: (PdfDateParts | null)[] = parsedDates.map((p, i) => {
    let found: PdfDateParts | null;
    if (p === null) {
      found = previous;
      add(issues[i]!, 'pdf-no-date');
    } else if (p.kind === 'numeric') {
      found = order === 'invalid' ? null : resolveNumeric(p, orderUsed);
      if (order === 'ambiguous') add(issues[i]!, 'pdf-ambiguous-date');
    } else {
      found = p.parts;
    }
    previous = found;
    return found;
  });
  const years = assignYears(parts, period ?? { start: null, end: null }, {
    today: opts.today,
    firstRowYear: opts.yearOverride !== null && opts.yearOverride.section === index ? opts.yearOverride.year : null,
  });

  // ---- balances and figures ----
  const periodStart = period === null ? null : period.start;
  const periodEnd = period === null ? null : period.end;
  const statedOpening = statedFrom(table.summary.openingText, ctx, periodStart);
  const statedClosing = statedFrom(table.summary.closingText, ctx, periodEnd);
  const available = statedFrom(table.summary.availableText, ctx, periodEnd);
  const limit = statedFrom(table.summary.limitText, ctx, null);
  const statedLimit = limit === null ? null : limit.magnitude;

  const balances = table.rows.map((r) => (r.balanceText === null ? null : parseCell(r.balanceText, ctx)));
  const signed = balances.map(signedOf);
  const openingSigned = statedOpening === null ? null : markerSign(statedOpening.marker) * statedOpening.magnitude;
  const before = (i: number): number | null => (i === 0 ? openingSigned : (signed[i - 1] as number | null));

  const samples: { column: 'debit' | 'credit'; step: 1 | -1 }[] = [];
  table.rows.forEach((r, i) => {
    const column = r.amountColumn;
    if ((column !== 'debit' && column !== 'credit') || r.flags.includes('both-columns')) return;
    const prev = before(i);
    const cur = signed[i] as number | null;
    const c = parseCell((column === 'debit' ? r.debitText : r.creditText) as string, ctx);
    if (!c.ok || prev === null || cur === null) return;
    const step = balanceStep(prev, cur, c.magnitude);
    if (step !== null) samples.push({ column, step });
  });
  const learned = learnDebitDirection(samples);

  // ---- rows ----
  const rows: DraftRow[] = table.rows.map((r, i) => {
    const prev = before(i);
    const cur = signed[i] as number | null;
    let amount: RowAmount;
    if (r.candidates !== null) amount = headerlessAmount(r.candidates, prev, cur, ctx);
    else if (r.flags.includes('both-columns')) amount = bothColumnsAmount(r, ctx);
    else if (r.amountColumn === 'between') amount = betweenAmount(r, prev, cur, learned, ctx);
    else amount = columnAmount(r, ctx);

    const own = issues[i]!;
    if (amount.magnitude === 0) add(own, 'zero-amount');
    for (const code of amount.issues) add(own, code);
    const bal = balances[i] as Cell | null;
    if (bal !== null && !bal.ok) add(own, 'bad-balance');
    if (exponent === null) add(own, 'unknown-currency');
    const description = collapse(r.descriptionParts.join(' ')).slice(0, MAX_DESCRIPTION);
    if (description === '') add(own, 'empty-description');
    if (r.flags.includes('wrapped')) add(own, 'pdf-wrapped-description');
    const date = years.dates[i] as string | null;
    if (date === null) add(own, 'bad-date');
    if (years.outOfPeriod[i]) add(own, 'pdf-ambiguous-date');

    return {
      index: i,
      localDate: date,
      description,
      magnitude: amount.magnitude,
      marker: amount.marker,
      rawAmount: amount.raw,
      balanceMagnitude: bal !== null && bal.ok ? bal.magnitude : null,
      balanceMarker: bal !== null && bal.ok ? bal.marker : 'none',
      rawBalance: r.balanceText === null ? null : clip(r.balanceText),
      currency,
      externalId: null,
      trnType: null,
      issues: [...new Set(own)],
      foreign: foreignOf(r.descriptionParts, currency, ctx, opts),
    };
  });

  // ---- labels ----
  const labels: LabelEvidence[] = [];
  if (table.roles.includes('debit') && table.roles.includes('credit')) labels.push('debit-credit-columns');
  const amountRows = rows.filter((_, i) => table.rows[i]!.amountColumn === 'amount');
  if (amountRows.length > 0 && amountRows.every((r) => r.marker === 'dr' || r.marker === 'cr')) labels.push('dr-cr-markers');
  if (table.availableLabel) labels.push('available-balance-label');
  if (statedLimit !== null) labels.push('limit-label');
  if (rows.some((r) => r.balanceMarker === 'od')) labels.push('od-marker');

  let accountHint: StatementDraft['accountHint'] = null;
  if (label === 'card') accountHint = 'card';
  else if (label !== null) accountHint = 'bank';
  else if (table.summary.cardHint) accountHint = 'card';
  else if (table.summary.bankHint) accountHint = 'bank';

  const roles: ColumnRole[] = table.roles;
  const draft: StatementDraft = {
    source: 'pdf',
    layoutSignature: `pdf|${table.mode}|${roles.join(',')}|${notation.decimal}`.slice(0, MAX_LAYOUT_SIGNATURE),
    accountHint,
    currency: detected,
    rows,
    statedOpening,
    statedClosing,
    available,
    statedLimit,
    balanceLabel: table.availableLabel ? 'available' : null,
    labels,
    periodStart,
    periodEnd,
    warnings,
  };
  return { draft, yearQuestion: years.question, sectionLabel: label };
}

export function pdfToDrafts(extraction: PdfExtraction, opts: PdfDraftOptions): PdfDraftResult {
  const lines = groupLines(extraction.pages);
  const spans = findSections(lines);
  const segments: { lines: PdfLine[]; label: PdfDraft['sectionLabel'] }[] =
    spans.length >= 2
      ? spans.map((s) => ({ lines: [...lines.slice(0, spans[0]!.fromLine), ...lines.slice(s.fromLine, s.toLine + 1)], label: s.label }))
      : [{ lines, label: null }];

  const drafts: PdfDraft[] = [];
  let failure: LayoutFingerprint | null = null;
  for (const seg of segments) {
    const table = assembleTable(seg.lines);
    if (table === null || table.rows.length === 0) {
      failure ??= buildLayoutFingerprint({
        failedStep: table === null ? 'no_table' : 'no_rows',
        pageCount: extraction.pageCount,
        roles: table === null ? [] : table.roles,
      });
      continue;
    }
    drafts.push(readSegment(table, drafts.length, seg.label, opts));
  }
  if (drafts.length === 0) {
    return { kind: 'unreadable', fingerprint: failure as LayoutFingerprint };
  }
  return { kind: 'drafts', drafts };
}
