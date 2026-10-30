/** Plan 05.3-34: useRefine builds RefineInput from the cached reads and calls the engine's refine(). */
import { renderHook } from '@testing-library/react-native';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { useRefine } from '../useRefine';

jest.setTimeout(60000);
let mockSettings: Record<string, unknown> | null = null;
const mockInputs = loadAllVariableCases()[0]!.inputs;

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h' }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: mockSettings }),
  useDebts: () => ({ data: [] }),
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
});
