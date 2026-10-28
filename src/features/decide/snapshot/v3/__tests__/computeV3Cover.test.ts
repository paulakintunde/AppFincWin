// 05.2-19 (D-48): computeV3's optional check id reads the saved volatile-cover answer onto the check.
import type { CheckV2 } from '@/engine/decide/v3';
import { demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import { computeV3 } from '../computeV3';
import { v3s } from './v3Fixtures';

const seen: CheckV2[] = [];
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    evaluate: (inputs: unknown, check: CheckV2) => {
      seen.push(check);
      return actual.evaluate(inputs, check);
    },
  };
});

const CHECK = '22222222-2222-2222-2222-222222222222';
const answer = (over: Record<string, unknown>) => ({ kind: 'volatile_cover' as const, key: CHECK, amount: null, bool_value: true, on_date: null, check_id: CHECK, ...over });
const coverFor = (v3: ReturnType<typeof v3s> | null, checkId?: string | null): unknown => {
  seen.length = 0;
  computeV3(demoSource('2026-10-03'), v3, sofaInputs, undefined, checkId);
  return seen[0]!.volatileCover;
};

describe('computeV3 volatile cover answer (D-48)', () => {
  it('rides onto the check for the matching check id', () => {
    expect(coverFor(v3s({ answers: [answer({})] }), CHECK)).toBe(true);
    expect(coverFor(v3s({ answers: [answer({ bool_value: false })] }), CHECK)).toBe(false);
  });

  it('leaves the check alone with no check id, no settings, another check, an empty answer or another kind', () => {
    const answers = [answer({})];
    expect(coverFor(v3s({ answers }))).toBeUndefined();
    expect(coverFor(v3s({ answers }), null)).toBeUndefined();
    expect(coverFor(null, CHECK)).toBeUndefined();
    expect(coverFor(v3s({ answers }), 'other')).toBeUndefined();
    expect(coverFor(v3s({ answers: [answer({ bool_value: null })] }), CHECK)).toBeUndefined();
    expect(coverFor(v3s({ answers: [answer({ kind: 'held_bridge' })] }), CHECK)).toBeUndefined();
    expect(coverFor(v3s({ answers: undefined }), CHECK)).toBeUndefined();
  });
});
