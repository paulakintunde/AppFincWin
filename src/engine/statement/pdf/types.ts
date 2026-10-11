/**
 * Mirror of supabase/functions/read-pdf-statement/contract.ts (engine/ cannot import outside src).
 * Guarded by plan 02.1-07's contract typecheck.
 */
export const STATEMENT_BUCKET = 'statement-uploads';
export const PDF_MAX_PAGES = 25;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MAX_ITEMS = 60_000;
export const PDF_MAX_ITEM_CHARS = 200;
export const PDF_PASSWORD_MAX = 256;

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

export interface PdfPageText {
  n: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

export type PdfReadError =
  | 'invalid-input'
  | 'unauthorized'
  | 'not-found'
  | 'too-large'
  | 'too-many-pages'
  | 'password-required'
  | 'password-incorrect'
  | 'no-text-layer'
  | 'unreadable'
  | 'internal';

export type PdfReadResponse =
  | { ok: true; pageCount: number; pages: PdfPageText[] }
  | { ok: false; error: PdfReadError; pageCount?: number };

export interface PdfExtraction {
  pageCount: number;
  pages: PdfPageText[];
}
