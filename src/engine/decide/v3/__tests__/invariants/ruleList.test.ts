/**
 * The full rule list (05.4-40, ENG-19; D-134, D-136). Every 05.4 money rule (fix plan section 4 "Money rules", the sub-fixes and
 * BO-05) and every owner rule from D-35 to D-127 that changes an answer or a figure is tied to:
 * - its properties: numbered (I44..I78) or named (I-...), found by test title with the same scan as the SC-6 index; and/or
 * - unit tests named by file and title, for the owner rules D-136 maps to their unit tests instead of a new property;
 * - its approved right-answer cases: for a fix-plan answer rule, at least one approved case lists the rule in its fixIds; for an
 *   owner rule, every case listed is approved. A rule about how the app works carries the reason it has no case (D-134).
 * A fix id in any approved case's fixIds that is missing here fails by name, so a new fix cannot skip the list.
 * Every owner decision from D-35 to D-127 is either an engine rule here or named in NOT_ENGINE with its reason.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { loadCases } from '../rightAnswers/loader';

const ROOT = resolve(__dirname, '../../../../../..');
const V3 = join(ROOT, 'src/engine/decide/v3');
const SNAPSHOT_V3 = join(ROOT, 'src/features/decide/snapshot/v3');
const COPY_TEST = join(ROOT, 'src/i18n/__tests__/decideCopy.test.ts');

const TITLE = /(it|test|describe)(\.each\([^)]*\))?\(\s*['"`](I\d+|I-[A-Za-z0-9]+)\b/g;

function testFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...testFilesUnder(full));
    else if (/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const PROPERTIES: ReadonlySet<string> = (() => {
  const seen = new Set<string>();
  for (const f of [...testFilesUnder(V3), ...testFilesUnder(SNAPSHOT_V3), ...(existsSync(COPY_TEST) ? [COPY_TEST] : [])]) {
    for (const m of readFileSync(f, 'utf8').matchAll(TITLE)) seen.add(m[3]!);
  }
  return seen;
})();

/** A unit test: its file under src/engine/decide/v3 and the start of its title. */
interface UnitRef { readonly file: string; readonly title: string }
const unit = (file: string, title: string): UnitRef => ({ file, title });

interface FixRule { readonly properties: readonly string[]; readonly units?: readonly UnitRef[]; readonly cases: 'answer' | { readonly none: string } }
interface OwnerRule { readonly properties: readonly string[]; readonly units?: readonly UnitRef[]; readonly cases?: readonly string[] }

const range = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `I${from + i}`);

