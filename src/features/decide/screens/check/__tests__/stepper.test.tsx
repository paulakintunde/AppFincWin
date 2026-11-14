// 06.1-19: the big-buy stepper on stored drafts. Data hooks are mocked at the query/mutation edge; the hook, steps and frame are real.
import React from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { percent } from '@/engine/decide';
import { toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { interceptSwipeBack, setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import { wrap } from '@/test/stepProps';
import { DEFAULT_PAIRING } from '@/theme/themeCache';
import { textRole } from '@/theme/typography';
import { withFromAnswer } from '../../logic/decideNav';
import { CostsStep } from '../CostsStep';
import { KindStep } from '../KindStep';
import { PriceStep } from '../PriceStep';
import { StepFrame } from '../StepFrame';
import { KEY_DEALER_FEES } from '../oneOffPresets';
import { KEY_PLAN_NAME } from '../planName';
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
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a), dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: jest.fn(), canGoBack: () => true },
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
  mockDismissTo.mockClear();
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
    // 06.1-60 (G-10): "Tax not added" stays on the Up front card; the full notice and its link open under the tax switch's Why?.
    expect(await screen.findByTestId('tax-not-added')).toBeTruthy();
    expect(screen.queryByText('Tax not included. Set your region to add it.')).toBeNull();
    await fireEvent.press(screen.getByTestId('tax-why'));
    expect(screen.getByText('Tax not included. Set your region to add it.')).toBeTruthy();
    expect(screen.getByText('Set your region')).toBeTruthy();
    // 06.1-71 (CN-10, OQ-71-1 B): the link opens You scrolled to its Region row, not the bare You root.
    await fireEvent.press(screen.getByTestId('set-region'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/you', params: { focus: 'region' } });
    expect(mockPush).not.toHaveBeenCalledWith('/you');
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

  it('step 1 Back opens the Decide home already in the stack (06.1-64 CN-4: dismissTo, not replace)', async () => {
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockDismissTo).toHaveBeenCalledWith('/decide');
    expect(mockReplace).not.toHaveBeenCalledWith('/decide');
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

describe('06.1-57 (G-8 part 2): the stepper to the prototype', () => {
  const noTax = (price = 900_000): CheckV2 => ({ ...checkOnce(price), taxIncluded: true });

  it('A-ST-2: the segments show their names, and done steps show their crumbs as visible text', async () => {
    seed('Used car', noTax());
    await wrap(<CostsStep id={ID} />);
    expect(await screen.findByTestId('crumb-1')).toHaveTextContent('✓ Kind: Car');
    expect(screen.getByTestId('crumb-2')).toHaveTextContent('✓ Price: $9,000');
    expect(screen.getByTestId('segment-label-3')).toHaveTextContent('Running costs');
  });

  it('A-ST-2: on step 2 the kind is a crumb and Price and Running costs are plain names', async () => {
    seed('Used car', noTax());
    await wrap(<PriceStep id={ID} />);
    expect(await screen.findByTestId('crumb-1')).toHaveTextContent('✓ Kind: Car');
    expect(screen.getByTestId('segment-label-2')).toHaveTextContent('Price');
    expect(screen.getByTestId('segment-label-3')).toHaveTextContent('Running costs');
    expect(screen.getByTestId('segment-1').props.accessibilityLabel).toBe('Step 1, Kind: Car, done. Change it.');
  });

  it('DB-9: the Kind crumb opens step 1 and keeps from=answer', async () => {
    seed('Used car', noTax());
    mockParams = { from: 'answer' };
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('segment-1'));
    expect(mockReplace).toHaveBeenLastCalledWith(withFromAnswer(stepHref(1, ID, 'back')));
  });

  it('DB-9: the Price crumb on step 3 opens step 2', async () => {
    seed('Used car', noTax());
    await wrap(<CostsStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('segment-2'));
    expect(mockReplace).toHaveBeenLastCalledWith(stepHref(2, ID, 'back'));
  });

  it('DB-9: a crumb that cannot open a step has no button role', async () => {
    await wrap(
      <StepFrame step={2} title="T" why="W" meta="M" kindLabel="Car" onBack={jest.fn()} onNext={jest.fn()}>
        {null}
      </StepFrame>,
    );
    expect(screen.getByTestId('crumb-1')).toHaveTextContent('✓ Kind: Car');
    expect(screen.getByTestId('segment-1').props.accessibilityRole).toBeUndefined();
  });

  it('X-3: the step title uses the display face at the prototype size', async () => {
    seed('Used car', noTax());
    await wrap(<PriceStep id={ID} />);
    const title = await screen.findByText('Price and how you pay');
    const style = StyleSheet.flatten(title.props.style);
    expect(style.fontSize).toBe(26);
    expect(style.fontFamily).toBe(textRole(DEFAULT_PAIRING, 'display').fontFamily);
  });

  it('A-ST-5: "Read from the words" shows while the kind came from the words, and goes once one is picked', async () => {
    seed('Buy a house');
    await wrap(<KindStep id={ID} />);
    expect(await screen.findByText('Read from the words: Home')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('kind-car'));
    expect(screen.queryByTestId('kind-read-from')).toBeNull();
  });

  it('A-ST-5: no read-from line when nothing was read from the words', async () => {
    mockParams = { dir: 'back' };
    seed('Thing', { ...checkOnce(120_000), layerAnswers: {} });
    await wrap(<KindStep id={ID} />);
    await screen.findByTestId('kind-car');
    expect(screen.queryByTestId('kind-read-from')).toBeNull();
  });

  it('Android edge swipe (from 06.1-64): a step claims the swipe and goes one step back; leaving releases it', async () => {
    setSwipeBackInterceptor(null);
    seed('Laptop');
    const view = await wrap(<PriceStep id={ID} />);
    await screen.findByTestId('step-back');
    expect(interceptSwipeBack()).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith(stepHref(1, ID, 'back'));
    await view.unmount();
    expect(interceptSwipeBack()).toBe(false);
  });

  it('Android edge swipe from a step the answer opened goes back to that answer, not a step back', async () => {
    setSwipeBackInterceptor(null);
    seed('Laptop');
    mockParams = { from: 'answer' };
    const view = await wrap(<CostsStep id={ID} />);
    await screen.findByTestId('step-back');
    expect(interceptSwipeBack()).toBe(true);
    expect(mockReplace).not.toHaveBeenCalledWith(stepHref(2, ID, 'back'));
    expect(mockReplace).not.toHaveBeenCalledWith(withFromAnswer(stepHref(2, ID, 'back')));
    view.unmount();
  });

  it('A-ST-1: sales tax is a boxed field with a % after it; the price has the currency sign', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    await screen.findByLabelText('Sales tax, %');
    const card = screen.getByTestId('price-card');
    expect(within(card).getByTestId('field-suffix')).toHaveTextContent('%');
    expect(within(card).getByTestId('money-symbol')).toHaveTextContent('$');
  });

  it('A-ST-4: the pay choice is two cards with their figures; Installments opens the plan sheet', async () => {
    seed('Used car', noTax());
    await wrap(<PriceStep id={ID} />);
    const cash = await screen.findByLabelText('Cash, $9,000 up front');
    expect(cash.props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('pay-cash-sub')).toHaveTextContent('$9,000 up front');
    await fireEvent.press(screen.getByLabelText('Installments'));
    expect(await screen.findByText('Installment plan')).toBeTruthy();
  });

  it('A-ST-4 / T-06.1-57-01: dealer fees start off and add nothing until an amount is typed', async () => {
    seed('Used car', noTax());
    const view = await wrap(<PriceStep id={ID} />);
    const toggle = await screen.findByLabelText('Dealer and documentation fees');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(toggle);
    const amount = screen.getByLabelText('Dealer and documentation fees, Amount');
    expect(amount.props.value ?? '').toBe('');
    expect(screen.getByTestId('dealer-fees-need')).toBeTruthy();
    await waitFor(() => expect(mockSave).toHaveBeenCalled(), { timeout: 2000 });
    expect((lastSaved().inputs as unknown as { oneOffFees: number }).oneOffFees).toBe(0);
    await fireEvent.changeText(amount, '300');
    expect(within(screen.getByTestId('up-front-card')).getByText('$9,300')).toBeTruthy();
    view.unmount();
    await waitFor(() => expect((lastSaved().inputs as unknown as { oneOffFees: number }).oneOffFees).toBe(30_000));
    expect(lastSaved().inputs.layerAnswers[KEY_DEALER_FEES]).toEqual({ on: true, amount: 30_000 });
  });

  it('A-ST-4: switching dealer fees off takes their amount out again', async () => {
    seed('Used car', { ...noTax(), oneOffFees: 30_000 as never, layerAnswers: { [KEY_DEALER_FEES]: { on: true, amount: 30_000 } } });
    const view = await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByLabelText('Dealer and documentation fees'));
    view.unmount();
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect((lastSaved().inputs as unknown as { oneOffFees: number }).oneOffFees).toBe(0);
    expect(lastSaved().inputs.layerAnswers[KEY_DEALER_FEES]).toEqual({ on: false, amount: 30_000 });
  });

  it('A-ST-4: the trade-in row opens the sale sheet', async () => {
    seed('Used car', noTax());
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('trade-in-row'));
    expect(await screen.findByText('I’m selling one I have now')).toBeTruthy();
  });

  it('DS-18: with nothing added, the Up front card shows the price once', async () => {
    seed('Used car', noTax());
    await wrap(<PriceStep id={ID} />);
    const card = await screen.findByTestId('up-front-card');
    expect(within(card).getAllByText('$9,000')).toHaveLength(1);
    expect(within(card).queryByText('Price')).toBeNull();
  });

  it('DS-18 / A-ST-4: with tax added, the card lists the price, the tax and the total', async () => {
    seed('Used car', { ...checkOnce(900_000), taxPercent: percent('8') });
    await wrap(<PriceStep id={ID} />);
    const card = await screen.findByTestId('up-front-card');
    expect(within(card).getByText('$9,000')).toBeTruthy();
    expect(within(card).getByText('+$720')).toBeTruthy();
    expect(within(card).getByText('$9,720')).toBeTruthy();
  });

  it('A-ST-4: with no region, the Up front card says tax is not added', async () => {
    mockInputs = baseInputs({ region: null, regionSubdivision: null });
    seed('Used car');
    await wrap(<PriceStep id={ID} />);
    expect(within(await screen.findByTestId('up-front-card')).getByText('Tax not added')).toBeTruthy();
  });

  it('A-ST-6: the running costs are one card with the currency sign on each amount, and the legend shows once', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    const card = await screen.findByTestId('running-card');
    expect(within(card).getByTestId('cost-rc:insurance')).toBeTruthy();
    expect(within(card).getByTestId('cost-rc:fuel')).toBeTruthy();
    expect(within(card).getAllByTestId('money-symbol').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/^Insurance \d+%/, { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByTestId('stacked-bar').props.accessibilityLabel).toMatch(/a month\. Insurance \d+%/);
  });

  // 06.1-61 (plan 51 item 5, "yearl"): the How often pill shows its whole label. Nothing between the pill and its cost line
  // fixes a width, and the line wraps, so at a large font the amount field moves under the pill instead of squeezing it.
  it('the yearly pill shows "yearly" in full and its cost line wraps rather than squeezing it', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    const row = await screen.findByTestId('cost-rc:maintenance');
    const pill = within(row).getByLabelText('How often, yearly');
    expect(within(pill).getByText('yearly')).toBeTruthy();
    const line = within(row).getByTestId('cost-line-rc:maintenance');
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    for (let node = pill.parent; node && node !== line; node = node.parent) {
      const st = StyleSheet.flatten(node.props.style) as { width?: unknown; maxWidth?: unknown } | undefined;
      expect(st?.width).toBeUndefined();
      expect(st?.maxWidth).toBeUndefined();
    }
    const text = within(pill).getByText('yearly');
    expect(text.props.numberOfLines).toBeUndefined();
  });

  it('A-ST-6: a yearly line says what it is a month', async () => {
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    const row = await screen.findByTestId('cost-rc:maintenance');
    expect(within(row).getByText(/^about \$\d+ a month$/)).toBeTruthy();
  });

  it('A-ST-7: a plan name typed in the plan sheet is written with the pay change', async () => {
    seed('Used car', noTax());
    const view = await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByLabelText('Installments'));
    await fireEvent.changeText(await screen.findByLabelText('Plan name'), 'Car loan');
    await fireEvent.press(screen.getByLabelText('24 months'));
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    view.unmount();
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const saved = lastSaved().inputs as unknown as { pay: { mode: string; termMonths: number }; layerAnswers: Record<string, unknown> };
    expect(saved.pay).toMatchObject({ mode: 'plan', termMonths: 24 });
    expect(saved.layerAnswers[KEY_PLAN_NAME]).toBe('Car loan');
  });
});
