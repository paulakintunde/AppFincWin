// node --test scripts/ops/  -- the stripper keeps layouts and numbers and drops personal data (D-24).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./strip-wallet-export.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'strip-wallet-'));

const HEADER = 'Date,Time,Name,From Email Address,To Email Address,Transaction ID,Description,Gross,Fee,Net,Currency,Status,IBAN,Card Number,Note';
const ROWS = [
  '06/03/2026,09:00:00,Jane Doe,jane@x.com,shop@merchant.test,TX-0001,"Coffee, Main St card 4111111111111111",-12.50,0.30,-12.80,EUR,Completed,GB29NWBK60161331926819,4111111111111111,call +44 7700 900123',
  '07/03/2026,10:00:00,Jane Doe,jane@x.com,shop@merchant.test,TX-0002,Refund,5.00,0.00,5.00,EUR,Completed,GB29NWBK60161331926819,4111111111111111,',
];

function run(text, extra = []) {
  const input = join(dir, 'in.csv');
  const output = join(dir, 'out.csv');
  writeFileSync(input, text);
  execFileSync('node', [script, input, output, '--wallet', 'paypal', '--no-owner-check', ...extra], { stdio: 'pipe' });
  return readFileSync(output, 'utf8');
}

const INPUT = [HEADER, ...ROWS].join('\n') + '\n';

test('personal data is gone; header, amounts and dates are unchanged', () => {
  const out = run(INPUT);
  for (const secret of ['Jane Doe', 'jane@x.com', 'GB29NWBK60161331926819', '4111111111111111', '7700 900123']) {
    assert.equal(out.includes(secret), false, secret);
  }
  const lines = out.trimEnd().split('\n');
  assert.equal(lines[0], HEADER);
  assert.ok(lines[1].startsWith('06/03/2026,09:00:00,Person 1,person1@example.com,person1@example.com,'));
  assert.ok(lines[1].includes(',-12.50,0.30,-12.80,EUR,Completed,XX00TEST0000001,0000,'));
  assert.ok(lines[1].includes('Coffee, Main St card'), 'merchant text stays');
  assert.equal(lines.length, 3);
});

test('transaction ids become a stable 16-character hash, so pairs and duplicates still line up', () => {
  const out = run(INPUT);
  const ids = out.trimEnd().split('\n').slice(1).map((l) => l.split(',')[5]);
  assert.match(ids[0], /^[0-9a-f]{16}$/);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(run(INPUT), out, 'second run is byte-identical');
});

test('the owner check fails when the output still holds the git user name', () => {
  const name = execFileSync('git', ['config', 'user.name']).toString().trim();
  if (name === '') return;
  const input = join(dir, 'own.csv');
  writeFileSync(input, ['Date,Description,Amount', `01/03/2026,Paid ${name} for lunch,-3.00`].join('\n') + '\n');
  assert.throws(() => execFileSync('node', [script, input, join(dir, 'own-out.csv'), '--wallet', 'wise'], { stdio: 'pipe' }));
});

test('an unknown wallet name is refused', () => {
  const input = join(dir, 'x.csv');
  writeFileSync(input, 'a,b\n1,2\n');
  assert.throws(() => execFileSync('node', [script, input, join(dir, 'x-out.csv'), '--wallet', 'nope'], { stdio: 'pipe' }));
});
