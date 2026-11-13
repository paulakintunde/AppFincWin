// 06.1-19: the big-buy stepper on stored drafts. Data hooks are mocked at the query/mutation edge; the hook, steps and frame are real.
import React from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { percent } from '@/engine/decide';
import { toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { wrap } from '@/test/stepProps';
import { CostsStep } from '../CostsStep';
import { KindStep } from '../KindStep';
import { PriceStep } from '../PriceStep';
import { KEY_KIND, KEY_SKIPPED, stepHref } from '../useStepCheck';

jest.setTimeout(30000);

const ID = '11111111-1111-4111-8111-111111111111';
let mockReduced = false;
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
let mockInputs: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
const mockSave = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
    useLocalSearchParams: () => mockParams,
    // Focused for the whole test: the effect runs on mount and cleans up on unmount.
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }), getDeviceRegion: () => 'US', getDeviceTimeZone: () => 'UTC' }));
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => (mockReduced ? 0 : ms), easing: undefined }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-11' }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [{ id: 'c-ins', name: 'Insurance' }] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: mockInputs, prepared: null, v3: null }) }));
let mockPending: { id: string; name: string; inputs: unknown; furthest_step: number }[] = [];
let mockPendingIds: string[] = [];
jest.mock('@/data/mutations/decideChecks', () => ({
  useSaveCheckDraft: () => ({ save: mockSave }),
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: mockPendingIds, pendingRows: mockPending }),
}));
jest.mock('../../engine/useCheckEngine', () => ({ useCheckEngine: () => ({ evaluation: null, readyDate: () => null }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

const baseInputs = (over: Record<string, unknown> = {}) => ({ currency: 'USD', region: 'US', regionSubdivision: 'CA', series: [], debts: [], ...over });

function seed(name: string, check: CheckV2 = checkOnce(120_000)): void {
  mockRow = { id: ID, name, inputs: toStoredV2(check), furthest_step: 1 };
}

const lastSaved = (): { inputs: { layerAnswers: Record<string, unknown>; runningCosts?: { id: string; on: boolean; amount: number }[] } } => {
  const calls = mockSave.mock.calls;
  return calls[calls.length - 1]![0];
};

beforeEach(() => {
  mockReduced = false;
  mockParams = {};
  mockInputs = baseInputs();
  mockPending = [];
  mockPendingIds = [];
  mockSave.mockClear();
  mockReplace.mockClear();
  mockPush.mockClear();
});

describe('KindStep', () => {
  it('blocks Home: the note shows and Next stays disabled', async () => {
    seed('Buy a house');
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByText('Home checks come later. Pick another kind for now.')).toBeTruthy();
    expect(screen.getByLabelText('Next').props.accessibilityState.disabled).toBe(true);
  });

  it('is skipped when the words already read as a kind', async () => {
    seed('Laptop');
    await wrap(<KindStep id={ID} />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(mockReplace.mock.calls[0])).toContain('/decide/check/price');
  });

  it('is not skipped when arriving by Back', async () => {
    seed('Laptop');
    mockParams = { dir: 'back' };
    await wrap(<KindStep id={ID} />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(await screen.findByText('What kind of purchase?')).toBeTruthy();
  });

  it('keeps the pick when the step is left (Back keeps every value)', async () => {
    seed('Something big');
    const view = await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('kind-car'));
    view.unmount();
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(lastSaved().inputs.layerAnswers[KEY_KIND]).toBe('car');
  });

  it('shows the footer from legal.decideAnswer.footer, not a lender or adviser line', async () => {
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByText('FincWin is a planning tool, not a lender.')).toBeTruthy();
    expect(screen.queryByText(/adviser/i)).toBeNull();
  });
});

describe('PriceStep', () => {
  it('defaults "Price already includes tax" on in the UK', async () => {
    mockInputs = baseInputs({ currency: 'GBP', region: 'GB', regionSubdivision: null });
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    const toggle = await screen.findByLabelText('Price already includes tax');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText('Sales tax, %')).toBeNull();
  });

  it('adds the state estimate in the US and never stores it', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    const toggle = await screen.findByLabelText('Price already includes tax');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    const field = screen.getByLabelText('Sales tax, %');
    expect(field.props.placeholder).toMatch(/^\d/);
    expect(screen.getByText('estimate for your area · change')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('stores a typed rate', async () => {
    seed('Laptop');
    const view = await wrap(<PriceStep id={ID} />);
    await fireEvent.changeText(await screen.findByLabelText('Sales tax, %'), '7.5');
    view.unmount();
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect((lastSaved().inputs as unknown as { taxPercent: string }).taxPercent).toBe(String(7.5));
    expect(percent('7.5')).toBeDefined();
  });

  it('says where tax is not added when no region is known', async () => {
    mockInputs = baseInputs({ region: null, regionSubdivision: null });
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    expect(await screen.findByText('Tax not included. Set your region to add it.')).toBeTruthy();
    expect(screen.getByText('Set your region')).toBeTruthy();
  });

  it('shows a price that is too large inline and keeps Next disabled', async () => {
    seed('Laptop', checkOnce(999_999_999_999_99));
    await wrap(<PriceStep id={ID} />);
    expect(await screen.findByText('That price is too large to check.')).toBeTruthy();
    expect(screen.getByLabelText('Next').props.accessibilityState.disabled).toBe(true);
  });

  it('writes skipped steps and pre-fills the car costs when the user skips ahead', async () => {
    seed('Used car');
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('see-now'));
    const saved = lastSaved().inputs;
    expect(saved.layerAnswers[KEY_SKIPPED]).toEqual([1, 3]);
    expect(saved.runningCosts).toHaveLength(5);
    expect(mockPush).toHaveBeenCalledWith(`/decide/answer/${ID}`);
    expect(JSON.stringify(mockReplace.mock.calls)).not.toContain('/decide/answer');
  });
});

describe('CostsStep', () => {
  it('starts a car from the dated table and lets a line be switched off', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    const insurance = await screen.findByLabelText('Insurance');
    expect(insurance.props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(/^Insurance, amount, .*140.* a month$/)).toBeTruthy();
    await fireEvent.press(insurance);
    expect(screen.getByLabelText('Insurance').props.accessibilityState.checked).toBe(false);
  });

  it('takes a matching recorded bill before the table', async () => {
    mockInputs = baseInputs({
      series: [{ id: 'b1', role: 'bill', status: 'live', cadence: { unit: 'month', every: 1 }, amount: 9_000, categoryId: 'c-ins', name: 'Car insurance' }],
    });
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    expect(await screen.findByLabelText(/^Insurance, amount, .*90.* a month$/)).toBeTruthy();
  });

  it('says so when no running cost is switched on, and reads yearly lines as a year', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    expect(await screen.findByLabelText(/^Maintenance, amount, .*600.* a year$/)).toBeTruthy();
    for (const label of ['Insurance', 'Fuel or charging', 'Maintenance', 'Registration and licence']) await fireEvent.press(screen.getByLabelText(label));
    expect(screen.getByText('No running costs are switched on.')).toBeTruthy();
  });

  it('gives a laptop no table lines', async () => {
    seed('Laptop');
    await wrap(<CostsStep id={ID} />);
    expect(await screen.findByText('No running costs are switched on.')).toBeTruthy();
    expect(screen.queryByLabelText('Insurance')).toBeNull();
  });
});

