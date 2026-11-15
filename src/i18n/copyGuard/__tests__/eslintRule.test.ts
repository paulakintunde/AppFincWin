// 05.5-03: the copy-guard ESLint rule under ESLint's RuleTester (flat config defaults).
import fs from 'fs';
import os from 'os';
import path from 'path';

import { checkString } from '../guard.cjs';

/* eslint-disable @typescript-eslint/no-require-imports -- ESLint and the rule are CommonJS */
const { RuleTester } = require('eslint');
const rule = require('../eslintRule.cjs');
/* eslint-enable @typescript-eslint/no-require-imports */

const BAD = "export default { decide: { v3: { a: 'You should wait.' } } }";
const [violation] = checkString('decide.v3.a', 'You should wait.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copyguard-'));
const allowFile = path.join(tmp, 'allow.json');
fs.writeFileSync(
  allowFile,
  JSON.stringify({
    dated: '2026-11-13',
    emptyBy: 'test',
    entries: [{ path: 'decide.v3.a', sentenceHash: violation!.hash, rule: violation!.rule, dated: '2026-11-13', reason: 'test' }],
  })
);

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });
tester.run('copy-guard', rule, {
  valid: [
    { code: "export default { activity: { a: 'Nothing yet.' } }" },
    { code: BAD, options: [{ allowlist: allowFile }] },
    { code: 'export default { decide: { v3: { a: `Fine ${x}.` } } }' },
  ],
  invalid: [{ code: BAD, errors: [{ messageId: 'copy', data: { rule: 'banned:you should', sentence: 'You should wait.', path: 'decide.v3.a' } }] }],
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
