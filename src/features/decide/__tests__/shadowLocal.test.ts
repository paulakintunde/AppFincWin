// D-17, D-27: the owner-local shadow tier. Runs only when SHADOW_SOURCE points at a file exported by the dev menu
// (src/features/decide/dev); skipped in CI. Reads real financial data, so the report goes next to the source file, outside
// the repository, and the run refuses a source inside the repo. Nothing here is ever committed.
import * as fs from 'fs';
import * as path from 'path';

import { parseShadowSource } from '../dev/shadowExport';
import { buildDecideSnapshot } from '../snapshot/buildSnapshot';
import { computeCheck } from '../snapshot/computeCheck';
import { parseCheckInputs } from '../snapshot/checkInputs';
import { computeV3 } from '../snapshot/v3/computeV3';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const run = process.env.SHADOW_SOURCE ? describe : describe.skip;

function insideRepo(dir: string): boolean {
  const rel = path.relative(REPO_ROOT, path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

run('owner-local shadow: today vs v3', () => {
  it('answers every check in the source with a v3 Result and reports the changes', () => {
    const sourcePath = path.resolve(process.env.SHADOW_SOURCE as string);
    const outDir = path.dirname(sourcePath);
    if (insideRepo(outDir)) throw new Error('SHADOW_SOURCE must live outside the repository; it holds real financial data.');

    const file = parseShadowSource(fs.readFileSync(sourcePath, 'utf8'));
    if (file === null) throw new Error('SHADOW_SOURCE is not a fincwin-shadow-source file.');

    const built = buildDecideSnapshot(file.source);
    const rows: string[] = [];
    let changed = 0;
    for (const check of file.checks) {
      const oldState = computeCheck(built, parseCheckInputs(check.inputs, file.today)).verdict?.state ?? 'missing';
      const { result } = computeV3(file.source, file.v3Settings, check.inputs);
      expect(result).toBeDefined(); // I42: every check gets a v3 Result
      expect(result.code).toBeTruthy();
      if (result.legacyState !== oldState) {
        changed += 1;
        const cause = result.reasons.length > 0 ? result.reasons.join(', ') : result.missing.length > 0 ? `missing: ${result.missing.join(', ')}` : 'unnamed';
        rows.push(`| ${check.name} | ${check.status} | ${oldState} | ${result.legacyState} | ${result.code} | ${cause} |`);
      }
    }

    const report = [
      '# Owner-local shadow report (not for commit)',
      '',
      `Checks: ${file.checks.length}; changed answers: ${changed}; today: ${file.today}`,
      '',
      '| Check | Status | Today | v3 (legacy state) | v3 code | Cause |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'shadow-local-report.local.md'), report);
  });
});
