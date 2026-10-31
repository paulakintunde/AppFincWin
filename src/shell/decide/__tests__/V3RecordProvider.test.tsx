// 05.3-13: the provider saves answer_v3 before every write, and its value object is stable across renders.
import React from 'react';
import { render } from '@testing-library/react-native';
import { V3RecordProvider } from '../V3RecordProvider';
import { useRecordMutations, type RecordArgs, type RecordMutations } from '@/features/decide/v3/record/recordMutations';

const calls: string[] = [];
const mockSave = jest.fn((..._a: unknown[]) => {
  calls.push('answer');
  return true;
});
const mockRecord = jest.fn((..._a: unknown[]) => {
  calls.push('record');
  return { stepId: 's1' };
});
const mockCanRecord = jest.fn((..._a: unknown[]) => true);
const mockWait = jest.fn((..._a: unknown[]) => {
  calls.push('wait');
  return Promise.resolve({ reminder: 'set' as const });
});
const mockPass = jest.fn((..._a: unknown[]) => {
  calls.push('pass');
});

jest.mock('@/data/mutations/boughtWrite', () => ({
  useRecordBought: () => ({ record: mockRecord, canRecord: mockCanRecord }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({ useSaveCheckAnswer: () => ({ save: mockSave }) }));
jest.mock('@/data/mutations/decideOutcome', () => ({
  useWaitAndSave: () => ({ save: mockWait }),
  usePass: () => ({ pass: mockPass }),
}));

const args = {
  check: { id: 'c1' },
  seen: { v: 3 },
  ctx: { currency: 'USD', today: '2026-10-18', cashAccountId: 'acc-gbp' },
  evaluation: {
    purchase: { monthly: 12000 },
    result: { legacyState: 'adjust', readyBy: { kind: 'month', month: '2027-03' }, facts: [] },
  },
} as unknown as RecordArgs;

async function mount(): Promise<{ get: () => RecordMutations; seen: RecordMutations[]; rerender: () => Promise<void> }> {
  const seen: RecordMutations[] = [];
  function Probe() {
    seen.push(useRecordMutations());
    return null;
  }
  const tree = <V3RecordProvider><Probe /></V3RecordProvider>;
  const r = await render(tree);
  return { get: () => seen[seen.length - 1]!, seen, rerender: async () => { await r.rerender(tree); } };
}

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
});

describe('V3RecordProvider', () => {
  it('keeps one stable value across renders', async () => {
    const m = await mount();
    await m.rerender();
    await m.rerender();
    expect(new Set(m.seen).size).toBe(1);
  });

  it('recordBought saves answer_v3 before the record call', async () => {
    const m = await mount();
    expect(m.get().recordBought(args)).toEqual({ stepId: 's1' });
    expect(calls).toEqual(['answer', 'record']);
    expect(mockSave).toHaveBeenCalledWith(args.check, args.seen);
  });

  it('planIt saves, then waits with the legacy verdict and the answer ready-by', async () => {
    const m = await mount();
    await expect(m.get().planIt({ ...args, goalTarget: 50000, reminderOn: true })).resolves.toEqual({ reminder: 'set' });
    expect(calls).toEqual(['answer', 'wait']);
    expect(mockWait.mock.calls[0]![0]).toMatchObject({
      verdict: 'adjust',
      readyBy: '2027-03-01',
      monthlyAmount: 12000,
      goalTarget: 50000,
      today: '2026-10-18',
      currency: 'USD',
      accountId: 'acc-gbp',
    });
  });

  it('planIt with no everyday account saves the plan without a pot', async () => {
    const m = await mount();
    const noCash = { ...args, ctx: { ...args.ctx, cashAccountId: null } } as RecordArgs;
    await m.get().planIt({ ...noCash, goalTarget: 30000, reminderOn: false });
    expect(mockWait.mock.calls[0]![0]).toMatchObject({ goalTarget: null, accountId: null });
  });

  it('notBuying saves, then passes', async () => {
    const m = await mount();
    m.get().notBuying(args);
    expect(calls).toEqual(['answer', 'pass']);
    expect(mockPass.mock.calls[0]![0]).toMatchObject({ verdict: 'adjust' });
  });

  it('canRecordBought is a dry run through the hook', async () => {
    const m = await mount();
    expect(m.get().canRecordBought(args)).toBe(true);
    expect(mockCanRecord).toHaveBeenCalled();
  });
});
