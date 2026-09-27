/**
 * Byte-to-text decoding for a picked statement file (D-17, D-39; RESEARCH
 * §A1). This is the one place a statement's raw bytes become a string, and
 * it never throws for any input content: any `Uint8Array`, however
 * malformed, produces a `{ text, encoding }` result.
 *
 * A BOM is honoured first (UTF-8, UTF-16LE, UTF-16BE) -- once a BOM commits
 * to an encoding, decoding is lenient (a bad UTF-16 pairing becomes U+FFFD;
 * an odd trailing byte is dropped) rather than falling back, because the
 * file itself already declared what it is.
 *
 * With no BOM, a strict UTF-8 validator runs first (rejects overlong forms,
 * surrogate code points, out-of-range code points and truncated sequences).
 * On the first invalid byte the WHOLE input is re-decoded as Windows-1252,
 * so a British or European bank's CSV (`£` = 0xA3, `€` = 0x80) survives
 * instead of turning into U+FFFD under a UTF-8-only reading.
 *
 * Expo's bundled web-decoder polyfill is UTF-8-only and throws `RangeError`
 * for any other label (RESEARCH §A1), so that global platform API is never
 * used here -- every step below is a hand-rolled byte scan, exactly like
 * `engine/money/parseAmount.ts`'s character scan.
 */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

// Builds a string from an array of UTF-16 code units without ever spreading
// more than this many arguments into `String.fromCharCode` at once -- a 5 MB
// statement file can produce millions of code units, and `.apply` with a
// huge argument array blows the call stack on V8/Hermes.
const CHUNK_SIZE = 8192;

function codeUnitsToString(units: readonly number[]): string {
  let out = '';
  for (let i = 0; i < units.length; i += CHUNK_SIZE) {
    out += String.fromCharCode.apply(null, units.slice(i, i + CHUNK_SIZE) as number[]);
  }
  return out;
}

/**
 * Decodes UTF-8 bytes starting at `start`. When `strict` is true, any
 * invalid byte sequence aborts the whole decode and returns `null` (the
 * caller then falls back to Windows-1252). When `strict` is false, an
 * invalid sequence is instead replaced with U+FFFD and scanning resumes one
 * byte later -- used only after a UTF-8 BOM has already committed the file
 * to this encoding.
 */
function decodeUtf8(bytes: Uint8Array, start: number, strict: boolean): string | null {
  const units: number[] = [];
  const len = bytes.length;
  let i = start;

  while (i < len) {
    const b0 = bytes[i] as number;
    if (b0 <= 0x7f) {
      units.push(b0);
      i += 1;
      continue;
    }

    let extraBytes: number;
    let codePoint: number;
    let minCodePoint: number;
    if ((b0 & 0xe0) === 0xc0) {
      extraBytes = 1;
      codePoint = b0 & 0x1f;
      minCodePoint = 0x80;
    } else if ((b0 & 0xf0) === 0xe0) {
      extraBytes = 2;
      codePoint = b0 & 0x0f;
      minCodePoint = 0x800;
    } else if ((b0 & 0xf8) === 0xf0) {
      extraBytes = 3;
      codePoint = b0 & 0x07;
      minCodePoint = 0x10000;
    } else {
      if (strict) return null;
      units.push(0xfffd);
      i += 1;
      continue;
    }

    if (i + extraBytes >= len) {
      if (strict) return null;
      units.push(0xfffd);
      i += 1;
      continue;
    }

    let validContinuation = true;
    for (let k = 1; k <= extraBytes; k += 1) {
      const b = bytes[i + k] as number;
      if ((b & 0xc0) !== 0x80) {
        validContinuation = false;
        break;
      }
      codePoint = (codePoint << 6) | (b & 0x3f);
    }

    const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (!validContinuation || codePoint < minCodePoint || codePoint > 0x10ffff || isSurrogate) {
      if (strict) return null;
      units.push(0xfffd);
      i += 1;
      continue;
    }

    if (codePoint <= 0xffff) {
      units.push(codePoint);
    } else {
      const shifted = codePoint - 0x10000;
      units.push(0xd800 + (shifted >> 10));
      units.push(0xdc00 + (shifted & 0x3ff));
    }
    i += 1 + extraBytes;
  }

  return codeUnitsToString(units);
}

/**
 * Lenient UTF-16 decode used only after a BOM has committed the file to this
 * encoding. An odd trailing byte is dropped (the loop simply never reads
 * it); an unpaired surrogate (a high surrogate with no following low
 * surrogate, or a lone low surrogate) becomes U+FFFD rather than a broken
 * string.
 */
function decodeUtf16(bytes: Uint8Array, start: number, littleEndian: boolean): string {
  const units: number[] = [];
  const len = bytes.length;
  let i = start;
  while (i + 1 < len) {
    const first = bytes[i] as number;
    const second = bytes[i + 1] as number;
    units.push(littleEndian ? (second << 8) | first : (first << 8) | second);
    i += 2;
  }

  const fixed: number[] = [];
  for (let k = 0; k < units.length; k += 1) {
    const unit = units[k] as number;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = units[k + 1];
      if (next !== undefined && next >= 0xdc00 && next <= 0xdfff) {
        fixed.push(unit, next);
        k += 1;
      } else {
        fixed.push(0xfffd);
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fixed.push(0xfffd);
    } else {
      fixed.push(unit);
    }
  }
  return codeUnitsToString(fixed);
}

// Windows-1252's 0x80-0x9F block, indexed by (byte - 0x80). The five slots
// Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to their
// own Latin-1 code point, matching every other byte in the encoding.
const CP1252_HIGH_TABLE: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function decodeCp1252(bytes: Uint8Array): string {
  const units: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] as number;
    units.push(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH_TABLE[b - 0x80] as number) : b);
  }
  return codeUnitsToString(units);
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeUtf8(bytes, 3, false) as string, encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeUtf16(bytes, 2, true), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16(bytes, 2, false), encoding: 'utf-16be' };
  }

  const strict = decodeUtf8(bytes, 0, true);
  if (strict !== null) {
    return { text: strict, encoding: 'utf-8' };
  }
  return { text: decodeCp1252(bytes), encoding: 'windows-1252' };
}
