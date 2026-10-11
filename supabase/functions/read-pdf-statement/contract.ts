// Wire contract between the app and read-pdf-statement. Mirrored in src/engine/statement/pdf/types.ts;
// plan 02.1-07 adds a typecheck + Jest guard that the two stay identical.
export const STATEMENT_BUCKET = 'statement-uploads';
export const PDF_MAX_PAGES = 25; // D-07
export const PDF_MAX_BYTES = 10 * 1024 * 1024; // D-07, equals the bucket file_size_limit 10485760
export const PDF_MAX_ITEMS = 60_000; // hostile-file guard on response size
export const PDF_MAX_ITEM_CHARS = 200; // = MAX_DESCRIPTION
export const PDF_PASSWORD_MAX = 256;
export const STATEMENT_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

export interface PdfReadRequest {
  path: string;
  password?: string;
}
/** x = left edge, y = baseline (PDF units, origin bottom-left), w = run width. */
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
