#!/usr/bin/env node
// Splits an ocr-dumps.json (from the dev reader) into scrubbed per-receipt fixtures.
// Usage: node scripts/receipts/scrub-ocr-dump.mjs <input> <outDir> --module <pkg@ver>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\d.,])(?:\+?\d{1,2}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?![\d])/g;
const LONG_RUN = /(?<![\d.,])\d(?:[ -]?\d){7,}(?![\d])(?![.,]\d)/g;
const KEYWORD = /\b(auth|approval|ref|trace|terminal|card|visa|mastercard|amex|debit)\b.*\d{4,}/i;
const SHORT_RUN = /(?<![\d.,])\d{4,}(?![\d]|[.,]\d)/g;

const maskDigits = (s) => s.replace(/\d/g, 'X');

export function scrubText(text) {
  let t = text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  t = t.replace(LONG_RUN, maskDigits);
  if (KEYWORD.test(t)) {
    t = t.replace(SHORT_RUN, (m, offset, whole) => {
      const before = whole.slice(0, offset);
      if (/[*X]\s*$/.test(before)) return m; // already-masked card tail
      return maskDigits(m);
    });
  }
  return t;
}

export function splitDump(records, outDir, moduleName) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const rec of records) {
    const name = basename(String(rec.name), extname(String(rec.name)));
    const file = join(outDir, `${name}.json`);
    if (existsSync(file)) {
      try {
        const prev = JSON.parse(readFileSync(file, 'utf8'));
        if (prev.expected !== null && prev.expected !== undefined) continue;
      } catch {
        /* unreadable, overwrite */
      }
    }
    const ocr = {
      ...rec.ocr,
      lines: rec.ocr.lines.map((l) => ({ ...l, text: scrubText(l.text) })),
    };
    writeFileSync(file, JSON.stringify({ name, module: moduleName, ocr, expected: null }, null, 2) + '\n');
    written.push(file);
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const mi = args.indexOf('--module');
  const moduleName = mi >= 0 ? args[mi + 1] : null;
  const pos = args.filter((a, i) => !a.startsWith('--') && i !== mi + 1);
  if (pos.length < 2 || !moduleName) {
    console.error('Usage: scrub-ocr-dump.mjs <input> <outDir> --module <pkg@ver>');
    process.exit(2);
  }
  const records = JSON.parse(readFileSync(pos[0], 'utf8'));
  const written = splitDump(records, pos[1], moduleName);
  console.log(`Wrote ${written.length} of ${records.length} fixtures.`);
}
