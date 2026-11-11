// 06.1-19: the big-buy stepper on stored drafts. Data hooks are mocked at the query/mutation edge; the hook, steps and frame are real.
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { percent } from '@/engine/decide';
import { toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { wrap } from '@/test/stepProps';
import { CostsStep } from '../CostsStep';
import { KindStep } from '../KindStep';
import { PriceStep } from '../PriceStep';
import { KEY_KIND, KEY_SKIPPED } from '../useStepCheck';

jest.setTimeout(30000);

const ID = '11111111-1111-4111-8111-111111111111';
let mockReduced = false;
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
let mockInputs: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
const mockSave = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
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
jest.mock('@/data/mutations/decideChecks', () => ({ useSaveCheckDraft: () => ({ save: mockSave }) }));
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
  mockSave.mockClear();
  mockReplace.mockClear();
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
    expect(JSON.stringify(mockReplace.mock.calls[0])).toContain(`/decide/answer/${ID}`);
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
