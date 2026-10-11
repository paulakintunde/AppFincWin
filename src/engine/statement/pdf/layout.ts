// Generic table reader, stage 1: positioned text -> lines -> cells -> column anchors (D-18, D-26).
// No bank presets. Anchors carry a role and a position only; header text is never kept (D-14).
import type { PdfPageText } from './types';

export interface PdfCell {
  text: string;
  x0: number;
  x1: number;
}
export interface PdfLine {
  page: number;
  y: number;
  cells: PdfCell[];
}

export const LINE_TOLERANCE = 2; // pt: baselines this close share a line
export const CELL_JOIN_GAP = 4; // pt: runs this close on a line join into one cell
export const HEADER_LINE_GAP = 14; // pt: max distance between the two lines of a split header

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
}

function toCells(runs: readonly Run[]): PdfCell[] {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  const cells: PdfCell[] = [];
  const head = sorted[0]!;
  let text = head.str;
  let x0 = head.x;
  let x1 = head.x + head.w;
  for (const r of sorted.slice(1)) {
    if (r.x - x1 <= CELL_JOIN_GAP) {
      text += (r.x - x1 < 0.5 ? '' : ' ') + r.str;
      x1 = Math.max(x1, r.x + r.w);
    } else {
      cells.push({ text: collapse(text), x0, x1 });
      text = r.str;
      x0 = r.x;
      x1 = r.x + r.w;
    }
  }
  cells.push({ text: collapse(text), x0, x1 });
  return cells;
}

export function groupLines(pages: readonly PdfPageText[]): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const page of pages) {
    const items = page.items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y);
    let bucket: Run[] = [];
    const flush = (): void => {
      if (bucket.length > 0) lines.push({ page: page.n, y: bucket[0]!.y, cells: toCells(bucket) });
      bucket = [];
    };
    for (const item of items) {
      if (bucket.length > 0 && Math.abs(item.y - bucket[0]!.y) > LINE_TOLERANCE) flush();
      bucket.push(item);
    }
    flush();
  }
  return lines;
}

