/**
 * Content-based format sniffing (D-39, D-40; RESEARCH §A1 "File picking").
 * A statement's format is decided from its bytes, never from a file name or
 * MIME type -- iOS may grey out `.ofx`/`.qfx` extensions, and a bank export
 * can arrive with any extension or none. Only the first 4 KB is scanned, so
 * a multi-megabyte file costs a bounded, linear amount of work (D-18-style
 * budget, same discipline as the OFX tokenizer in engine/ofx).
 */

export type SniffedFormat = 'ofx' | 'csv' | 'unknown';

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
  const upper = head.toUpperCase();

  if (upper.startsWith('OFXHEADER:')) return 'ofx';
  if (upper.startsWith('<?XML') && upper.indexOf('<?OFX') !== -1) return 'ofx';
  if (upper.indexOf('<OFX>') !== -1) return 'ofx';

  const breakIndex = firstLineBreakIndex(head);
  const firstLine = breakIndex === -1 ? head : head.slice(0, breakIndex);
  if (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) return 'csv';

  return 'unknown';
}
