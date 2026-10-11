// Everything the read-pdf-statement function returns is untrusted: it is derived from an uploaded file.
// Structural checks only, with the same caps as the server. Returns a fresh object, or null on any deviation.
import { PDF_MAX_ITEMS, PDF_MAX_ITEM_CHARS, PDF_MAX_PAGES } from './types';
import type { PdfPageText, PdfReadError, PdfReadResponse, PdfTextItem } from './types';

const ERROR_CODES: readonly string[] = [
  'invalid-input',
  'unauthorized',
  'not-found',
  'too-large',
  'too-many-pages',
  'password-required',
  'password-incorrect',
  'no-text-layer',
  'unreadable',
  'internal',
];

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseItem(v: unknown): PdfTextItem | null {
  if (!isRecord(v)) return null;
  const { str, x, y, w } = v;
  if (typeof str !== 'string' || str.length > PDF_MAX_ITEM_CHARS) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w)) return null;
  return { str, x, y, w };
}

function parsePage(v: unknown): PdfPageText | null {
  if (!isRecord(v)) return null;
  const { n, width, height, items } = v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || !Array.isArray(items)) return null;
  const parsed: PdfTextItem[] = [];
  for (const raw of items) {
    const it = parseItem(raw);
    if (it === null) return null;
    parsed.push(it);
  }
  return { n, width, height, items: parsed };
}

export function parsePdfReadResponse(data: unknown): PdfReadResponse | null {
  if (!isRecord(data)) return null;
  if (data.ok === false) {
    const { error, pageCount } = data;
    if (typeof error !== 'string' || !ERROR_CODES.includes(error)) return null;
    if (pageCount === undefined) return { ok: false, error: error as PdfReadError };
    if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 0) return null;
    return { ok: false, error: error as PdfReadError, pageCount };
  }
  if (data.ok !== true) return null;
  const { pageCount, pages } = data;
  if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > PDF_MAX_PAGES) return null;
  if (!Array.isArray(pages) || pages.length !== pageCount) return null;
  // Size cap first, so a hostile response is rejected before any per-item work.
  let total = 0;
  for (const p of pages) {
    const count = isRecord(p) && Array.isArray(p.items) ? p.items.length : 0;
    total += count;
    if (total > PDF_MAX_ITEMS) return null;
  }
  const parsed: PdfPageText[] = [];
  for (const raw of pages) {
    const page = parsePage(raw);
    if (page === null) return null;
    parsed.push(page);
  }
  return { ok: true, pageCount, pages: parsed };
}
