/**
 * OFX/QFX header split and linear-time tokenizer (D-39; RESEARCH §A1).
 *
 * `ofx-js`, the one candidate dependency researched for this feature, applies
 * a nested-quantifier regex to every OFX 1.x (SGML) file and was measured
 * with catastrophic backtracking -- a 26-character dotless tag took 4.9s.
 * Nothing here uses a regular expression over file content: both functions
 * below are a single hand-written character scan, in the same style as
 * `engine/money/parseAmount.ts`, so a hostile or malformed file costs time
 * linear in its length and can never freeze the JS thread.
 *
 * Neither function ever throws for malformed content, and neither ever
 * includes file content in a thrown error or a console call -- failures and
 * warnings are typed enum codes only (RESEARCH Security extension V7).
 */

export const OFX_LIMITS = { maxBytes: 5 * 1024 * 1024, maxElements: 20_000, maxDepth: 64 } as const;

export type OfxToken = { t: 'open'; name: string } | { t: 'close'; name: string } | { t: 'text'; value: string };

export type OfxError = 'no-ofx-root' | 'too-large' | 'too-deep';

export type SplitOfxHeaderResult =
  | { ok: true; version: string | null; charset: string | null; body: string }
  | { ok: false; error: 'no-ofx-root' };

export type TokenizeOfxResult = { ok: true; tokens: OfxToken[] } | { ok: false; error: OfxError };

// --- Header split -----------------------------------------------------

/**
 * Finds the marker `key + ':'` at the start of a line within `header` (the
 * text before the first `<OFX>`), returning the trimmed value up to the next
 * line break, or `null` if the key never appears at a line start. Read with
 * `indexOf`/`slice` only -- never a regex -- per the header being an
 * untrusted, possibly hostile string.
 */
function extractHeaderLine(header: string, headerUpper: string, key: string): string | null {
  const marker = `${key}:`;
  let searchFrom = 0;
  // No `break` and no fallthrough return after this loop: every occurrence of
  // `marker` that `indexOf` can find keeps `searchFrom` within bounds for the
  // next search, so the only way out is one of the two `return`s below --
  // there is no reachable "loop just ends" path to also return from.
  while (true) {
    const idx = headerUpper.indexOf(marker, searchFrom);
    if (idx === -1) return null;

    const atLineStart = idx === 0 || header[idx - 1] === '\n' || header[idx - 1] === '\r';
    if (atLineStart) {
      const valueStart = idx + marker.length;
      let valueEnd = valueStart;
      while (valueEnd < header.length && header[valueEnd] !== '\r' && header[valueEnd] !== '\n') {
        valueEnd += 1;
      }
      return header.slice(valueStart, valueEnd).trim();
    }

    searchFrom = idx + 1;
  }
}

/** Finds `name="value"` within `segment` and returns `value`, or `null`. */
function extractQuotedAttr(segment: string, name: string): string | null {
  const marker = `${name}="`;
  const idx = segment.toUpperCase().indexOf(marker);
  if (idx === -1) return null;
  const valueStart = idx + marker.length;
  const valueEnd = segment.indexOf('"', valueStart);
  if (valueEnd === -1) return null;
  return segment.slice(valueStart, valueEnd);
}

/**
 * Splits an OFX 1.x (SGML) or 2.x (XML) file into its header and body
 * (RESEARCH §A1 step 1). The body starts at the first case-insensitive
 * `<OFX>`; VERSION/CHARSET are read as hints only, never as a promise the
 * body actually matches them.
 */
export function splitOfxHeader(text: string): SplitOfxHeaderResult {
  const upper = text.toUpperCase();
  const ofxIndex = upper.indexOf('<OFX>');
  if (ofxIndex === -1) return { ok: false, error: 'no-ofx-root' };

  const header = text.slice(0, ofxIndex);
  const headerUpper = upper.slice(0, ofxIndex);
  const body = text.slice(ofxIndex);
  const piStart = headerUpper.indexOf('<?OFX');

  if (piStart !== -1) {
    const piEndSearch = headerUpper.indexOf('?>', piStart);
    const piEnd = piEndSearch === -1 ? header.length : piEndSearch;
    const version = extractQuotedAttr(header.slice(piStart, piEnd), 'VERSION');
    return { ok: true, version, charset: null, body };
  }

  return {
    ok: true,
    version: extractHeaderLine(header, headerUpper, 'VERSION'),
    charset: extractHeaderLine(header, headerUpper, 'CHARSET'),
    body,
  };
}

// --- Entity decoding ----------------------------------------------------

// The longest body this decoder ever recognises is 'apos' (4) or a numeric
// reference such as '#x10FFFF' (8) -- 10 gives headroom without letting an
// unterminated '&' force an unbounded scan across a hostile file.
const MAX_ENTITY_BODY_LENGTH = 10;

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

function isDecDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x30 && code <= 0x39;
}

function isHexDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
}

function isValidDigitRun(digits: string, isHex: boolean): boolean {
  if (digits.length === 0) return false;
  for (const ch of digits) {
    if (isHex ? !isHexDigit(ch) : !isDecDigit(ch)) return false;
  }
  return true;
}

function isValidCodePoint(code: number): boolean {
  return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
}

/** Bounded search for `;` starting at `start`, never scanning past `start + maxLen`. */
function findBoundedSemicolon(s: string, start: number, maxLen: number): number {
  const end = Math.min(s.length, start + maxLen);
  for (let j = start; j < end; j += 1) {
    if (s[j] === ';') return j;
  }
  return -1;
}

/** Decodes the text between `&` and `;` (exclusive), or returns `null` if unrecognised. */
function decodeEntityBody(bodyText: string): string | null {
  if (bodyText.length === 0) return null;

  if (bodyText[0] === '#') {
    const isHex = bodyText[1] === 'x' || bodyText[1] === 'X';
    const digits = isHex ? bodyText.slice(2) : bodyText.slice(1);
    if (!isValidDigitRun(digits, isHex)) return null;
    const code = parseInt(digits, isHex ? 16 : 10);
    return isValidCodePoint(code) ? String.fromCodePoint(code) : null;
  }

  return NAMED_ENTITIES.get(bodyText) ?? null;
}

/**
 * Decodes `&amp; &lt; &gt; &quot; &apos; &#NNN; &#xHH;`. Any other `&`
 * (including one immediately followed by a space, or an unterminated/
 * unrecognised entity) is kept literally -- SGML-derived OFX 1.x files
 * routinely contain a bare `&` in payee text.
 */
function decodeEntities(raw: string): string {
  let out = '';
  const len = raw.length;
  let i = 0;
  while (i < len) {
    const ch = raw[i] as string;
    if (ch !== '&') {
      out += ch;
      i += 1;
      continue;
    }

    const semi = findBoundedSemicolon(raw, i + 1, MAX_ENTITY_BODY_LENGTH + 1);
    const decoded = semi === -1 ? null : decodeEntityBody(raw.slice(i + 1, semi));
    if (decoded !== null) {
      out += decoded;
      i = semi + 1;
      continue;
    }

    out += '&';
    i += 1;
  }
  return out;
}

// --- Tokenizer ------------------------------------------------------------

function isNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    ch === '.' ||
    ch === '_'
  );
}

/**
 * Tokenizes an OFX body (the text from `splitOfxHeader`'s `body`, or any
 * SGML/XML fragment) into `open`/`close`/`text` tokens (RESEARCH §A1 step
 * 2). One linear character scan; comments and processing instructions are
 * skipped, `<![CDATA[…]]>` content is emitted as literal text with no entity
 * decoding, and every other run of text is trimmed, entity-decoded and
 * emitted only when non-empty.
 */
export function tokenizeOfx(body: string): TokenizeOfxResult {
  if (body.length > OFX_LIMITS.maxBytes) return { ok: false, error: 'too-large' };

  const tokens: OfxToken[] = [];
  const len = body.length;
  let i = 0;
  let textStart = 0;

  const flushText = (end: number): void => {
    if (end <= textStart) return;
    const trimmed = body.slice(textStart, end).trim();
    if (trimmed.length > 0) tokens.push({ t: 'text', value: decodeEntities(trimmed) });
  };

  while (i < len) {
    if (body[i] !== '<') {
      i += 1;
      continue;
    }

    flushText(i);

    if (body.startsWith('<!--', i)) {
      const end = body.indexOf('-->', i + 4);
      i = end === -1 ? len : end + 3;
      textStart = i;
      continue;
    }

    if (body.startsWith('<![CDATA[', i)) {
      const end = body.indexOf(']]>', i + 9);
      const contentEnd = end === -1 ? len : end;
      const content = body.slice(i + 9, contentEnd);
      if (content.length > 0) tokens.push({ t: 'text', value: content });
      i = end === -1 ? len : end + 3;
      textStart = i;
      continue;
    }

    if (body.startsWith('<?', i)) {
      const end = body.indexOf('?>', i + 2);
      i = end === -1 ? len : end + 2;
      textStart = i;
      continue;
    }

    let j = i + 1;
    const isClose = body[j] === '/';
    if (isClose) j += 1;

    const nameStart = j;
    while (j < len && isNameChar(body[j] as string)) j += 1;
    const name = body.slice(nameStart, j).toUpperCase();

    let k = j;
    while (k < len && body[k] !== '>') k += 1;
    i = k < len ? k + 1 : len;
    textStart = i;

    if (name.length === 0) continue;
    tokens.push(isClose ? { t: 'close', name } : { t: 'open', name });
  }

  flushText(len);
  return { ok: true, tokens };
}
