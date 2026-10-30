/**
 * 05.3-56 (D-24, D-28, D-29): one readiness answer is one undoable write. The mutation modules are replaced with spies, so
 * these tests pin which write each chip makes, its undo label and what the card is told when the write settles.
 */
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReadinessItem, ReadinessWaiver } from '@/engine/decide/v3';
import type { DecideAnswerRow } from '@/db/decideAnswers';
import { minorUnits } from '@/engine/money';
import { ENVELOPES_HREF } from '@/features/decide/v3/nav/hrefs';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { useReadinessAnswer, type ReadinessAction } from '../useReadinessAnswer';

const SERIES = '3f0c2a9e-1b4d-4c5e-8f60-1234567890ab';
const PAY_SERIES = '9a1b2c3d-4e5f-4a6b-8c7d-0123456789ab';

const mockMarkPaid = jest.fn((): string | null => 'step-paid');
const mockSkip = jest.fn((): string | null => 'step-skip');
const mockSave = jest.fn((): { id: string; stepId: string } | null => ({ id: 'ans-1', stepId: 'step-save' }));
const mockRemove = jest.fn(() => ({ stepId: 'step-remove' }));
const mockCtx: { userId: string | null; householdId: string | null; today: string } = { userId: 'u1', householdId: 'h1', today: '2026-10-30' };
const mockSource: { rows: unknown[]; upcomingRows: unknown[] } = { rows: [], upcomingRows: [] };
const mockAnswers: { data: DecideAnswerRow[] | undefined } = { data: [] };

jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useSkipOccurrence: () => ({ skip: mockSkip }),
}));
jest.mock('@/data/mutations/decideAnswers', () => ({
  useSaveDecideAnswer: () => ({ save: mockSave }),
  useRemoveDecideAnswer: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ status: 'ready', result: null, source: mockSource, retry: jest.fn() }),
}));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => mockAnswers }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({
  useV3Format: () => ({ month: (ym: string) => `month ${ym}` }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

const toast = showToast as jest.Mock;
const navigate = router.navigate as jest.Mock;
const push = pushOnce as jest.Mock;

const item = (over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  kind: 'bill',
  code: 'past_month_missing',
  month: '2026-09',
  seriesId: SERIES,
  envelopeId: null,
  lineId: 'line-1',
  name: 'Lunch',
  amount: minorUnits(1000),
  date: '2026-09-21',
  ...over,
});

const line = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'line-1',
  household_id: 'h1',
  local_date: '2026-09-21',
  version: 3,
  name: 'Lunch',
  status: 'pending',
  original_amount: 1000,
  recurring_series_id: SERIES,
  ...over,
});

const waiverRow = (key: string): DecideAnswerRow =>
  ({ id: 'w1', household_id: 'h1', created_by: 'u1', kind: 'readiness_waiver', key, amount: null, bool_value: null, on_date: '2026-10-30', check_id: null, deleted_at: null, version: 1, created_at: '', updated_at: '' }) as DecideAnswerRow;

async function hook(): Promise<ReturnType<typeof useReadinessAnswer>> {
  return (await renderHook(() => useReadinessAnswer())).result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMarkPaid.mockImplementation(() => 'step-paid');
  mockSkip.mockImplementation(() => 'step-skip');
  mockSave.mockImplementation(() => ({ id: 'ans-1', stepId: 'step-save' }));
  mockCtx.userId = 'u1';
  mockCtx.householdId = 'h1';
  mockSource.rows = [line()];
  mockSource.upcomingRows = [];
  mockAnswers.data = [];
});

