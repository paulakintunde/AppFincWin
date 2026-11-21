import { defaultRuleFor, inferSetup, resolveSpendRule } from '../spendRule';
import type { SpendRuleSetting } from '../spendRule';

const keys = ['a', 'b', 'c'];
const bill = { a: 50, b: 25, c: 25 };
const set = (o: Partial<SpendRuleSetting>): SpendRuleSetting => ({ rule: null, setup: null, shares: null, ...o });

describe('08.1-22 defaultRuleFor', () => {
  it('separate and mixed bring what they bring; one joint account follows the bill split', () => {
    expect(defaultRuleFor('separate')).toBe('bring');
    expect(defaultRuleFor('mixed')).toBe('bring');
    expect(defaultRuleFor('joint')).toBe('bill');
  });
});

describe('08.1-22 inferSetup (no setup saved)', () => {
  it('no joint account is Separate', () => {
    expect(inferSetup({ hasJoint: false, hasPersonalCash: true, hasJointCash: false })).toBe('separate');
  });
  it('a joint account plus a personal cash account is Mixed', () => {
    expect(inferSetup({ hasJoint: true, hasPersonalCash: true, hasJointCash: true })).toBe('mixed');
  });
  it('only joint cash accounts is One joint account', () => {
    expect(inferSetup({ hasJoint: true, hasPersonalCash: false, hasJointCash: true })).toBe('joint');
  });
  it('a joint savings account alone is not a joint-account household', () => {
    expect(inferSetup({ hasJoint: true, hasPersonalCash: false, hasJointCash: false })).toBe('separate');
  });
});

describe('08.1-22 resolveSpendRule', () => {
  it('SR-B1: no rule saved gives the setup default; no setup saved gives the inferred one', () => {
    expect(resolveSpendRule(null, keys, bill, 'separate').rule).toBe('bring');
    expect(resolveSpendRule(null, keys, bill, 'joint').rule).toBe('bill');
    expect(resolveSpendRule(set({ setup: 'joint' }), keys, bill, 'separate').rule).toBe('bill');
    expect(resolveSpendRule(set({ setup: 'mixed' }), keys, bill, 'joint').rule).toBe('bring');
  });
  it('bring counts personal money as each own and splits joint money by what each paid in', () => {
    const r = resolveSpendRule(set({ rule: 'bring' }), keys, bill, 'joint');
    expect(r).toEqual({ personal: { kind: 'bring' }, joint: 'paidIn', sharesOutOfDate: false, rule: 'bring' });
  });
  it('bill uses the household bill weights in member order', () => {
    const r = resolveSpendRule(set({ rule: 'bill' }), keys, bill, 'separate');
    expect(r.personal).toEqual({ kind: 'shares', weights: [50, 25, 25] });
    expect(r.joint).toEqual({ kind: 'shares', weights: [50, 25, 25] });
    expect(r.rule).toBe('bill');
  });
  it('bill with a "mine only" default (no weights) counts as bring', () => {
    expect(resolveSpendRule(set({ rule: 'bill' }), keys, null, 'separate').rule).toBe('bring');
  });
  it('bill with weights that are all zero or missing counts as bring', () => {
    expect(resolveSpendRule(set({ rule: 'bill' }), keys, { a: 0, b: 0 }, 'separate').rule).toBe('bring');
  });
  it('a member missing from the bill weights has weight 0', () => {
    const r = resolveSpendRule(set({ rule: 'bill' }), keys, { a: 100 }, 'separate');
    expect(r.personal).toEqual({ kind: 'shares', weights: [100, 0, 0] });
  });
  it('custom shares that match the members are used', () => {
    const r = resolveSpendRule(set({ rule: 'custom', shares: { a: 40, b: 30, c: 30 } }), keys, bill, 'separate');
    expect(r).toEqual({ personal: { kind: 'shares', weights: [40, 30, 30] }, joint: { kind: 'shares', weights: [40, 30, 30] }, sharesOutOfDate: false, rule: 'custom' });
  });
  it('SR-B2: custom shares out of date count what each person brings and say so', () => {
    const bad: (Record<string, number> | null)[] = [
      null,
      { a: 50, b: 50 }, // a member has no share
      { a: 50, b: 50, d: 0 }, // someone who is not a member
      { a: 50.5, b: 24.5, c: 25 }, // not whole numbers
      { a: 120, b: -10, c: -10 }, // negative
      { a: 40, b: 30, c: 20 }, // does not total 100
      { a: 40, b: 30, c: 30, d: 0 }, // one too many
    ];
    for (const shares of bad) {
      const r = resolveSpendRule(set({ rule: 'custom', shares }), keys, bill, 'separate');
      expect(r).toEqual({ personal: { kind: 'bring' }, joint: 'paidIn', sharesOutOfDate: true, rule: 'bring' });
    }
    expect(resolveSpendRule(set({ rule: 'custom' }), keys, bill, 'separate').sharesOutOfDate).toBe(true);
  });
});
