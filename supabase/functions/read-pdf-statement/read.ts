// Pure read-pdf-statement core. Turns PDF bytes into positioned text and
// decides nothing else (sign, column, reconciliation stay on the phone).
//   D-10 the upload is removed in the same request, on every owned outcome.
//   D-13 nothing extracted is written server-side.
//   D-15 the only log call goes through buildLogLine (metadata only).
//   D-21 the password is used once, as the openPdf argument, and goes nowhere else.
// Zero runtime imports beyond siblings, so it loads under Deno and Jest.
import {
  PDF_MAX_BYTES,
  PDF_MAX_ITEMS,
  PDF_MAX_ITEM_CHARS,
  PDF_MAX_PAGES,
  PDF_PASSWORD_MAX,
  STATEMENT_PATH_RE,
  type PdfPageText,
  type PdfReadError,
  type PdfReadResponse,
  type PdfTextItem,
} from './contract.ts';
import { buildLogLine, errorClassOf, type ErrorClass } from './logMeta.ts';

export interface RawTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}
export interface PdfDoc {
  numPages: number;
  page(n: number): Promise<{ width: number; height: number; items: RawTextItem[] }>;
  destroy(): Promise<void>;
}
export type PdfOpenResult =
  | { kind: 'ok'; doc: PdfDoc }
  | { kind: 'password-required' }
  | { kind: 'password-incorrect' }
  | { kind: 'invalid' };
export interface ReadDeps {
  userId(): Promise<string | null>; // from the caller's verified JWT
  download(path: string): Promise<Uint8Array | null>; // service-role Storage download; null when absent
  remove(path: string): Promise<void>; // service-role Storage remove
  openPdf(bytes: Uint8Array, password: string | null): Promise<PdfOpenResult>;
  now(): number;
  log(line: string): void;
}
export type ReadResult = { status: 200 | 400 | 401 | 500; body: PdfReadResponse };

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function normalizePage(
  n: number,
  raw: { width: number; height: number; items: RawTextItem[] }
): PdfPageText {
  const items: PdfTextItem[] = [];
  for (const it of raw.items) {
    const str = String(it.str).trim().slice(0, PDF_MAX_ITEM_CHARS);
    if (str === '') continue;
    const nums = [it.x, it.y, it.w];
    if (!nums.every(Number.isFinite)) continue;
    items.push({ str, x: round1(it.x), y: round1(it.y), w: round1(it.w) });
  }
  return { n, width: round1(raw.width), height: round1(raw.height), items };
}

function fail(error: PdfReadError, pageCount?: number): PdfReadResponse {
  return pageCount === undefined ? { ok: false, error } : { ok: false, error, pageCount };
}

export async function readStatement(deps: ReadDeps, body: unknown): Promise<ReadResult> {
  const started = deps.now();
  const rec = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const path = rec !== null && typeof rec.path === 'string' ? rec.path : '';
  const pw = rec === null ? undefined : rec.password;
  const pathMatch = STATEMENT_PATH_RE.exec(path);
  const pwOk =
    pw === undefined || (typeof pw === 'string' && pw.length >= 1 && pw.length <= PDF_PASSWORD_MAX);
  if (pathMatch === null || !pwOk) {
    return { status: 400, body: fail('invalid-input') };
  }
  const password = typeof pw === 'string' ? pw : null;

  let uid: string | null;
  try {
    uid = await deps.userId();
  } catch {
    return { status: 500, body: fail('internal') };
  }
  if (uid === null) return { status: 401, body: fail('unauthorized') };
  // Foreign path: nothing downloaded, nothing removed (IDOR).
  if (pathMatch[1] !== uid) return { status: 200, body: fail('not-found') };

  let status: ReadResult['status'] = 200;
  let response: PdfReadResponse = fail('internal');
  let pageCount: number | null = null;
  let byteSize: number | null = null;
  let errorClass: ErrorClass | null = null;
  let removed = false;
  let doc: PdfDoc | null = null;
  let stage: 'storage' | 'parse' = 'storage';
  try {
    const bytes = await deps.download(path);
    if (bytes === null) {
      response = fail('not-found');
    } else {
      byteSize = bytes.length;
      if (bytes.length > PDF_MAX_BYTES) {
        response = fail('too-large');
      } else {
        stage = 'parse';
        const opened = await deps.openPdf(bytes, password);
        if (opened.kind === 'password-required') response = fail('password-required');
        else if (opened.kind === 'password-incorrect') response = fail('password-incorrect');
        else if (opened.kind === 'invalid') response = fail('unreadable');
        else {
          doc = opened.doc;
          pageCount = doc.numPages;
          if (doc.numPages > PDF_MAX_PAGES) {
            response = fail('too-many-pages', doc.numPages);
          } else {
            const pages: PdfPageText[] = [];
            let total = 0;
            let overflow = false;
            for (let n = 1; n <= doc.numPages; n++) {
              const page = normalizePage(n, await doc.page(n));
              total += page.items.length;
              if (total > PDF_MAX_ITEMS) {
                overflow = true;
                break;
              }
              pages.push(page);
            }
            if (overflow) response = fail('unreadable', doc.numPages);
            else if (total === 0) response = fail('no-text-layer', doc.numPages);
            else response = { ok: true, pageCount: doc.numPages, pages };
          }
        }
      }
    }
  } catch (err) {
    if (stage === 'storage') {
      errorClass = 'StorageError';
      status = 500;
      response = fail('internal');
    } else {
      errorClass = errorClassOf(err);
      response = fail('unreadable', pageCount ?? undefined);
    }
  } finally {
    try {
      await deps.remove(path);
      removed = true;
    } catch {
      removed = false;
    }
    if (doc !== null) await doc.destroy().catch(() => undefined);
    deps.log(
      buildLogLine({
        outcome: response.ok ? 'ok' : response.error,
        durationMs: Math.max(0, Math.round(deps.now() - started)),
        pageCount,
        byteSize,
        removed,
        errorClass,
      })
    );
  }
  return { status, body: response };
}
