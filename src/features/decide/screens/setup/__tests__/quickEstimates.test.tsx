// 06.1-39: D39 quick estimates: the live line, the write (rough_income, rough_spending = bills + everyday, rough_as_of), bounds, and the route's returnTo.
// 06.1-65 (CC-7, CN-5 a): the write is the undoable setup save with a "Quick estimates saved." toast; save mode says "Save" and goes back.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { expectFits } from '@/test/textFitMatrix';
import { safeReturnTo } from '../safeReturnTo';
import { QuickEstimatesScreen } from '../QuickEstimatesScreen';

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/shell/header/SyncProblemLine', () => ({ SyncProblemLine: () => null }));
jest.mock('@/shell/header/DetailHeader', () => ({ DetailHeader: () => null }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: () => undefined }));
let mockParams: Record<string, string | undefined> = {};
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, dismissTo: mockDismissTo, canGoBack: () => mockCanGoBack, push: jest.fn(), replace: jest.fn() }),
}));
let mockUserId: string | null = 'u1';
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: mockUserId }) }));
const mockSave = jest.fn((..._a: unknown[]) => ({ stepId: 'step-quick' }) as { stepId: string } | null);
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSave }) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
const savedPatch = (): Record<string, unknown> => (mockSave.mock.calls[0]?.[0] as { patch: Record<string, unknown> }).patch;

const INCOME = 'About how much comes in each month?';
const BILLS = 'About how much goes on bills?';
const EVERYDAY = 'About how much on everyday spending?';

async function setup(over: Partial<React.ComponentProps<typeof QuickEstimatesScreen>> = {}, scale = 1) {
  const onDone = jest.fn();
  await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={null} onDone={onDone} {...over} />, scale);
  return { onSave: mockSave, onDone };
}
async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockParams = {};
  mockCanGoBack = true;
  mockUserId = 'u1';
});
afterEach(() => jest.useRealTimers());