describe('markPaid (D-29)', () => {
  it('marks the cached pending line paid once, toasts with Undo and settles true', async () => {
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'markPaid', lineId: 'line-1' }, done));
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(mockMarkPaid).toHaveBeenCalledWith(
      { id: 'line-1', household_id: 'h1', local_date: '2026-09-21', version: 3, name: 'Lunch', status: 'pending', original_amount: 1000 },
      'u1',
      '2026-10-30'
    );
    expect(toast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.markedPaid', params: { name: 'Lunch' } }, stepId: 'step-paid' });
    expect(done).toHaveBeenCalledWith(true);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('finds the line among the upcoming rows too', async () => {
    mockSource.rows = [];
    mockSource.upcomingRows = [line()];
    const h = await hook();
    await act(async () => h.answer(item(), { kind: 'markPaid', lineId: 'line-1' }));
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('a null step id shows the toast without Undo', async () => {
    mockMarkPaid.mockImplementation(() => null);
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'markPaid', lineId: 'line-1' }, done));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ stepId: null }));
    expect(done).toHaveBeenCalledWith(true);
  });

  it('an already paid line writes nothing', async () => {
    mockSource.rows = [line({ status: 'paid' })];
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'markPaid', lineId: 'line-1' }, done));
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(true);
  });
});

describe('skip and the B1 guard', () => {
  it('skips a cached line that has a series', async () => {
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'skip', lineId: 'line-1' }, done));
    expect(mockSkip).toHaveBeenCalledTimes(1);
    expect(mockSkip).toHaveBeenCalledWith(expect.objectContaining({ id: 'line-1', version: 3 }), 'u1');
    expect(toast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.skipped', params: { name: 'Lunch' } }, stepId: 'step-skip' });
    expect(done).toHaveBeenCalledWith(true);
  });

  it('a line with no series is never skipped: the bill gets a didnt_happen waiver', async () => {
    mockSource.rows = [line({ recurring_series_id: null })];
    const h = await hook();
    await act(async () => h.answer(item(), { kind: 'skip', lineId: 'line-1' }));
    expect(mockSkip).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      { kind: 'readiness_waiver', waiver: { kind: 'didnt_happen', seriesId: SERIES, date: '2026-09-21' }, at: '2026-10-30' },
      { key: 'didNotHappen', name: 'Lunch' },
      undefined
    );
  });

  it('a pay line with no series gets a no_pay waiver', async () => {
    mockSource.rows = [line({ recurring_series_id: null })];
    const h = await hook();
    await act(async () => h.answer(item({ kind: 'pay', seriesId: PAY_SERIES, name: 'Pay' }), { kind: 'skip', lineId: 'line-1' }));
    expect(mockSkip).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith(
      { kind: 'readiness_waiver', waiver: { kind: 'no_pay', seriesId: PAY_SERIES, date: '2026-09-21' }, at: '2026-10-30' },
      { key: 'noPayThisMonth', name: 'Pay' },
      undefined
    );
  });
});

describe('a line that is not cached', () => {
  for (const kind of ['markPaid', 'skip'] as const) {
    it(`${kind} opens Activity and writes nothing`, async () => {
      const h = await hook();
      const done = jest.fn();
      await act(async () => h.answer(item(), { kind, lineId: 'missing' }, done));
      expect(mockMarkPaid).not.toHaveBeenCalled();
      expect(mockSkip).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/activity');
      expect(done).toHaveBeenCalledWith(true);
    });
  }

  it('a line from another household is treated as not cached', async () => {
    mockSource.rows = [line({ household_id: 'other' })];
    const h = await hook();
    await act(async () => h.answer(item(), { kind: 'markPaid', lineId: 'line-1' }));
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/activity');
  });
});

