// The only way read-pdf-statement produces a log line (D-15 server scrubber).
// Built as an allow-list from a fresh object literal, never a redactor over
// caller data: only function name, outcome, duration, page count, byte size,
// removal flag and a closed-list error class can appear. D-15 also permits a
// "layout id"; the server never knows the layout (the phone builds it), so
// that field is absent here by construction. Never reads err.message.
import type { PdfReadError } from './contract.ts';

export const ERROR_CLASSES = [
  'PasswordException',
  'InvalidPDFException',
  'MissingPDFException',
  'FormatError',
  'UnknownErrorException',
  'AbortException',
  'StorageError',
  'ParseTimeout',
  'Other',
] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

const OUTCOMES: readonly string[] = [
  'ok',
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

export interface LogMeta {
  outcome: PdfReadError | 'ok';
  durationMs: number;
  pageCount: number | null;
  byteSize: number | null;
  removed: boolean;
  errorClass: ErrorClass | null;
}

/** Reads only err.name, matched against the closed list. */
export function errorClassOf(err: unknown): ErrorClass {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return ERROR_CLASSES.find((c) => c === name) ?? 'Other';
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
}

export function buildLogLine(meta: LogMeta): string {
  return JSON.stringify({
    fn: 'read-pdf-statement',
    outcome: OUTCOMES.includes(meta.outcome) ? meta.outcome : 'internal',
    durationMs: int(meta.durationMs),
    pageCount: int(meta.pageCount),
    byteSize: int(meta.byteSize),
    removed: Boolean(meta.removed),
    errorClass: meta.errorClass === null ? null : errorClassOf({ name: meta.errorClass }),
  });
}