describe('QuickEstimatesScreen', () => {
  it('shows the three questions, the hint and the legal footer; the footnote opens under Why? (06.1-60)', async () => {
    await setup();
    expect(screen.getByText('Round numbers are fine.')).toBeTruthy();
    expect(screen.getByLabelText(INCOME)).toBeTruthy();
    expect(screen.getByLabelText(BILLS)).toBeTruthy();
    expect(screen.getByLabelText(EVERYDAY)).toBeTruthy();
    expect(screen.queryByText('Quick estimates count only until your records cover a full month.')).toBeNull();
    await fireEvent.press(screen.getByTestId('quick-why'));
    expect(screen.getByText('Before your records are ready.')).toBeTruthy();
    expect(screen.getByText('Quick estimates count only until your records cover a full month.')).toBeTruthy();
    expect(screen.getByTestId('quick-footer')).toBeTruthy();
  });

  it('is not ready until all three figures are valid', async () => {
    const { onSave } = await setup();
    await type(INCOME, '3200');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('live line: what a usual month leaves, then how short it is', async () => {
    await setup();
    await type(INCOME, '3200');
    await type(BILLS, '1850');
    await type(EVERYDAY, '925');
    expect(screen.getByText('A usual month leaves about $425 by these estimates.')).toBeTruthy();
    await type(EVERYDAY, '2000');
    expect(screen.getByText('A usual month is about $650 short by these estimates.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('writes rough_income, rough_spending = bills + everyday and rough_as_of, then finishes', async () => {
    const { onSave, onDone } = await setup();
    await type(INCOME, '3200');
    await type(BILLS, '1850');
    await type(EVERYDAY, '925');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedPatch()).toEqual({ rough_income: 320000, rough_spending: 277500, rough_as_of: '2026-11-11', currency: 'USD' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('leaves saving, debt and invest out of the write', async () => {
    const { onSave } = await setup();
    await type(INCOME, '100');
    await type(BILLS, '40');
    await type(EVERYDAY, '10');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = savedPatch();
    expect(Object.keys(patch).sort()).toEqual(['currency', 'rough_as_of', 'rough_income', 'rough_spending']);
  });

  it('refuses a huge amount', async () => {
    const { onSave } = await setup();
    await type(INCOME, '99999999999999999');
    await type(BILLS, '10');
    await type(EVERYDAY, '10');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses bills and everyday that sum to zero', async () => {
    const { onSave } = await setup();
    await type(INCOME, '100');
    await type(BILLS, '0');
    await type(EVERYDAY, '0');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fits at large text', async () => {
    await setup({}, 2);
    expectFits();
  });
});

describe('QuickEstimatesScreen save toast and save mode (06.1-65)', () => {
  async function fill() {
    await type(INCOME, '3200');
    await type(BILLS, '1850');
    await type(EVERYDAY, '925');
  }

  it('CC-7: saving toasts "Quick estimates saved." with the write’s step id, named Quick estimates in History', async () => {
    await setup();
    await fill();
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ stepTitle: 'Quick estimates' }));
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setup.quick.saved' }, stepId: 'step-quick' });
  });

  it('CC-7: figures that match what is stored write nothing, so the toast has no step', async () => {
    mockSave.mockReturnValueOnce(null);
    await setup();
    await fill();
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: null }));
  });

  it('CN-5 (a): in save mode the button says Save estimates and the screen goes back, not to Decide home', async () => {
    mockParams = { mode: 'save' };
    const { onDone } = await setup();
    expect(screen.queryByText('See the answer now')).toBeNull();
    await fill();
    await fireEvent.press(screen.getByText('Save estimates'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('CN-5 (a): save mode with no history lands on the checklist', async () => {
    mockParams = { mode: 'save' };
    mockCanGoBack = false;
    await setup();
    await fill();
    await fireEvent.press(screen.getByText('Save estimates'));
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('with no signed-in person nothing is written, and the screen still moves on', async () => {
    mockUserId = null;
    const { onDone } = await setup();
    await fill();
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

type ScrollJson = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
function findScroll(node: unknown): ScrollJson | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findScroll(n);
      if (hit) return hit;
    }
    return null;
  }
  const j = node as ScrollJson;
  if (j.type === 'RCTScrollView') return j;
  return findScroll(j.children ?? null);
}

describe('QuickEstimatesScreen pre-fill, need line and first tap (06.1-58 A-SU-6, UX-11)', () => {
  const STORED = { currency: 'USD', rough_income: 300000, rough_spending: 200000 } as unknown as React.ComponentProps<typeof QuickEstimatesScreen>['stored'];

  it('starts from the saved rough figures: income, the spending sum in bills and everyday at 0', async () => {
    await setup({ stored: STORED });
    expect(screen.getByLabelText(INCOME).props.value).toBe('3,000');
    expect(screen.getByLabelText(BILLS).props.value).toBe('2,000');
    expect(screen.getByLabelText(EVERYDAY).props.value).toBe('0');
    expect(screen.getByText('A usual month leaves about $1,000 by these estimates.')).toBeTruthy();
    expect(screen.queryByTestId('quick-need')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('a null saved figure stays empty', async () => {
    await setup({ stored: { ...STORED, rough_spending: null } as typeof STORED });
    expect(screen.getByLabelText(INCOME).props.value).toBe('3,000');
    expect(screen.getByLabelText(BILLS).props.value).toBe('');
    expect(screen.getByLabelText(EVERYDAY).props.value).toBe('');
  });

  it('figures saved in another currency are not shown as this one', async () => {
    await setup({ stored: { ...STORED, currency: 'EUR' } as typeof STORED });
    expect(screen.getByLabelText(INCOME).props.value).toBe('');
    expect(screen.getByLabelText(BILLS).props.value).toBe('');
  });

  it('settings that arrive after the first render fill the untouched fields', async () => {
    const onDone = jest.fn();
    const { rerender } = await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={null} onDone={onDone} />);
    expect(screen.getByLabelText(INCOME).props.value).toBe('');
    await act(async () => {
      rerender(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={STORED} onDone={onDone} />);
    });
    expect(screen.getByLabelText(INCOME).props.value).toBe('3,000');
  });

  it('once something is typed, late settings change nothing', async () => {
    const onDone = jest.fn();
    const { rerender } = await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={null} onDone={onDone} />);
    await type(INCOME, '500');
    await act(async () => {
      rerender(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={STORED} onDone={onDone} />);
    });
    expect(screen.getByLabelText(INCOME).props.value).toBe('500');
    expect(screen.getByLabelText(BILLS).props.value).toBe('');
  });

  it('the line under the disabled button names the first figure still missing', async () => {
    await setup();
    expect(screen.getByTestId('quick-need')).toHaveTextContent('What comes in each month is still needed.');
    await type(INCOME, '3200');
    expect(screen.getByTestId('quick-need')).toHaveTextContent('What goes on bills is still needed.');
    await type(BILLS, '0');
    expect(screen.getByTestId('quick-need')).toHaveTextContent('Everyday spending is still needed.');
    await type(EVERYDAY, '0');
    expect(screen.getByTestId('quick-need')).toHaveTextContent('Bills and everyday spending need to come to more than 0.');
    await type(EVERYDAY, '10');
    expect(screen.queryByTestId('quick-need')).toBeNull();
  });

  it('the title is a display headline, the fields carry the currency symbol, and taps land with the keyboard open', async () => {
    const r = await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={STORED} onDone={jest.fn()} />);
    expect(screen.getByTestId('quick-headline')).toHaveTextContent('A first answer from three estimates');
    expect(screen.getAllByText('$').length).toBeGreaterThanOrEqual(3);
    expect(findScroll(r.toJSON())?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('one tap on See the answer now saves while a field still has focus', async () => {
    const { onDone } = await setup({ stored: STORED });
    const field = screen.getByLabelText(EVERYDAY);
    await fireEvent(field, 'focus');
    await type(EVERYDAY, '500');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(savedPatch()).toEqual({ rough_income: 300000, rough_spending: 250000, rough_as_of: '2026-11-11', currency: 'USD' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('safeReturnTo', () => {
  it('follows a path inside /decide and nothing else', () => {
    expect(safeReturnTo('/decide/answer/0b2f3c4d-1111-2222-3333-444455556666')).toBe('/decide/answer/0b2f3c4d-1111-2222-3333-444455556666');
    expect(safeReturnTo('/decide')).toBe('/decide');
    expect(safeReturnTo(undefined)).toBe('/decide');
    expect(safeReturnTo('https://example.com')).toBe('/decide');
    expect(safeReturnTo('//evil.example')).toBe('/decide');
    expect(safeReturnTo('/decide/../settings')).toBe('/decide');
    expect(safeReturnTo(['/decide/check/price'])).toBe('/decide/check/price');
  });

  it('also follows exactly the onboarding import step, with a plain accountId only', () => {
    expect(safeReturnTo('/setup/history')).toBe('/setup/history');
    expect(safeReturnTo('/setup/history?accountId=acc-1_x')).toBe('/setup/history?accountId=acc-1_x');
    expect(safeReturnTo('/setup/history?accountId=a&next=https://evil.example')).toBe('/decide');
    expect(safeReturnTo('/setup/history/../account')).toBe('/decide');
    expect(safeReturnTo('/setup/history?accountId=')).toBe('/decide');
    expect(safeReturnTo('/setup/account')).toBe('/decide');
    expect(safeReturnTo('//setup/history')).toBe('/decide');
    expect(safeReturnTo('https://x.example/setup/history')).toBe('/decide');
  });
});