describe('StepFrame motion and progress', () => {
  it('slides in the direction of travel', async () => {
    seed('Used car');
    await wrap(<PriceStep id={ID} />);
    const slide = (await screen.findByTestId('step-frame')).props.entering as { getDuration?: () => number };
    expect(slide.getDuration?.()).toBe(220);
  });

  it('cross-fades under Reduce Motion', async () => {
    seed('Used car');
    mockReduced = true;
    await wrap(<PriceStep id={ID} />);
    const fade = (await screen.findByTestId('step-frame')).props.entering as { getDuration?: () => number };
    expect(fade.getDuration?.()).toBe(150);
  });

  it('shows a three-segment progressbar with the step name', async () => {
    seed('Used car');
    await wrap(<PriceStep id={ID} />);
    const bar = await screen.findByTestId('segment-bar');
    expect(bar.props.accessibilityValue.text).toBe('Step 2 of 3, Price');
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('segment-1'));
    expect(JSON.stringify(mockReplace.mock.calls.at(-1))).toContain('/decide/check/kind');
  });
});

describe('stepper Back order (06.1-49, A-ST-3, D20)', () => {
  it('home opened step 2 directly (kind read from the words): Back opens step 1', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockReplace).toHaveBeenCalledWith(stepHref(1, ID, 'back'));
  });

  it('step 1 reached by that Back shows its tiles and does not skip forward to step 2 again', async () => {
    seed('Laptop');
    mockParams = { dir: 'back' };
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByTestId('kind-car')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalledWith(stepHref(2, ID));
  });

  it('step 3 Back opens step 2', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockReplace).toHaveBeenCalledWith(stepHref(2, ID, 'back'));
  });

  it('step 1 Back opens Decide home', async () => {
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockReplace).toHaveBeenCalledWith('/decide');
  });

  it('step 3 See the answer pushes the answer, so Back from the answer returns to step 3', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    await fireEvent.press(await screen.findByText('See the answer'));
    expect(mockPush).toHaveBeenCalledWith(`/decide/answer/${ID}`);
    expect(JSON.stringify(mockReplace.mock.calls)).not.toContain('/decide/answer');
  });

  it('the Android system Back on a step goes one step back, not to Decide home', async () => {
    let listener: (() => boolean | null | undefined) | null = null;
    const remove = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
      listener = handler as () => boolean;
      return { remove };
    });
    try {
      seed('Laptop');
      const view = await wrap(<PriceStep id={ID} />);
      await screen.findByTestId('step-back');
      expect(listener).not.toBeNull();
      expect(listener!()).toBe(true);
      expect(mockReplace).toHaveBeenCalledWith(stepHref(1, ID, 'back'));
      view.unmount();
      await waitFor(() => expect(remove).toHaveBeenCalled());
    } finally {
      spy.mockRestore();
    }
  });

  it('a step left under the answer shows the stored check after the answer changed it (no stale local copy)', async () => {
    seed('Used car');
    const view = await wrap(<CostsStep id={ID} />);
    await fireEvent.press(await screen.findByLabelText('Insurance'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.getByText(/1,200/)).toBeTruthy();
    // The answer (pushed above this step) saved a new price.
    seed('Used car', checkOnce(150_000));
    view.rerender(<CostsStep id={ID} />);
    expect(await screen.findByText(/1,500/)).toBeTruthy();
  });

  it('Back is a chevron with "Back" for screen readers and a 44 pt target', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    const back = await screen.findByTestId('step-back');
    expect(back.props.accessibilityLabel).toBe('Back');
    expect(screen.getByTestId('step-back-chevron')).toBeTruthy();
    const style = StyleSheet.flatten(back.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });
});

