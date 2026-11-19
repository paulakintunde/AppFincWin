import fc from 'fast-check';
import { levelFor } from '../levelFor';
import type { OnboardingAnswers } from '../onboardingAnswers';

const answers = fc.record(
  {
    goal: fc.constantFrom('track', 'stop', 'debt', 'save', 'biz'),
    debt: fc.constantFrom('none', 'card', 'loan', 'several'),
    inv: fc.constantFrom('no', 'some', 'lots'),
    shape: fc.constantFrom('steady', 'lumpy', 'mixed'),
    share: fc.constantFrom('no', 'partner', 'household', 'both'),
    watch: fc.constantFrom('closely', 'normally', 'lightly', 'none'),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<OnboardingAnswers>;

describe('levelFor', () => {
  it('lands on Everyday when every question is skipped', () => {
    expect(levelFor({})).toBe(2);
  });

  it.each([
    ['track', 1],
    ['stop', 2],
    ['save', 2],
    ['debt', 3],
    ['biz', 3],
  ] as const)('goal %s -> %i', (goal, level) => {
    expect(levelFor({ goal })).toBe(level);
  });

  it('owing money raises to at least Full picture', () => {
    expect(levelFor({ goal: 'track', debt: 'card' })).toBe(3);
    expect(levelFor({ goal: 'track', debt: 'none' })).toBe(1);
  });

  it('investments raise the level', () => {
    expect(levelFor({ goal: 'track', inv: 'some' })).toBe(3);
    expect(levelFor({ goal: 'track', inv: 'lots' })).toBe(4);
    expect(levelFor({ goal: 'track', inv: 'no' })).toBe(1);
  });

  it('lumpy or mixed income raises to at least Full picture', () => {
    expect(levelFor({ goal: 'track', shape: 'lumpy' })).toBe(3);
    expect(levelFor({ goal: 'track', shape: 'mixed' })).toBe(3);
    expect(levelFor({ goal: 'track', shape: 'steady' })).toBe(1);
  });

  it('property: result is an integer from 1 to 4', () => {
    fc.assert(
      fc.property(answers, (a) => {
        const l = levelFor(a);
        return Number.isInteger(l) && l >= 1 && l <= 4;
      }),
    );
  });

  it('property: owing money or holding investments never lowers the level', () => {
    fc.assert(
      fc.property(
        answers,
        fc.constantFrom('card', 'loan', 'several'),
        fc.constantFrom('some', 'lots'),
        (a, debt, inv) => {
          const base = levelFor(a);
          return (
            levelFor({ ...a, debt }) >= base &&
            levelFor({ ...a, inv }) >= base &&
            levelFor({ ...a, shape: 'lumpy' }) >= base
          );
        },
      ),
    );
  });
});
