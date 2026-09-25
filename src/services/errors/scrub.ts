// D-18, T-00-16-01: pure scrubbing functions. No React, no I/O, no SDK — these exist so they
// can be unit-tested exhaustively and reused from any before-send hook regardless of which
// error-tracking vendor D-19 picks. Every error message/stack frame must pass through here
// before it leaves the device.

const MAX_MESSAGE_LENGTH = 200;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const DOUBLE_QUOTED_RE = /"[^"]*"/g;
const SINGLE_QUOTED_RE = /'[^']*'/g;
// A currency symbol immediately before a digit run (£12, $3.50).
const CURRENCY_PREFIX_RE = /[£$€]\s?\d[\d,.]*/g;
// A digit run immediately (optionally spaced) before a currency symbol (12,00 €).
const CURRENCY_SUFFIX_RE = /\d[\d,.]*\s?[£$€]/g;
// Any decimal number, regardless of how many digits are on either side of the point.
const DECIMAL_RE = /\d+\.\d+/g;
// Any run of 4 or more consecutive digits (ids, spike markers, large amounts in minor units).
const DIGIT_RUN_RE = /\d{4,}/g;

/**
 * Redacts an error message down to technical, non-identifying content: emails, quoted
 * substrings (which routinely carry payee/item/account names), currency amounts and any
 * digit run of 4+, then truncates to {@link MAX_MESSAGE_LENGTH} characters.
 *
 * Redaction order is deliberate: emails, then quoted strings, then currency amounts, then
 * bare numbers, then truncation — each pass only ever narrows what a later pass can still see.
 */
export function scrubMessage(message: string): string {
  let result = message;
  result = result.replace(EMAIL_RE, '<email>');
  result = result.replace(DOUBLE_QUOTED_RE, '<str>');
  result = result.replace(SINGLE_QUOTED_RE, '<str>');
  result = result.replace(CURRENCY_PREFIX_RE, '<n>');
  result = result.replace(CURRENCY_SUFFIX_RE, '<n>');
  result = result.replace(DECIMAL_RE, '<n>');
  result = result.replace(DIGIT_RUN_RE, '<n>');
  return result.slice(0, MAX_MESSAGE_LENGTH);
}

// The only frame fields ever forwarded — enough to symbolicate against an uploaded source map
// (filename/line/column, plus the identifiers PostHog's Hermes matching uses) with nothing
// that could carry a literal value: no `vars` (locals), no `context_line`/`pre_context`/
// `post_context` (raw source text), no `instruction_addr`/`addr_mode`/`thread_id`.
const SAFE_STACK_FRAME_KEYS = [
  'filename',
  'function',
  'lineno',
  'colno',
  'module',
  'platform',
  'in_app',
  'abs_path',
  'chunk_id',
] as const;

/**
 * Returns a copy of a stack frame containing only the technical fields needed to symbolicate
 * and group an exception — never `vars` (locals) or raw source-context lines.
 */
export function scrubStackFrame<T extends object>(frame: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of SAFE_STACK_FRAME_KEYS) {
    if (key in frame) {
      (result as Record<string, unknown>)[key] = (frame as Record<string, unknown>)[key];
    }
  }
  return result;
}
