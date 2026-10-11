/**
 * Content-based format sniffing (D-39, D-40; RESEARCH §A1 "File picking").
 * A statement's format is decided from its bytes, never from a file name or
 * MIME type -- iOS may grey out `.ofx`/`.qfx` extensions, and a bank export
 * can arrive with any extension or none. Only the first 4 KB is scanned, so
 * a multi-megabyte file costs a bounded, linear amount of work (D-18-style
 * budget, same discipline as the OFX tokenizer in engine/ofx).
 */

export type SniffedFormat = 'ofx' | 'csv' | 'pdf' | 'unknown';

const SNIFF_WINDOW = 4096;

function isSniffWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function skipBomAndWhitespace(s: string): string {
  let i = 0;
  while (i < s.length && (s[i] === '﻿' || isSniffWhitespace(s[i] as string))) {
    i += 1;
  }
  return s.slice(i);
}

function firstLineBreakIndex(s: string): number {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\n' || s[i] === '\r') return i;
  }
  return -1;
}

export function sniffFormat(text: string): SniffedFormat {
  const head = skipBomAndWhitespace(text.slice(0, SNIFF_WINDOW));
  if (head.startsWith('%PDF-')) return 'pdf';
  const upper = head.toUpperCase();

  if (upper.startsWith('OFXHEADER:')) return 'ofx';
  if (upper.startsWith('<?XML') && upper.indexOf('<?OFX') !== -1) return 'ofx';
  if (upper.indexOf('<OFX>') !== -1) return 'ofx';

  const breakIndex = firstLineBreakIndex(head);
  const firstLine = breakIndex === -1 ? head : head.slice(0, breakIndex);
  if (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) return 'csv';

  return 'unknown';
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const PDF_SNIFF_BYTES = 1024;

/** True when "%PDF-" occurs in the first 1 KB (PDF readers tolerate leading junk up to 1 KB). Content only, never name or MIME type. */
export function sniffPdfBytes(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length, PDF_SNIFF_BYTES) - PDF_MAGIC.length;
  for (let i = 0; i <= last; i += 1) {
    let hit = true;
    for (let j = 0; j < PDF_MAGIC.length; j += 1) {
      if (bytes[i + j] !== PDF_MAGIC[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}
