/**
 * Right-answer table runner with a per-topic knownRed ratchet (05.4-05, QA-02).
 *
 * - an approved case not in knownRed/<topic>.json must match its expected block;
 * - an approved case that is in knownRed must NOT match (when it starts to pass, it must come out of the list);
 * - a knownRed entry for a case that is not approved fails as stale;
 * - draft and disputed cases only have to validate, convert and evaluate without throwing;
 * - to_do cases (household, until Phase 8) show as todo with a printed count.
 *
 * In expected.afterBuy a null figure means "not asserted". readyBy is compared exactly (null = no ready-by date).
 */
import { judgeWithQuickLines } from '../../quick/overlay';
import { saveForItReadyDate } from '../../fullCost/saveForIt';
import { prepare } from '../../prepare';
import { toEngineInputs } from './fixture';
import { loadCases, loadKnownRed } from './loader';
import { pick, type Picked } from './pick';
import { TOPICS, validateCase, type RightAnswerCase } from './schema';

/** Why the engine's answer differs from the case's expected block; [] when they agree. */
function mismatches(c: RightAnswerCase, got: Picked): string[] {
  const e = c.expected;
  const out: string[] = [];
  if (got.code !== e.code) out.push(`code: expected ${e.code}, got ${got.code}`);
  if (got.variant !== e.variant) out.push(`variant: expected ${String(e.variant)}, got ${String(got.variant)}`);
  if (e.afterBuy.month !== null && got.afterBuy.month !== e.afterBuy.month) out.push(`afterBuy.month: expected ${e.afterBuy.month}, got ${String(got.afterBuy.month)}`);
  if (e.afterBuy.usualMonth !== null && got.afterBuy.usualMonth !== e.afterBuy.usualMonth) out.push(`afterBuy.usualMonth: expected ${e.afterBuy.usualMonth}, got ${String(got.afterBuy.usualMonth)}`);
  if (got.readyBy !== e.readyBy) out.push(`readyBy: expected ${String(e.readyBy)}, got ${String(got.readyBy)}`);
  for (const r of e.mustHaveReasons) if (!got.reasons.includes(r)) out.push(`missing reason ${r}`);
  for (const f of e.mustHaveFacts) if (!got.facts.includes(f)) out.push(`missing fact ${f}`);
  for (const f of e.mustNotHaveFacts) if (got.facts.includes(f)) out.push(`unwanted fact ${f}`);
  return out;
}

const ALL = loadCases();

describe('right-answer table', () => {
  it('every case is valid', () => {
    expect(ALL.flatMap((c) => validateCase(c))).toEqual([]);
  });
});

describe.each(TOPICS)('right answers: %s', (topic) => {
  const cases = ALL.filter((c) => c.topic === topic);
  const red = loadKnownRed(topic);
  const redIds = new Set(red.map((r) => r.id));
  const todo = cases.filter((c) => c.status === 'to_do');
  if (todo.length > 0) console.log(`to_do: ${todo.length} (${topic})`);

  it('knownRed lists only approved cases, each with a fix the case names', () => {
    for (const r of red) {
      const c = cases.find((x) => x.id === r.id);
      if (!c || c.status !== 'approved') throw new Error(`stale knownRed entry ${r.id} in knownRed/${topic}.json`);
      if (!c.fixIds.includes(r.fixId)) throw new Error(`knownRed entry ${r.id} names ${r.fixId}, which is not in the case's fixIds`);
    }
  });

  for (const c of cases) {
    if (c.status === 'to_do') {
      it.todo(`${c.id} ${c.persona}`);
      continue;
    }
    if (c.status === 'approved') {
      it(`${c.id} ${c.persona}`, () => {
        const { inputs, check } = toEngineInputs(c.fixture);
        const diff = mismatches(c, pick(judgeWithQuickLines(prepare(inputs), check)));
        if (redIds.has(c.id)) {
          if (diff.length === 0) throw new Error(`${c.id} now passes: remove ${c.id} from knownRed/${topic}.json`);
        } else {
          expect(diff).toEqual([]);
        }
      });
      continue;
    }
    it(`${c.id} ${c.persona} (${c.status}) converts and evaluates`, () => {
      const { inputs, check } = toEngineInputs(c.fixture);
      expect(() => judgeWithQuickLines(prepare(inputs), check)).not.toThrow();
    });
  }
});

/**
 * 05.4 BO-05 (05.4-27, D-108): a save-for-it case's ready date is the same date the Not-yet answer gives (SO-07, SO-08): a date as it
 * is, a month as any day in it. Nothing saved is typed in the cases, so saved = 0.
 */
describe('right answers: save-for-it ready date', () => {
  const cases = ALL.filter((c) => c.status === 'approved' && c.fixture.check.saveForIt === true);
  it('there are save-for-it cases', () => {
    expect(cases.length).toBeGreaterThan(0);
  });
  for (const c of cases) {
    it(`${c.id} ${c.persona}`, () => {
      const { inputs, check } = toEngineInputs(c.fixture);
      const got = saveForItReadyDate(prepare(inputs), check, 0);
      const want = c.expected.readyBy;
      if (want === null) expect(got).toBeNull();
      else if (want.length === 10) expect(got).toBe(want);
      else expect(got?.slice(0, 7)).toBe(want);
    });
  }
});