/** Fix-plan rules (DECIDE-FIX-PLAN section 4 "Money rules" for 05.4, the sub-fixes in approved cases, FIN-27, BO-05, ENG-29). */
const RULES: Readonly<Record<string, FixRule>> = {
  'FIN-01': { properties: ['I50', 'I51', 'I52', 'I53', 'I-saved', 'I-D61'], cases: 'answer' },
  'FIN-01b': { properties: ['I-D68'], cases: 'answer' },
  'FIN-02': { properties: ['I50', 'I-D61'], cases: 'answer' },
  'FIN-03': { properties: ['I47', 'I48', 'I49', 'I-limit'], cases: 'answer' },
  'FIN-04': { properties: ['I55', 'I56'], cases: 'answer' },
  'FIN-05': { properties: ['I59', 'I60', 'I-D68', 'I-D80'], cases: 'answer' },
  'FIN-06': { properties: ['I57', 'I-D65'], cases: 'answer' },
  'FIN-07': { properties: ['I58', 'I-D50'], cases: 'answer' },
  'FIN-08': { properties: ['I61', 'I62', 'I-D52'], cases: 'answer' },
  'FIN-09': { properties: ['I64', 'I74'], cases: 'answer' },
  'FIN-09b': { properties: ['I64'], cases: 'answer' },
  'FIN-10': { properties: ['I-DB05', 'I-D72'], cases: 'answer' },
  'FIN-11': { properties: ['I53', 'I54'], units: [unit('__tests__/heldBack.test.ts', 'D-70 counted once')], cases: 'answer' },
  'FIN-12': { properties: [], units: [unit('judge/__tests__/purchase.test.ts', 'deferred interest term is a fact and changes no figure'), unit('__tests__/borrowingJudge.test.ts', 'BR-14: a 0% plan gets only the two D-48 lines')], cases: 'answer' },
  'FIN-14': { properties: ['I-DB05'], units: [unit('__tests__/debts.test.ts', 'DB-07 / DB-12 housing')], cases: 'answer' },
  'FIN-15': { properties: ['I63'], cases: 'answer' },
  'FIN-25': { properties: ['I45', 'I46'], cases: 'answer' },
  'FIN-27': { properties: ['I65', 'I66', 'I67'], cases: 'answer' },
  // 06.1 FIN-20 (owner D-26, 2026-11-12): the tax set-aside, TX-10 .. TX-16 (TX-16: a typed quick income estimate)
  'FIN-20': { properties: [], units: [unit('__tests__/income/setAside.test.ts', 'FIN-20 freelance pay is cut'), unit('__tests__/income/setAside.test.ts', 'FIN-20 salary is never cut'), unit('__tests__/income/setAside.test.ts', 'FIN-20 with no salary part the estimate counts less the share'), unit('__tests__/income/setAside.test.ts', 'FIN-20 a one-check income quick line counts as typed')], cases: 'answer' },
  // 06.1 FIN-22 (owner D-26, 2026-11-12): long plans meet FIN-08's low-month check over the whole term (no new maths), LL-01 .. LL-06
  'FIN-22': { properties: [], units: [unit('__tests__/crosscheck/table.test.ts', 'FIN-22 the engine gives every long-loan case its stated answer')], cases: 'answer' },
  // 06.1 FIN-23 (owner D-26, 2026-11-12): a typed APR read as UK and EU lenders quote it when the region is set there, AP-01 .. AP-06
  'FIN-23': { properties: [], units: [unit('__tests__/plan/rateConvention.test.ts', 'the result is the largest rate whose compounding does not pass 1 + APR'), unit('__tests__/plan/rateConvention.test.ts', 'AP-01: Tesco Bank')], cases: 'answer' },
  'ENG-01': { properties: ['I55', 'I56'], cases: 'answer' },
  'ENG-02': { properties: ['I47', 'I48', 'I49'], cases: 'answer' },
  'ENG-03': { properties: ['I50', 'I51', 'I52', 'I-saved'], cases: 'answer' },
  'ENG-04': { properties: ['I50', 'I53'], cases: 'answer' },
  'ENG-05': { properties: ['I64'], cases: 'answer' },
  'ENG-06': { properties: ['I57'], cases: 'answer' },
  'ENG-07': { properties: ['I61', 'I62'], cases: 'answer' },
  'ENG-08': { properties: ['I59', 'I60'], cases: 'answer' },
  'ENG-09': { properties: ['I-DB05', 'I-D72'], cases: 'answer' },
  'ENG-10': { properties: ['I45', 'I46'], cases: 'answer' },
  'ENG-11': { properties: ['I-ENG11', 'I-D74'], cases: 'answer' },
  'ENG-12': { properties: ['I44'], cases: { none: 'build once per data change (prepare): how the app works, not an answer (D-134)' } },
  'ENG-13': { properties: ['I44'], cases: { none: 'judge per key press on one Prepared: how the app works, not an answer (D-134)' } },
  'ENG-14': { properties: [], units: [unit('__tests__/recordsSynced.test.ts', 'QE-07: answered from last month')], cases: 'answer' },
  'ENG-15': { properties: ['I73'], cases: { none: 'price limits: an ask or "too large to check", never an answer; no right-answer case exists for an ask on price' } },
  'ENG-17': { properties: [], units: [unit('__tests__/invariants/limits.test.ts', 'ENG-17 adding an unrated account')], cases: { none: 'an account with no exchange rate is a note, never an answer (D-114); the input builder does not send them until 05.5' } },
  'ENG-18': { properties: ['I45', 'I46'], cases: { none: 'which reasons are shown: how the app works, not an answer (D-134)' } },
  'ENG-29': { properties: ['I68', 'I69'], cases: 'answer' },
  'BO-05': { properties: range(68, 72), cases: 'answer' },
  // 06 (Grow): locked goals are kept out and unlocked goals count as spare (D-05, D-22); the net and locked goals are named apart (D-06).
  'D-05': { properties: [], units: [unit('__tests__/lockedGoals.test.ts', 'a locked goal with 30,000 saved of 50,000'), unit('__tests__/invariants/lockedGoals.test.ts', 'locking a goal never raises the lowest point')], cases: 'answer' },
  'D-06': { properties: [], units: [unit('__tests__/lockedGoals.test.ts', 'a locked net and locked goals together say both')], cases: 'answer' },
  // 06.1 (Decide screens): quick-estimate lines fold into a copy of the inputs for one check only (D-21); QL-01..08 owner-approved 2026-11-11.
  'D-21': { properties: [], units: [unit('__tests__/quick/overlay.test.ts', 'a check with no quick lines gives the same inputs object'), unit('__tests__/quick/overlay.test.ts', 'a loan is a recorded debt of the payments still to come'), unit('__tests__/crosscheck/quickLines.test.ts', 'has the eight quick-line cases')], cases: 'answer' },
};

