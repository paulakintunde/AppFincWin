// Strips personal data from a PayPal, Wise or Revolut CSV export so it can be committed as a test
// fixture (10-28, D-24). Usage:
//   node scripts/ops/strip-wallet-export.mjs <in> <out> --wallet paypal|wise|revolut [--no-owner-check]
// Deterministic: stand-in values are constants and ids are hashed, so a second run is byte-identical.
// Header row, dates, amounts, currencies, types, states and fee columns are kept exactly.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const WALLETS = new Set(['paypal', 'wise', 'revolut']);
const STRIP = /name|email|payer|payee|account number|iban|card|holder|address|phone|reference|attachment|note|subject|item title/;
const ID = /(^| )id$|transaction id|reference txn id/;

function normalise(header) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function standIn(norm) {
  if (/email/.test(norm)) return 'person1@example.com';
  if (/iban|account number/.test(norm)) return 'XX00TEST0000001';
  if (/card/.test(norm)) return '0000';
  if (/name|payer|payee|holder/.test(norm)) return 'Person 1';
  return 'Ref 1';
}

/** Merchant text keeps its words; anything shaped like an email, IBAN, card number or phone goes. */
function scrub(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'person1@example.com')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, 'XX00TEST0000001')
    .replace(/\b\d{13,19}\b/g, '0000')
    .replace(/\+\d[\d ()-]{7,}\d/g, '+00 0000 000000');
}

/** CSV with quoted cells, doubled quotes and newlines inside quotes. Returns rows of cells. */
function parse(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function emit(cell) {
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function strip(text) {
  const rows = parse(text.replace(/^﻿/, ''));
  const header = rows[0] ?? [];
  const norms = header.map(normalise);
  const out = rows.map((row, r) =>
    r === 0
      ? row
      : row.map((cell, i) => {
          const norm = norms[i] ?? '';
          if (cell === '') return cell;
          if (ID.test(norm)) return createHash('sha256').update(cell).digest('hex').slice(0, 16);
          if (STRIP.test(norm)) return standIn(norm);
          return scrub(cell);
        })
  );
  return out.map((row) => row.map(emit).join(',')).join('\n') + '\n';
}

function ownerTerms() {
  const terms = [];
  for (const key of ['user.name', 'user.email']) {
    try {
      const v = execFileSync('git', ['config', key]).toString().trim();
      if (v.length >= 3) terms.push(v.toLowerCase());
    } catch {
      // not set: nothing to check for
    }
  }
  return terms;
}

function main(argv) {
  const [input, output] = argv;
  const wallet = argv[argv.indexOf('--wallet') + 1];
  if (!input || !output || !WALLETS.has(wallet)) {
    console.error('usage: strip-wallet-export.mjs <in> <out> --wallet paypal|wise|revolut');
    process.exit(2);
  }
  const stripped = strip(readFileSync(input, 'utf8'));
  if (!argv.includes('--no-owner-check')) {
    const lower = stripped.toLowerCase();
    // Reported without printing the matched value.
    if (ownerTerms().some((t) => lower.includes(t))) {
      console.error('FAILED: the stripped file still contains the git user name or email. Nothing was written.');
      process.exit(1);
    }
  }
  writeFileSync(output, stripped);
  console.log(`wrote ${output}`);
}

if (process.argv[1]?.endsWith('strip-wallet-export.mjs')) main(process.argv.slice(2));