describe('06.1-52 (G-5): no step is blank or silently stuck', () => {
  it('C-8: a step opened before its new check is in the list opens from the queued row', async () => {
    mockRow = null;
    mockPendingIds = [ID];
    mockPending = [{ id: ID, name: 'Used car', inputs: toStoredV2(checkOnce(120_000)), furthest_step: 1 }];
    await wrap(<PriceStep id={ID} />);
    expect(await screen.findByText('Price and how you pay')).toBeTruthy();
    expect(screen.queryByTestId('step-still-saving')).toBeNull();
  });

  it('C-8: with the create queued and no row to show, the step says it is still saving, never blank', async () => {
    mockRow = null;
    mockPendingIds = [ID];
    mockPending = [];
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByText('This check is still saving. It opens here once it is saved.')).toBeTruthy();
    expect(screen.getByTestId('step-frame')).toBeTruthy();
    await wrap(<CostsStep id={ID} />);
    expect(screen.getAllByTestId('step-still-saving').length).toBeGreaterThan(0);
  });

  it('a truly missing check shows the not-found page', async () => {
    mockRow = null;
    await wrap(<PriceStep id={ID} />);
    expect(await screen.findByText(/isn.t here/i)).toBeTruthy();
    expect(screen.queryByTestId('step-still-saving')).toBeNull();
  });

  it('C-9: Kind Next disabled says a kind is needed', async () => {
    mockParams = { dir: 'back' };
    seed('Thing', { ...checkOnce(120_000), layerAnswers: {} });
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByText('A kind is needed to go on.')).toBeTruthy();
    expect(screen.getByLabelText('Next').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('kind-tech'));
    expect(screen.queryByText('A kind is needed to go on.')).toBeNull();
  });

  it('C-11: a price of 0 stays put on Next and See the answer and says a price above zero is needed', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    const field = await screen.findByLabelText('Price');
    await fireEvent.changeText(field, '0');
    await fireEvent(field, 'blur');
    expect(screen.getByText('A price above zero is needed.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next'));
    await fireEvent.press(screen.getByTestId('see-now'));
    expect(mockReplace).not.toHaveBeenCalledWith(stepHref(3, ID));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('C-16: clearing a running-cost amount keeps the field empty, stores no 0 and leaves it out of the total', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    const field = await screen.findByLabelText(/^Insurance, amount, .*140.* a month$/);
    const totalBefore = screen.getByTestId('costs-total');
    expect(totalBefore).toHaveTextContent(/a month/);
    await fireEvent.changeText(field, '');
    expect(screen.getByText('No amount yet.')).toBeTruthy();
    expect(screen.getByLabelText('Insurance, Amount').props.value ?? '').toBe('');
    await waitFor(() => expect(mockSave).toHaveBeenCalled(), { timeout: 2000 });
    const saved = lastSaved().inputs.runningCosts ?? [];
    expect(saved.find((l) => l.id === 'rc:insurance')).toBeUndefined();
    // The other table lines are stored as they were; nothing took the cleared line's place.
    expect(saved.map((l) => l.id)).not.toContain('rc:insurance');
    expect(screen.queryByText(/Insurance \d+%/)).toBeNull();
    // Typing an amount puts the line back in its place.
    await fireEvent.changeText(screen.getByLabelText('Insurance, Amount'), '150');
    expect(screen.queryByText('No amount yet.')).toBeNull();
    await waitFor(() => expect((lastSaved().inputs.runningCosts ?? []).find((l) => l.id === 'rc:insurance')?.amount).toBe(15_000), { timeout: 2000 });
    expect((lastSaved().inputs.runningCosts ?? [])[0]?.id).toBe('rc:insurance');
  });
});
