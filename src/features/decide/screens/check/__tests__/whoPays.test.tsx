// 08.1-10 (D-01, D-02, T-08.1-30): Who pays on the price step. The household read is mocked at its hook; the control, the
// price step and the saved draft are real.
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { toStoredV2, readStoredCheck, type CheckV2, type ShareScope } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { wrap } from '@/test/stepProps';
import { PriceStep } from '../PriceStep';
import { WhoPays } from '../WhoPays';

jest.setTimeout(30000);

const ID = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD: ShareScope = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } };
type MockSpend = { counted: 'bring' | 'custom' | 'bill'; outOfDate: boolean; myPercent: number | null; jointAccounts: { id: string; name: string }[] };
let mockShare: { shareScope: ShareScope | null; memberCount: number; spend?: MockSpend | null } = { shareScope: HOUSEHOLD, memberCount: 2 };
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
const mockSave = jest.fn();
let mockDims = { width: 402, height: 874, fontScale: 1, scale: 2 };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDims }));
jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }), getDeviceRegion: () => 'US', getDeviceTimeZone: () => 'UTC' }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-11' }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: { currency: 'USD', region: 'US', series: [], debts: [] }, prepared: null, v3: null }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useSaveCheckDraft: () => ({ save: mockSave }),
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: [], pendingRows: [] }),
}));
// the engine: an evaluation is not needed here, but the hook is asked which scope the check carries
const mockEngine = jest.fn();
jest.mock('../../engine/useCheckEngine', () => ({
  useCheckEngine: (check: CheckV2 | null) => {
    mockEngine(check?.share.kind ?? null);
    return { evaluation: null, readyDate: () => null };
  },
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/household/decide/useHouseholdScopeSource', () => ({ useHouseholdShare: () => mockShare }));

const lastSavedShare = (): ShareScope => {
  const calls = mockSave.mock.calls;
  return (calls[calls.length - 1]![0] as { inputs: { share: ShareScope } }).inputs.share;
};

beforeEach(() => {
  mockShare = { shareScope: HOUSEHOLD, memberCount: 2 };
  mockDims = { width: 402, height: 874, fontScale: 1, scale: 2 };
  mockRow = { id: ID, name: 'Laptop', inputs: toStoredV2(checkOnce(120_000)), furthest_step: 1 };
  mockSave.mockClear();
  mockEngine.mockClear();
});

describe('Who pays on the price step', () => {
  it('is hidden, with no space kept, for a household of one', async () => {
    mockShare = { shareScope: null, memberCount: 1 };
    await wrap(<PriceStep id={ID} />);
    await screen.findByLabelText('Price');
    expect(screen.queryByTestId('who-pays')).toBeNull();
    expect(screen.queryByText('Who pays')).toBeNull();
  });

  it('starts on Just me for a new check, even when the household has used Household before (D-02)', async () => {
    await wrap(<PriceStep id={ID} />);
    await screen.findByText('Who pays');
    expect(screen.getByLabelText('Just me').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Household').props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId('who-pays-helper')).toBeNull();
    expect(readStoredCheck(mockRow!.inputs).check.share.kind).toBe('personal');
  });

  it('shows two radio options under the label "Who pays"', async () => {
    await wrap(<PriceStep id={ID} />);
    await screen.findByText('Who pays');
    expect(screen.getByLabelText('Who pays').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('Just me').props.accessibilityRole).toBe('radio');
    expect(screen.getByLabelText('Household').props.accessibilityRole).toBe('radio');
  });

  it('saves the household scope with the household split rule when Household is picked, and shows the helper', async () => {
    await wrap(<PriceStep id={ID} />);
    fireEvent.press(await screen.findByLabelText('Household'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(lastSavedShare()).toEqual(HOUSEHOLD);
  });

  it('keeps the choice when the step is opened again (Back from the answer): it is read from the check', async () => {
    mockRow = { id: ID, name: 'Laptop', inputs: toStoredV2({ ...checkOnce(120_000), share: HOUSEHOLD }), furthest_step: 2 };
    await wrap(<PriceStep id={ID} />);
    await screen.findByText('Who pays');
    expect(screen.getByLabelText('Household').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('who-pays-helper')).toBeTruthy();
    expect(screen.getByText('Uses shared money and anything a partner has agreed to share.')).toBeTruthy();
    expect(screen.getByTestId('who-pays-helper').props.accessibilityLiveRegion).toBe('polite');
    // the engine is handed the same check, so it judges with scope household
    expect(mockEngine).toHaveBeenCalledWith('household');
  });

  it('goes back to Just me (personal) when Just me is picked again', async () => {
    mockRow = { id: ID, name: 'Laptop', inputs: toStoredV2({ ...checkOnce(120_000), share: HOUSEHOLD }), furthest_step: 2 };
    await wrap(<PriceStep id={ID} />);
    fireEvent.press(await screen.findByLabelText('Just me'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(lastSavedShare()).toEqual({ kind: 'personal' });
  });

  it('stacks two full-height pills at large text on a 320 dp screen', async () => {
    mockDims = { width: 320, height: 640, fontScale: 2, scale: 2 };
    await wrap(<WhoPays share={{ kind: 'personal' }} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Who pays').props.accessibilityRole).toBe('radiogroup');
    const me = screen.getByLabelText('Who pays, Just me');
    expect(me.props.accessibilityRole).toBe('radio');
    expect(me.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Who pays, Household').props.accessibilityState.selected).toBe(false);
  });

  // 08.1-23 (Q12): the helper names the spending rule; Just me with a joint account says only my part of it counts.
  it('names What each person brings under Household', async () => {
    mockShare = { shareScope: HOUSEHOLD, memberCount: 2, spend: { counted: 'bring', outOfDate: false, myPercent: null, jointAccounts: [] } };
    await wrap(<WhoPays share={HOUSEHOLD} onChange={jest.fn()} />);
    expect(screen.getByTestId('who-pays-helper').props.children).toBe('Counts your own money and your part of any joint account.');
  });

  it('names my percent under a set or bill split', async () => {
    mockShare = { shareScope: HOUSEHOLD, memberCount: 2, spend: { counted: 'custom', outOfDate: false, myPercent: 40, jointAccounts: [] } };
    await wrap(<WhoPays share={HOUSEHOLD} onChange={jest.fn()} />);
    expect(screen.getByTestId('who-pays-helper').props.children).toBe('Counts your 40% of the money everyone has shared.');
  });

  it('Just me with a joint account counts my part of it, plural for more than one, nothing without one', async () => {
    mockShare = { shareScope: HOUSEHOLD, memberCount: 2, spend: { counted: 'bring', outOfDate: false, myPercent: null, jointAccounts: [{ id: 'j', name: 'Our pot' }] } };
    await wrap(<WhoPays share={{ kind: 'personal' }} onChange={jest.fn()} />);
    expect(screen.getByTestId('who-pays-helper').props.children).toBe('Counts your part of Our pot.');
    await screen.unmount();
    mockShare = {
      shareScope: HOUSEHOLD,
      memberCount: 2,
      spend: { counted: 'bring', outOfDate: false, myPercent: null, jointAccounts: [{ id: 'j', name: 'A' }, { id: 'k', name: 'B' }] },
    };
    await wrap(<WhoPays share={{ kind: 'personal' }} onChange={jest.fn()} />);
    expect(screen.getByTestId('who-pays-helper').props.children).toBe('Counts your part of your joint accounts.');
    await screen.unmount();
    mockShare = { shareScope: HOUSEHOLD, memberCount: 2, spend: { counted: 'bring', outOfDate: false, myPercent: null, jointAccounts: [] } };
    await wrap(<WhoPays share={{ kind: 'personal' }} onChange={jest.fn()} />);
    expect(screen.queryByTestId('who-pays-helper')).toBeNull();
  });

  it('on the stacked layout a press picks the household scope', async () => {
    mockDims = { width: 320, height: 640, fontScale: 2, scale: 2 };
    const onChange = jest.fn();
    await wrap(<WhoPays share={{ kind: 'personal' }} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Who pays, Household'));
    expect(onChange).toHaveBeenCalledWith(HOUSEHOLD);
  });
});
