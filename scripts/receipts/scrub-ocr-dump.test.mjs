import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrubText, splitDump } from './scrub-ocr-dump.mjs';

test('masks long digit runs, keeps stars-preceded last four', () => {
  assert.equal(scrubText('**** **** **** 1234'), '**** **** **** 1234');
  assert.equal(scrubText('4111111111111111'), 'XXXXXXXXXXXXXXXX');
  assert.equal(scrubText('4111 1111 1111 1111'), 'XXXX XXXX XXXX XXXX');
});

test('masks emails and phones', () => {
  assert.equal(scrubText('jane@example.com'), '[email]');
  assert.equal(scrubText('Call (604) 555-0199'), 'Call [phone]');
  assert.equal(scrubText('+1 604 555 0199'), '[phone]');
});

test('keyword lines keep the word and mask digits', () => {
  assert.equal(scrubText('AUTH CODE 123456'), 'AUTH CODE XXXXXX');
  assert.equal(scrubText('Visa ref 98765'), 'Visa ref XXXXX');
  assert.equal(scrubText('Debit **** 4321'), 'Debit **** 4321');
});

test('prices, dates and times are untouched', () => {
  for (const s of ['12.50', '1,234.56', '03/04/26', '14:32', 'Visa total 1234.56']) {
    assert.equal(scrubText(s), s);
  }
});

test('splits records, keeps frames and order, writes expected null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
  const frame = { left: 1, top: 2, width: 3, height: 4 };
  const dump = [
    { name: 'r01.jpg', ms: 5, ocr: { lines: [{ text: 'a@b.co', frame }, { text: 'Milk 3.20', frame: null }], imageWidth: 10, imageHeight: 20 } },
  ];
  const written = splitDump(dump, dir, 'pkg@1.0.0');
  assert.equal(written.length, 1);
  const out = JSON.parse(readFileSync(join(dir, 'r01.json'), 'utf8'));
  assert.equal(out.name, 'r01');
  assert.equal(out.module, 'pkg@1.0.0');
  assert.equal(out.expected, null);
  assert.deepEqual(out.ocr.lines[0], { text: '[email]', frame });
  assert.equal(out.ocr.lines[1].frame, null);
  // never overwrite labelled fixtures
  writeFileSync(join(dir, 'r01.json'), JSON.stringify({ name: 'r01', expected: { total: 1 } }));
  const again = splitDump(dump, dir, 'pkg@1.0.0');
  assert.equal(again.length, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'r01.json'), 'utf8')).expected, { total: 1 });
  assert.ok(existsSync(join(dir, 'r01.json')));
});