const NUMERIC_SHAPE = /^[-+(]?[£$€]?[-+]?(\d[\d,.   ']*)\)?(?: ?(?:OD|CR|DR)|-)?$/i;

export function looksNumeric(text: string): boolean {
  const m = NUMERIC_SHAPE.exec(text.trim());
  if (m === null) return false;
  const body = m[1]!.replace(/[\s  ']+$/, '');
  return /^\d{1,12}$/.test(body) || /[.,]\d{2}$/.test(body);
}

export type ColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'other';
type NamedRole = Exclude<ColumnRole, 'other'>;

// Payments and charges are deliberately absent: their direction differs between bank and card statements.
export const HEADER_VOCABULARY: Readonly<Record<NamedRole, readonly string[]>> = {
  date: ['DATE', 'TRANSACTION DATE', 'TRANS DATE', 'POSTING DATE', 'POST DATE', 'POSTED', 'VALUE DATE'],
  description: ['DESCRIPTION', 'DETAILS', 'TRANSACTION DETAILS', 'TRANSACTION', 'PARTICULARS', 'NARRATIVE', 'MERCHANT', 'PAYEE'],
  amount: ['AMOUNT', 'VALUE'],
  debit: ['DEBIT', 'DEBITS', 'PAID OUT', 'MONEY OUT', 'WITHDRAWALS', 'WITHDRAWAL', 'OUT'],
  credit: ['CREDIT', 'CREDITS', 'PAID IN', 'MONEY IN', 'DEPOSITS', 'DEPOSIT', 'RECEIPTS', 'IN'],
  balance: ['BALANCE', 'RUNNING BALANCE', 'AVAILABLE BALANCE', 'AVAILABLE CREDIT'],
};

const VOCAB_LOOKUP: ReadonlyMap<string, NamedRole> = new Map(
  (Object.keys(HEADER_VOCABULARY) as NamedRole[]).flatMap((role) => HEADER_VOCABULARY[role].map((w): [string, NamedRole] => [w, role])),
);

function normaliseHeader(text: string): string {
  const up = collapse(text).toUpperCase().replace(/:$/, '');
  return up.replace(/\s*(?:\((?:£|\$|€|GBP|USD|EUR)\)|£)$/, '').trim();
}

export function matchHeaderCell(text: string): NamedRole | null {
  return VOCAB_LOOKUP.get(normaliseHeader(text)) ?? null;
}

export interface ColumnAnchor {
  role: ColumnRole;
  x0: number;
  x1: number;
}
export interface HeaderMatch {
  line: number;
  span: 1 | 2;
  anchors: ColumnAnchor[];
  availableLabel: boolean;
}

interface Candidate {
  cells: PdfCell[];
  matched: number;
  isHeader: boolean;
}

function evaluate(cells: readonly PdfCell[]): Candidate {
  const roles = cells.map((c) => matchHeaderCell(c.text)).filter((r): r is NamedRole => r !== null);
  const distinct = new Set(roles);
  const isHeader =
    roles.length >= 3 &&
    distinct.size === roles.length &&
    distinct.has('date') &&
    (distinct.has('amount') || distinct.has('debit') || distinct.has('credit'));
  return { cells: [...cells], matched: roles.length, isHeader };
}

function overlapsEnough(a: PdfCell, b: PdfCell): boolean {
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const narrower = Math.min(a.x1 - a.x0, b.x1 - b.x0);
  return overlap >= 0.5 * narrower;
}

function mergeCells(top: readonly PdfCell[], bottom: readonly PdfCell[]): PdfCell[] {
  const used = new Set<number>();
  const merged = top.map((t): PdfCell => {
    const j = bottom.findIndex((b, k) => !used.has(k) && overlapsEnough(t, b));
    if (j === -1) return t;
    used.add(j);
    const b = bottom[j]!;
    return { text: `${t.text} ${b.text}`, x0: Math.min(t.x0, b.x0), x1: Math.max(t.x1, b.x1) };
  });
  bottom.forEach((b, k) => {
    if (!used.has(k)) merged.push(b);
  });
  return merged.sort((p, q) => p.x0 - q.x0);
}

function toMatch(index: number, span: 1 | 2, cand: Candidate): HeaderMatch {
  const anchors: ColumnAnchor[] = [];
  let availableLabel = false;
  for (const c of cand.cells) {
    const role = matchHeaderCell(c.text);
    if (role === 'balance' && normaliseHeader(c.text).startsWith('AVAILABLE')) availableLabel = true;
    anchors.push({ role: role ?? 'other', x0: c.x0, x1: c.x1 });
  }
  return { line: index, span, anchors, availableLabel };
}

export function findHeaders(lines: readonly PdfLine[]): HeaderMatch[] {
  const found: HeaderMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]!;
    const plain = evaluate(cur.cells);
    if (plain.matched < 2) continue;
    const next = lines[i + 1] as PdfLine | undefined;
    if (next !== undefined && next.page === cur.page && Math.abs(cur.y - next.y) <= HEADER_LINE_GAP) {
      const merged = evaluate(mergeCells(cur.cells, next.cells));
      if (merged.isHeader && (!plain.isHeader || merged.matched > plain.matched)) {
        found.push(toMatch(i, 2, merged));
        i++;
        continue;
      }
    }
    if (plain.isHeader) found.push(toMatch(i, 1, plain));
  }
  return found;
}

export type Placement = { kind: 'column'; role: ColumnRole } | { kind: 'between'; roles: ['debit', 'credit'] };

const NUMERIC_ROLES: readonly ColumnRole[] = ['amount', 'debit', 'credit', 'balance'];
const TEXT_ROLES: readonly ColumnRole[] = ['date', 'description', 'other'];
const mid = (a: { x0: number; x1: number }): number => (a.x0 + a.x1) / 2;

export function placeCell(cell: PdfCell, anchors: readonly ColumnAnchor[]): Placement {
  if (!looksNumeric(cell.text)) {
    const pool = anchors.filter((a) => TEXT_ROLES.includes(a.role));
    const best = [...pool].sort((a, b) => Math.abs(cell.x0 - a.x0) - Math.abs(cell.x0 - b.x0))[0] as ColumnAnchor | undefined;
    return { kind: 'column', role: best?.role ?? 'description' };
  }
  const ranked = anchors
    .filter((a) => NUMERIC_ROLES.includes(a.role))
    .map((a) => ({ a, d: Math.min(Math.abs(cell.x1 - a.x1), Math.abs(mid(cell) - mid(a))) }))
    .sort((p, q) => p.d - q.d);
  if (ranked.length === 0) return { kind: 'column', role: 'other' };
  if (ranked.length >= 2) {
    const first = ranked[0]!;
    const second = ranked[1]!;
    const pair = [first.a.role, second.a.role];
    if (pair.includes('debit') && pair.includes('credit')) {
      const gap = Math.abs(mid(first.a) - mid(second.a));
      if (second.d - first.d < 0.25 * gap) return { kind: 'between', roles: ['debit', 'credit'] };
    }
  }
  return { kind: 'column', role: ranked[0]!.a.role };
}
