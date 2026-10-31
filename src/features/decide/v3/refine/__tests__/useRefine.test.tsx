/** Plan 05.3-34: useRefine builds RefineInput from the cached reads and calls the engine's refine(). */
import { renderHook } from '@testing-library/react-native';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { useRefine } from '../useRefine';

jest.setTimeout(60000);
let mockSettings: Record<string, unknown> | null = null;
const mockInputs = loadAllVariableCases()[0]!.inputs;
let mockDebts: Record<string, unknown>[] = [];
let mockSource: Record<string, unknown> | null = null;

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h' }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: mockSettings }),
  useDebts: () => ({ data: mockDebts }),
  useDecideSnapshot: () => ({ source: mockSource }),
  DECIDE_LOOKBACK_MONTHS: 12,
}));
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => ({ inputs: mockInputs }) }));
jest.mock('../../../setup/steps/useRegularCandidates', () => ({ useRegularCandidates: () => ({ rows: [] }) }));

describe('useRefine', () => {
  it('returns a result for the loaded inputs and is not snoozed by default', async () => {
    mockSettings = { setup_done_at: null, rough_as_of: null, everyday_override_at: null, refine_last_at: null, refine_snooze_until: null };
    const { result } = await renderHook(() => useRefine());
    expect(result.current.result).not.toBeNull();
    expect(result.current.snoozed).toBe(false);
    expect(result.current.asOf).toBe(mockInputs.asOf);
  });

  it('reports snoozed and nothing due while the stored Later date is in the future', async () => {
    mockSettings = { setup_done_at: '2026-01-01', rough_as_of: null, everyday_override_at: null, refine_last_at: null, refine_snooze_until: '2999-01-01' };
    const { result } = await renderHook(() => useRefine());
    expect(result.current.snoozed).toBe(true);
    expect(result.current.result?.due).toBe(false);
    expect(result.current.result?.cards).toEqual([]);
  });

  it('is not due when it was shown less than 30 days ago', async () => {
    mockSettings = { setup_done_at: '2026-01-01', rough_as_of: null, everyday_override_at: null, refine_last_at: mockInputs.asOf, refine_snooze_until: null };
    const { result } = await renderHook(() => useRefine());
    expect(result.current.result?.due).toBe(false);
  });

  describe('card paid in full (05.3-80)', () => {
    const settings = { setup_done_at: '2026-01-01', rough_as_of: null, everyday_override_at: null, refine_last_at: null, refine_snooze_until: null };
    const prevMonth = (n: number): string => {
      const t = Number(mockInputs.asOf.slice(0, 4)) * 12 + (Number(mockInputs.asOf.slice(5, 7)) - 1) - n;
      return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
    };
    const debt = (over: Record<string, unknown> = {}) => ({ id: 'd1', kind: 'card', account_id: 'A', pays_in_full: 'yes', deleted_at: null, ...over });
    const row = (over: Record<string, unknown> = {}) => ({
      account_id: 'A', local_date: `${prevMonth(1)}-05`, original_amount: -100000, original_currency: 'CAD', status: 'paid', deleted_at: null, ...over,
    });
    const source = (rows: Record<string, unknown>[] = [], over: Record<string, unknown> = {}) => ({
      today: mockInputs.asOf, rows, upcomingRows: [], accounts: [{ id: 'A', currency: 'CAD', kind: 'card' }], balances: { A: -50000 }, ...over,
    });
    const cardsOf = async () => {
      mockSettings = settings;
      const { result } = await renderHook(() => useRefine());
      return result.current.result;
    };
    beforeEach(() => {
      mockDebts = [debt()];
      mockSource = source();
    });
    afterAll(() => {
      mockDebts = [];
      mockSource = null;
    });

    it('shows the card when 500.00 stays owed at the last two month ends', async () => {
      const r = await cardsOf();
      expect(r?.due).toBe(true);
      expect(r?.cards.find((c) => c.kind === 'card_not_paid_in_full')?.ref).toBe('d1');
    });

    it('leaves out other accounts, pending, skipped, deleted lines and other currencies', async () => {
      mockSource = source([
        row({ account_id: 'B' }),
        row({ status: 'pending' }),
        row({ status: 'skipped' }),
        row({ deleted_at: '2026-01-01' }),
        row({ original_currency: 'USD' }),
      ]);
      const r = await cardsOf();
      expect(r?.cards.some((c) => c.kind === 'card_not_paid_in_full')).toBe(true);
    });

    it('counts a paid spending line on the card account (it lifts what was owed back at the month ends)', async () => {
      mockSource = source([row()]);
      const r = await cardsOf();
      expect(r?.cards.some((c) => c.kind === 'card_not_paid_in_full')).toBe(false);
    });

    it('gives no history for a card without an account, a missing account or a missing balance', async () => {
      for (const [d, s] of [
        [debt({ account_id: null }), source()],
        [debt(), source([], { accounts: [] })],
        [debt(), source([], { balances: {} })],
      ] as const) {
        mockDebts = [d];
        mockSource = s;
        const r = await cardsOf();
        expect(r?.cards.some((c) => c.kind === 'card_not_paid_in_full')).toBe(false);
      }
    });

    it('gives no history while the snapshot source is null', async () => {
      mockSource = null;
      const r = await cardsOf();
      expect(r?.cards.some((c) => c.kind === 'card_not_paid_in_full')).toBe(false);
    });

    it('hides the card when the balance is out of range instead of crashing', async () => {
      mockSource = source([row({ original_amount: -Number.MAX_SAFE_INTEGER })], { balances: { A: Number.MAX_SAFE_INTEGER } });
      const r = await cardsOf();
      expect(r?.cards.some((c) => c.kind === 'card_not_paid_in_full')).toBe(false);
    });
  });
});