/**
 * Fix ids in approved cases that belong to another layer or phase, so they need no engine rule here. FIN-16 (06): the safety net is
 * read from the flagged Grow goal; that is the input builder's source, and the engine reads safetyNet as before.
 */
const OTHER_LAYER = /^(UX|CMP|ARC)-|^FIN-(16|19)$/;

const BR_D68 = ['BR-17', 'BR-18', 'BR-19', 'BR-20', 'BR-21', 'BR-22'];

/** Owner rules D-35..D-127 that change an answer or a figure (D-136: new properties only where a headline can change). */
const OWNER_RULES: Readonly<Record<string, OwnerRule>> = {
  'D-35': { properties: ['I50', 'I-saved'], cases: ['SN-01', 'SN-08', 'SN-13'] },
  'D-36': { properties: ['I47', 'I48', 'I49', 'I-limit'], cases: ['OD-01', 'OD-11'] },
  'D-37': { properties: ['I47', 'I48'], cases: ['OD-01', 'OD-11', 'OD-12'] },
  'D-38': { properties: ['I49'], cases: ['OD-05', 'OD-10'] },
  'D-39': { properties: ['I59', 'I60', 'I-DB05'], cases: ['DB-04', 'DB-09', 'DB-11', 'BR-15'] },
  'D-40': { properties: ['I58'], cases: ['SN-11', 'SO-06'] },
  'D-41': { properties: ['I-D41'], cases: ['SN-14', 'SN-15'] },
  'D-42': { properties: ['I-D96'] },
  'D-43': { properties: ['I-D43'], cases: ['QE-01', 'QE-13'] },
  'D-44': { properties: ['I-D56'], cases: ['BR-15', 'QE-03'] },
  'D-46': { properties: ['I-runway'], cases: ['QE-12'] },
  'D-47': { properties: ['I54'], cases: ['RC-10'] },
  'D-48': { properties: ['I-D48'], cases: ['BR-15', 'DB-09'] },
  'D-49': { properties: ['I-D41', 'I-D61'] },
  'D-50': { properties: ['I-D50', 'I-D48'], cases: ['BR-15'] },
  'D-51': { properties: [], units: [unit('__tests__/safetyNet.test.ts', 'bills + debt minimums + essential spending')], cases: ['QE-01', 'SN-25'] },
  'D-52': { properties: ['I-D52'] },
  'D-54': { properties: ['I-D54'] },
  'D-56': { properties: ['I-D56'], cases: ['BR-21'] },
  'D-58': { properties: [], units: [unit('__tests__/moneySource.test.ts', 'SN-13: month 30,000 + extra savings 20,000')], cases: ['BR-21'] },
  'D-59': { properties: [], units: [unit('__tests__/safetyNet.test.ts', 'D-59 every safety-net caution sits last')], cases: ['SN-26'] },
  'D-60': { properties: ['I-D54'] },
  'D-61': { properties: ['I-D61'], cases: ['BR-19', 'BR-20'] },
  'D-62': { properties: ['I-D56'], cases: ['SN-13'] },
  'D-63': { properties: ['I-D65'], cases: ['BR-05', 'QE-11', 'QE-12'] },
  'D-64': { properties: ['I75'] }, // (4) and (5): the engine caveats; (1)-(3) and (6) are screens, Terms and 05.5
  'D-65': { properties: ['I-D65'], cases: BR_D68 },
  'D-66': { properties: ['I-D54'] },
  'D-67': { properties: ['I-D67'] },
  'D-68': { properties: ['I-D68'], cases: BR_D68 },
  'D-70': { properties: [], units: [unit('__tests__/heldBack.test.ts', 'D-70 counted once')] },
  'D-71': { properties: [], units: [unit('__tests__/safetyNet.test.ts', 'low_month wins over no_net / small_net')] },
  'D-72': { properties: ['I-D72'] },
  'D-73': { properties: [], units: [unit('__tests__/debts.test.ts', 'D-73 by hand')] },
  'D-74': { properties: ['I-D74'] },
  'D-75': { properties: ['I58'], cases: ['SN-26'] },
  'D-76': { properties: ['I48', 'I49'], cases: ['BR-06'] },
  'D-77': { properties: [], units: [unit('__tests__/safetyNet.test.ts', 'D-59 every safety-net caution sits last')] },
  'D-78': { properties: ['I-D56'], cases: ['BR-15', 'RC-02', 'RC-10'] },
  'D-79': { properties: ['I-D80'] },
  'D-80': { properties: ['I-D80'] },
  'D-81': { properties: ['I63'], cases: ['QE-04'] },
  'D-82': { properties: ['I-D61'], cases: ['QE-04'] },
  'D-83': { properties: ['I19'], cases: ['QE-05'] },
  'D-84': { properties: ['I-D61'] },
  'D-85': { properties: ['I63'] },
  'D-86': { properties: ['I64'], cases: ['BR-06', 'BR-21', 'OD-03', 'OD-04', 'OD-11', 'OD-12'] },
  'D-87': { properties: ['I64'], cases: ['BR-17', 'BR-21'] },
  'D-88': { properties: ['I59'], cases: ['QE-11', 'QE-12'] },
  'D-89': { properties: ['I-D56'], cases: ['RC-10'] },
  'D-90': { properties: ['I66'], cases: ['TX-04', 'TX-05'] },
  'D-91': { properties: ['I67'], cases: ['TX-09'] },
  'D-92': { properties: ['I67'] },
  'D-93': { properties: ['I65'], cases: ['TX-01', 'TX-09'] },
  'D-94': { properties: ['I-D56'], cases: ['RC-02'] },
  'D-95': { properties: ['I68', 'I-D96'], cases: ['RC-08'] },
  'D-96': { properties: ['I-D96'] },
  'D-97': { properties: ['I-D96'] },
  'D-98': { properties: ['I72'] },
  'D-99': { properties: ['I68'], cases: ['RC-09'] },
  'D-100': { properties: ['I68'], cases: ['RC-06'] },
  'D-101': { properties: ['I70'], cases: ['SO-03', 'SO-04'] },
  'D-102': { properties: ['I70'], units: [unit('fullCost/__tests__/replaces.test.ts', 'D-102 SO-04')], cases: ['SO-04'] },
  'D-103': { properties: ['I70'], cases: ['SO-06'] },
  'D-104': { properties: ['I70'] },
  'D-105': { properties: ['I70'], cases: ['SO-01', 'SO-02'] },
  'D-106': { properties: ['I70'] },
  'D-107': { properties: ['I70', 'I71', 'I72'] },
  'D-108': { properties: ['I71'], cases: ['SO-07', 'SO-08'] },
  'D-109': { properties: ['I73'] },
  'D-110': { properties: ['I-D41'] },
  'D-111': { properties: [], units: [unit('instead/__tests__/futures.test.ts', 'D-111: cheaper price and both costs per year')] },
  'D-112': { properties: [], units: [unit('instead/__tests__/futures.test.ts', 'D-111: shown only when the cheaper price is above 0')] },
  'D-113': { properties: ['I7'] },
  'D-114': { properties: [], units: [unit('__tests__/invariants/limits.test.ts', 'ENG-17 adding an unrated account')] },
  'D-115': { properties: ['I74'] },
  'D-118': { properties: ['I75'] },
  'D-119': { properties: ['I75'] },
  'D-121': { properties: ['I75'] },
  'D-123': { properties: ['I-D123', 'I76'] },
  'D-125': { properties: ['I-D123', 'I76'] },
  'D-127': { properties: ['I7'] },
  // 05.4-40 findings, decided and approved by the owner 2026-11-05
  'D-137': { properties: ['I-D96'], units: [unit('fullCost/__tests__/replaces.test.ts', 'D-137')], cases: ['SO-10', 'SO-11'] },
  'D-138': { properties: ['I9'], units: [unit('plan/__tests__/schedule.test.ts', 'I9-ROUNDING'), unit('__tests__/borrowing.test.ts', 'a computed schedule reads its exact share')] },
};

