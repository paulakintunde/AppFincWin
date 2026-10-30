/** Plan 05.3-34: every card kind has a row in the intent table, updates write through the 05.2 hooks, keeps write nothing. */
import { act, renderHook } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import type { RefineCard } from '@/engine/decide/v3';
import { REFINE_CHOICES } from '../../model/refineModel';
import { INTENTS, cardKey } from '../refineIntents';
import { useRefineChoices } from '../useRefineChoices';

jest.setTimeout(60000);
const mockEditFrom = jest.fn((_i: unknown) => 'step-edit');
const mockSave = jest.fn((_i: unknown) => ({ stepId: 'step-save' }));
const mockConfirm = jest.fn(() => ({ stepId: 'step-unspent' }));
const mockDismiss = jest.fn(() => ({ stepId: 'step-dismiss' }));
const mockRegular = jest.fn(() => ({ stepId: 'step-regular' }));
const mockToast = jest.fn();
const mockOpenDebt = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h', today: '2026-10-30', timeZone: 'UTC' }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSave }) }));
jest.mock('../../../setup/steps/setupSheetHost', () => ({
  setupSheetActions: () => ({ updateSeriesAmount: (i: unknown) => mockEditFrom(i), pauseSeries: () => 'step-pause' }),
}));
jest.mock('@/data/mutations/seriesAttributes', () => ({ useConfirmRegularCandidate: () => ({ confirm: mockRegular }) }));
jest.mock('@/data/mutations/dismissals', () => ({ useAddDismissal: () => ({ dismiss: mockDismiss }) }));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({ data: [{ id: 'pay1', name: 'Wages', amount: 300000, version: 3, deleted_at: null }] }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: { month_marks: null } }),
  useDebts: () => ({ data: [{ id: 'card1', name: 'Visa' }] }),
  usePots: () => ({ data: { live: [{ id: 'pot1', name: 'Holiday' }] } }),
}));
jest.mock('../../../setup/useUnspent', () => ({ useUnspent: () => ({ ready: true, confirm: mockConfirm }) }));
jest.mock('../../../setup/debtSheetHost', () => ({ openDebtSheet: (r: unknown) => mockOpenDebt(r) }));
jest.mock('../../../setup/steps/useRegularCandidates', () => ({
  useRegularCandidates: () => ({
    rows: [
      {
        candidate: { key: 'gym|out', name: 'Gym', amount: 4500n, direction: 'out', rowIds: ['a', 'b', 'c'], anchorDate: '2026-10-01' },
        accountId: 'acc',
        currency: 'USD',
        categoryId: null,
        freq: 'monthly',
        dismissal: null,
      },
    ],
  }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));

const card = (kind: RefineCard['kind'], over: Partial<RefineCard> = {}): RefineCard => ({
  kind,
  ref: null,
  month: null,
  current: minorUnits(100000),
  suggested: minorUnits(120000),
  noise: null,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('the intent table', () => {
  it('has a row for every RefineCardKind, matching the two choices of REFINE_CHOICES', () => {
    expect(Object.keys(INTENTS).sort()).toEqual(Object.keys(REFINE_CHOICES).sort());
    for (const kind of Object.keys(INTENTS) as (keyof typeof INTENTS)[]) {
      expect([...INTENTS[kind]].sort()).toEqual(['keep', 'update']);
    }
  });
});

describe('useRefineChoices', () => {
  it('pay: update writes the suggested amount with the Pay updated label and a toast', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('pay', { ref: 'pay1' }), 'update'));
    expect(mockEditFrom).toHaveBeenCalledWith(expect.objectContaining({ series: expect.objectContaining({ id: 'pay1' }), amount: 120000, labelKey: 'payUpdated', from: '2026-10-30' }));
    expect(mockToast).toHaveBeenCalled();
    expect(result.current.decided.get(cardKey({ kind: 'pay', ref: 'pay1' }))).toBe('updated');
    expect(mockTrack).toHaveBeenCalledWith('decide_refine_choice', { kind: 'pay', choice: 'updated' });
  });

  it('keep writes nothing and shows the card as kept', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('pay', { ref: 'pay1' }), 'keep'));
    expect(mockEditFrom).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.decided.get('pay:pay1')).toBe('kept');
  });

  it('a re-choice after Updated writes again', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    const c = card('pay', { ref: 'pay1' });
    await act(async () => result.current.choose(c, 'update'));
    await act(async () => result.current.choose(c, 'keep'));
    await act(async () => result.current.choose(c, 'update'));
    expect(mockEditFrom).toHaveBeenCalledTimes(2);
  });

  it('everyday: update patches the everyday override stamped today', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('everyday'), 'update'));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { everyday_override: 120000, everyday_override_at: '2026-10-30' } }));
  });

  it('unspent: update confirms the suggested anchor', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('unspent'), 'update'));
    expect(mockConfirm).toHaveBeenCalledWith(120000);
  });

  it('new_regular: update marks it regular, keep dismisses it as not regular', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    const c = card('new_regular', { ref: 'gym|out' });
    await act(async () => result.current.choose(c, 'update'));
    expect(mockRegular).toHaveBeenCalledTimes(1);
    await act(async () => result.current.choose(c, 'keep'));
    expect(mockDismiss).toHaveBeenCalledWith(expect.objectContaining({ payeeKey: 'gym|out' }));
  });

  it('saving_bucket: Looks right (keep) opens nothing, Change it (update) opens the pot sheet', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    const c = card('saving_bucket', { ref: 'pot1' });
    await act(async () => result.current.choose(c, 'keep'));
    expect(result.current.pot).toBeNull();
    await act(async () => result.current.choose(c, 'update'));
    expect(result.current.pot?.id).toBe('pot1');
  });

  it('card_not_paid_in_full: update opens the debt sheet', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('card_not_paid_in_full', { ref: 'card1', suggested: null }), 'update'));
    expect(mockOpenDebt).toHaveBeenCalledWith({ mode: 'edit', debt: expect.objectContaining({ id: 'card1' }) });
  });

  it('under_logged_month: update leaves the month out of the typical month', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('under_logged_month', { month: '2026-09', suggested: null }), 'update'));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { month_marks: { '2026-09': 'out' } } }));
  });

  it('a write that cannot be made leaves the card to check', async () => {
    const { result } = await renderHook(() => useRefineChoices());
    await act(async () => result.current.choose(card('pay', { ref: 'missing' }), 'update'));
    expect(result.current.decided.size).toBe(0);
  });
});
