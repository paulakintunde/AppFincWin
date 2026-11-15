---
phase: quick-261115-hdd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engine/csv/__tests__/tokenize.test.ts
  - .github/workflows/mutation-full.yml
autonomous: true
requirements: [QUICK-261115-hdd]

must_haves:
  truths:
    - "The engine/csv branch-coverage bar (100%) is met on every run, not only when fast-check happens to generate an input that ends in a closing quote"
    - "The full mutation run starts once a week (Sunday 04:41 UTC), not nightly"
    - "The full mutation run is split into 40 parts and never runs more than 10 parts at once, leaving GitHub job slots free for PR CI"
    - "Manual start (workflow_dispatch) and the `mutation-full` PR label still start the run"
  artifacts:
    - path: "src/engine/csv/__tests__/tokenize.test.ts"
      provides: "Deterministic test for a closing quote that is the last character of the input"
      contains: "last character"
    - path: ".github/workflows/mutation-full.yml"
      provides: "Weekly, 40-part, max 10 in parallel full mutation run"
      contains: "--parts 40"
  key_links:
    - from: "src/engine/csv/__tests__/tokenize.test.ts"
      to: "src/engine/csv/tokenize.ts:145"
      via: "input whose final character is a closing quote hits the `next === undefined` side"
      pattern: "tokenize\\('[^']*\"'\\)"
    - from: ".github/workflows/mutation-full.yml plan job"
      to: "scripts/mutation-shards.mjs"
      via: "--parts 40 emits a 40-entry matrix to GITHUB_OUTPUT"
      pattern: "mutation-shards.mjs --parts 40"
---

<objective>
Fix two CI problems.

1. A flaky coverage failure: `./src/engine/csv/` sometimes misses its 100% branch bar (99.83%) because only a random property test reaches one branch.
2. The full mutation run never finishes and blocks every PR's CI by holding 19 of 20 job slots for about 5 hours.

Purpose: green, predictable CI for every PR.
Output: one new example test; an updated mutation-full.yml.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/engine/csv/tokenize.ts
@src/engine/csv/__tests__/tokenize.test.ts
@.github/workflows/mutation-full.yml

<facts>
Problem 1 (verified by the orchestrator). PR #125 CI failed with
`Jest: "./src/engine/csv/" coverage threshold for branches (100%) not met: 99.83%` while all 35,082 tests passed; a re-run passed.
The missed branch is tokenize.ts line 145:
```ts
const next = i + 1 < n ? s[i + 1] : undefined;
if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
```
The false side of `i + 1 < n` runs only when a closing quote is the very last character of the whole input (no trailing delimiter or newline), for example `a,"b"`. Only the fast-check round-trip property test (tokenize.test.ts, describe 'tokenize: round-trip property (fast-check)', about line 292) reaches it, by chance.

Test file shape: imports `fc`, `{ tokenize, detectDelimiter, MAX_IMPORT_ROWS, type Delimiter }` from '../tokenize'. Successful results look like
`{ ok: true, rows: string[][], delimiter: ',' }` (see 'tokenizes a simple two-row comma file', line 54). The 'tokenize: basic shape' describe starts at line 53.

Problem 2 — owner decision 2026-11-15: run the full mutation run WEEKLY, split into 40 smaller parts, at most 10 at a time.
Evidence: in 10 days (2026-11-06..11-15) it never completed (all cancelled or failed). On 2026-11-15 part 2 had 736 mutants and took 279 minutes, about 2.6 mutants a minute (not the 6 a minute the workflow comment assumes). 19 parts held 19 of the 20 GitHub concurrent job slots for about 5 hours.

scripts/mutation-shards.mjs: reads `--parts N` (`Number(arg('--parts', '20'))`, line 109) and, with GITHUB_OUTPUT set, appends `matrix={"include":[{part,mutate},...]}`. Any N works; no change needed. Its line 6 usage comment (`--parts 20`) is an example, and the `'20'` default is unused by CI because the workflow always passes `--parts`. Leave the script unchanged. A repo-wide grep found no other doc or test that hard-codes 20 parts.