/** Owner decisions from D-35 to D-127 that are not engine rules, each with why. */
const NOT_ENGINE: Readonly<Record<string, string>> = {
  'D-45': 'planner roll-over of recurring items (verify before building); not in the 05.4 engine',
  'D-53': 'review pages only',
  'D-55': 'review pages; the app side is D-57 (05.5 month picture, 08.1 screens)',
  'D-57': '05.5 month-picture function and 08.1 screens',
  'D-69': 'the shadow generator; synthetic.ts reuses its price and plan shares',
  'D-116': 'copy wording (copy guards)',
  'D-117': 'copy wording (copy guards)',
  'D-120': 'a one-time card: copy now, screen in 08.1',
  'D-122': 'copy wording (copy guards)',
  'D-124': 'usage stats sender in the app layer',
  'D-126': 'the input builder in the features layer (plan 33)',
};

const CASES = loadCases();
const APPROVED = new Map(CASES.filter((c) => c.status === 'approved').map((c) => [c.id, c]));

function unitExists(u: UnitRef): boolean {
  const f = join(V3, u.file);
  return existsSync(f) && readFileSync(f, 'utf8').includes(u.title);
}

function evidence(rule: { properties: readonly string[]; units?: readonly UnitRef[] }): string[] {
  const problems: string[] = [];
  for (const p of rule.properties) if (!PROPERTIES.has(p)) problems.push(`property ${p} has no test titled with it`);
  for (const u of rule.units ?? []) if (!unitExists(u)) problems.push(`unit test "${u.title}" not found in ${u.file}`);
  if (rule.properties.length + (rule.units ?? []).length === 0) problems.push('no property and no unit test');
  return problems;
}