describe('waive (D-28)', () => {
  const cases: [ReadinessWaiver, string, string][] = [
    [{ kind: 'paid_by_other', seriesId: SERIES, date: '2026-09-21' }, 'paidByOther', 'Lunch'],
    [{ kind: 'always_other', seriesId: SERIES }, 'alwaysPaidByOther', 'Lunch'],
    [{ kind: 'didnt_happen', seriesId: SERIES, date: '2026-09-21' }, 'didNotHappen', 'Lunch'],
    [{ kind: 'no_pay', seriesId: SERIES, date: '2026-09-21' }, 'noPayThisMonth', 'Lunch'],
    [{ kind: 'income_elsewhere' }, 'incomeElsewhere', 'Lunch'],
    [{ kind: 'nothing_to_add', month: '2026-10', at: '2026-10-30' }, 'nothingToAdd', 'month 2026-10'],
    [{ kind: 'month_complete', month: '2026-09', at: '2026-10-30' }, 'monthComplete', 'month 2026-09'],
    [{ kind: 'start_from', month: '2026-10' }, 'decideStartMonth', 'month 2026-10'],
  ];

  it.each(cases)('%o saves once under %s', async (waiver, key, name) => {
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'waive', waiver }, done));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver, at: '2026-10-30' }, { key, name }, done);
    expect(toast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: `undo.label.${key}`, params: { name } }, stepId: 'step-save' });
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('the month link (no item) still names the month', async () => {
    const h = await hook();
    await act(async () => h.answer(null, { kind: 'waive', waiver: { kind: 'start_from', month: '2026-10' } }));
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), { key: 'decideStartMonth', name: 'month 2026-10' }, undefined);
  });

  it('an unnamed waiver toasts the unnamed label', async () => {
    const h = await hook();
    await act(async () => h.answer(null, { kind: 'waive', waiver: { kind: 'income_elsewhere' } }));
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), { key: 'incomeElsewhere', name: null }, undefined);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'undo.labelUnnamed.incomeElsewhere', params: {} } }));
  });

  it('a save that writes nothing shows no toast and settles true', async () => {
    mockSave.mockImplementation(() => null);
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'waive', waiver: { kind: 'income_elsewhere' } }, done));
    expect(toast).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(true);
  });

  it('a failed write reaches the card as false', async () => {
    mockSave.mockImplementation(((_a: unknown, _l: unknown, settled?: (ok: boolean) => void) => {
      settled?.(false);
      return { id: 'ans-1', stepId: 'step-save' };
    }) as never);
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'waive', waiver: { kind: 'income_elsewhere' } }, done));
    expect(done).toHaveBeenCalledWith(false);
  });

  it('a malformed waiver never throws and settles false', async () => {
    mockSave.mockImplementation(() => {
      throw new RangeError('bad');
    });
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), { kind: 'waive', waiver: { kind: 'always_other', seriesId: 'nope' } }, done));
    expect(done).toHaveBeenCalledWith(false);
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('open', () => {
  it('activity navigates and envelopes pushes', async () => {
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(null, { kind: 'open', target: 'activity' }, done));
    expect(navigate).toHaveBeenCalledWith('/activity');
    await act(async () => h.answer(null, { kind: 'open', target: 'envelopes' }, done));
    expect(push).toHaveBeenCalledWith(ENVELOPES_HREF);
    expect(done).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledWith(true);
  });
});

describe('no user or household', () => {
  const actions: ReadinessAction[] = [
    { kind: 'markPaid', lineId: 'line-1' },
    { kind: 'skip', lineId: 'line-1' },
    { kind: 'waive', waiver: { kind: 'income_elsewhere' } },
    { kind: 'open', target: 'activity' },
  ];
  it.each(actions)('%o is a no-op that settles false', async (action) => {
    mockCtx.householdId = null;
    const h = await hook();
    const done = jest.fn();
    await act(async () => h.answer(item(), action, done));
    expect(done).toHaveBeenCalledWith(false);
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockSkip).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('clearWaiver', () => {
  const waiver: ReadinessWaiver = { kind: 'always_other', seriesId: SERIES };

  it('removes the live row under "Asked again" and toasts with Undo', async () => {
    mockAnswers.data = [waiverRow(`always-other:${SERIES}`)];
    const h = await hook();
    await act(async () => h.clearWaiver(waiver, 'Lunch'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith(mockAnswers.data[0], { key: 'readinessAnswerCleared', name: 'Lunch' });
    expect(toast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.readinessAnswerCleared', params: { name: 'Lunch' } }, stepId: 'step-remove' });
  });

  it('with no stored row it does nothing', async () => {
    mockAnswers.data = undefined;
    const h = await hook();
    await act(async () => h.clearWaiver(waiver));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('a malformed waiver does nothing and never throws', async () => {
    mockAnswers.data = [waiverRow(`always-other:${SERIES}`)];
    const h = await hook();
    await act(async () => h.clearWaiver({ kind: 'always_other', seriesId: 'nope' }));
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('with no household it does nothing', async () => {
    mockCtx.householdId = null;
    mockAnswers.data = [waiverRow(`always-other:${SERIES}`)];
    const h = await hook();
    await act(async () => h.clearWaiver(waiver));
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