Known blocker, out of scope: the Decide crosscheck property failure (crosscheck.test.ts, borrowing on plans, seed 745051798) makes Stryker's dry run fail, so a full run cannot go green until a separate /gsd-debug fixes it. Do not touch it here.
</facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add a fixed test for a closing quote at the very end of the input</name>
  <files>src/engine/csv/__tests__/tokenize.test.ts</files>
  <behavior>
    - `tokenize('a,b\n1,"2"')` returns `{ ok: true, rows: [['a','b'],['1','2']], delimiter: ',' }` — the closing quote is the last character, so the `next === undefined` side of line 145 runs.
    - `tokenize('a\n"x, y"')` returns `{ ok: true, rows: [['a'],['x, y']], delimiter: ',' }` (single-column file, quoted cell with an embedded comma ends the input). Before finalising this case, run it once and confirm detectDelimiter picks ',' for header `a` (tie rule: comma first); if not, pass `{ delimiter: ',' }` explicitly.
  </behavior>
  <action>
    In the existing `describe('tokenize: basic shape', ...)` block, add one `it('accepts a closing quote that is the last character of the input (no trailing newline)', ...)` with the two `expect(...).toEqual(...)` cases above. Add a one-line comment saying it pins tokenize.ts line 145's end-of-input side so the 100% branch bar no longer depends on fast-check luck.
    Do NOT change tokenize.ts. Keep the test pure: imports only from '../tokenize' (already imported) — nothing from db/state/services/ui/react (engine boundary rule in CLAUDE.md). Do not alter the fast-check property test.
  </action>
  <verify>
    <automated>cd /c/dev/fincwin-ciq && FC_RUNS=1 npx jest src/engine/csv --coverage --collectCoverageFrom='src/engine/csv/**/*.ts' --coverageReporters=text 2>&1 | grep -E "tokenize.ts|Tests:"</automated>
  </verify>
  <done>New test passes. With FC_RUNS=1 (property test barely runs) tokenize.ts still shows 100% branches. tokenize.ts is unchanged (`git diff --quiet src/engine/csv/tokenize.ts`). If FC_RUNS is not honoured by this test file, the plain run (without FC_RUNS) must still show 100% branches for tokenize.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Make the full mutation run weekly, 40 parts, at most 10 at a time</name>
  <files>.github/workflows/mutation-full.yml</files>
  <action>
    Per the owner decision of 2026-11-15 (weekly, 40 parts, max 10 at a time), edit only these lines:
    1. `schedule` cron: `'41 4 * * *'` -> `'41 4 * * 0'` (Sunday 04:41 UTC = Saturday night US Pacific). Keep `pull_request: types: [labeled]` and `workflow_dispatch: {}` exactly as they are.
    2. Plan job step: `node scripts/mutation-shards.mjs --parts 20 --out reports/mutation-plan.json` -> `--parts 40`.
    3. Part job: `max-parallel: 20` -> `max-parallel: 10`. Keep `timeout-minutes: 300`.
    4. Replace the part-job comment `# A part is about 700 mutants: about 2 hours at 6 a minute, plus 5-10 minutes of first test run` with the measured numbers, e.g.:
       `# A part is about 370 mutants: about 2.5 hours at the measured 2.6 a minute (2026-11-15: 736 mutants took 279 min), plus 5-10 minutes of first test run. At most 10 parts at once so PR CI keeps free job slots.`
    5. Header comment: line 2 "split into about 20 parts" -> "split into about 40 parts"; line 6 "or nightly once on main" -> "or weekly on main (Sunday 04:41 UTC)". Add one short header line: "2026-11-15 owner decision: weekly, 40 parts, at most 10 at a time (20 parts nightly never finished and blocked PR CI)."
    Do NOT change: pinned action SHAs, the `concurrency` block, the merge job, the 90% bar (`--bar 90`), FC_RUNS, the `if:` label condition. Do not edit scripts/mutation-shards.mjs (its `--parts 20` usage comment and default are not used by CI).
  </action>
  <verify>
    <automated>cd /c/dev/fincwin-ciq && node -e "const y=require('js-yaml');const w=y.load(require('fs').readFileSync('.github/workflows/mutation-full.yml','utf8'));const ok=w.on.schedule[0].cron==='41 4 * * 0'&&w.jobs.part.strategy['max-parallel']===10&&w.jobs.part['timeout-minutes']===300&&JSON.stringify(w.jobs.plan.steps).includes('--parts 40')&&'workflow_dispatch' in w.on&&w.on.pull_request.types[0]==='labeled';console.log(ok?'OK':'FAIL');process.exit(ok?0:1)" && git diff --stat .github/workflows/mutation-full.yml && grep -v '^\s*#' .github/workflows/mutation-full.yml | grep -c "parts 20" | grep -qx 0 && echo "no parts 20 left"</automated>
  </verify>
  <done>YAML parses; cron is weekly Sunday 04:41 UTC; plan uses --parts 40; part job max-parallel 10, timeout 300; label and manual triggers unchanged; comments reflect 40 parts, weekly, 2.6 mutants/min. `git diff` shows no change to any `uses:` SHA, the concurrency block or the merge job. If js-yaml is not in node_modules, fall back to a careful read of the diff plus `node scripts/mutation-shards.mjs --parts 40 --out <scratch>/plan.json` (only if it runs offline) to confirm 40 parts of roughly 370 mutants.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| PR label -> workflow | A `mutation-full` label starts a long, read-only CI run on PR code |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hdd-01 | D (denial of service) | mutation-full.yml part matrix | mitigate | `max-parallel: 10` caps slot use at half of the 20 concurrent jobs, so PR CI is no longer starved; weekly schedule cuts total load |
| T-hdd-02 | T/E | workflow permissions and pinned actions | accept | Unchanged: `permissions: contents: read` and SHA-pinned actions stay exactly as they are |
| T-hdd-03 | — | tokenize.test.ts | accept | Test-only change, pure engine code, no I/O |
</threat_model>

<verification>
- `npx jest src/engine/csv --coverage --collectCoverageFrom='src/engine/csv/**/*.ts'` passes with 100% branches for engine/csv.
- mutation-full.yml parses and has weekly cron, --parts 40, max-parallel 10, timeout 300; triggers, SHAs, concurrency, merge job and 90% bar untouched.
- Known, separate blocker for a green full run: Decide crosscheck property failure (crosscheck.test.ts, seed 745051798) — left for /gsd-debug.
</verification>

<success_criteria>
- engine/csv branch coverage no longer depends on random fast-check inputs.
- The full mutation run is weekly, 40 parts, at most 10 at once, and no longer blocks PR CI.
</success_criteria>

<output>
After completion, create `.planning/quick/261115-hdd-fix-ci-engine-csv-coverage-flake-and-wee/261115-hdd-SUMMARY.md`
</output>