describe('ENG-19 the full rule list', () => {
  it('the scan sees numbered and named property titles', () => {
    for (const p of ['I44', 'I75', 'I77', 'I-D61', 'I-D43']) expect(PROPERTIES.has(p)).toBe(true);
  });

  for (const [id, rule] of Object.entries(RULES)) {
    it(`rule ${id} has its properties and its approved cases`, () => {
      expect(evidence(rule)).toEqual([]);
      if (rule.cases === 'answer') {
        const cases = [...APPROVED.values()].filter((c) => c.fixIds.includes(id)).map((c) => c.id);
        if (cases.length === 0) throw new Error(`${id} is an answer rule with no approved right-answer case`);
      } else {
        expect(rule.cases.none.length).toBeGreaterThan(20);
      }
    });
  }

  it('every fix id in an approved case is in the rule list (or belongs to another layer)', () => {
    const ids = new Set([...APPROVED.values()].flatMap((c) => c.fixIds));
    expect([...ids].filter((id) => RULES[id] === undefined && !OTHER_LAYER.test(id)).sort()).toEqual([]);
  });

  for (const [id, rule] of Object.entries(OWNER_RULES)) {
    it(`owner rule ${id} has its properties or unit tests, and its cases are approved`, () => {
      expect(evidence(rule)).toEqual([]);
      expect((rule.cases ?? []).filter((c) => !APPROVED.has(c))).toEqual([]);
    });
  }

  it('every owner decision from D-35 to D-127 is an engine rule here or named as not one', () => {
    const accepted = new Set(['D-133', 'D-134', 'D-135', 'D-136']); // never in range; kept so the list reads whole
    const missing: string[] = [];
    for (let n = 35; n <= 127; n += 1) {
      const id = `D-${n}`;
      if (OWNER_RULES[id] === undefined && NOT_ENGINE[id] === undefined && !accepted.has(id)) missing.push(id);
    }
    expect(missing).toEqual([]);
    for (const id of Object.keys(NOT_ENGINE)) expect(OWNER_RULES[id]).toBeUndefined();
  });
});
