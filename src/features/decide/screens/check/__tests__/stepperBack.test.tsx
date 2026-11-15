// 06.1-64 (H-3, FQ2, CN-1, DN-3): the stepper's one Back rule. A step the answer opened (from=answer) returns to that same answer for
// the chevron, the Android Back and "See the answer"; the forward path steps back one step; nothing ever exits the app.
import React from 'react';
import { BackHandler } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { wrap } from '@/test/stepProps';
import { withFromAnswer } from '../../logic/decideNav';
import { CostsStep } from '../CostsStep';
import { KindStep } from '../KindStep';
import { PriceStep } from '../PriceStep';
import { KEY_KIND, stepHref } from '../useStepCheck';

jest.setTimeout(30000);

const ID = '11111111-1111-4111-8111-111111111111';
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
let mockParams: Record<string, string> = {};
let mockCanGoBack = true;
const mockSave = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: {
      replace: (...a: unknown[]) => mockReplace(...a),
      push: (...a: unknown[]) => mockPush(...a),
      back: () => mockBack(),
      canGoBack: () => mockCanGoBack,
      dismissTo: (...a: unknown[]) => mockDismissTo(...a),
    },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }), getDeviceRegion: () => 'US', getDeviceTimeZone: () => 'UTC' }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-11' }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: { currency: 'USD', region: 'US', regionSubdivision: 'CA', series: [], debts: [] }, prepared: null, v3: null }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({
  useSaveCheckDraft: () => ({ save: mockSave }),
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: [], pendingRows: [] }),
}));
jest.mock('../../engine/useCheckEngine', () => ({ useCheckEngine: () => ({ evaluation: null, readyDate: () => null }) }));
jest.mock('../../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: null }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

function seed(name: string, check: CheckV2 = checkOnce(120_000)): void {
  mockRow = { id: ID, name, inputs: toStoredV2(check), furthest_step: 1 };
}

/** Captures the step's Android Back listener (StepFrame registers it while focused). */
function captureBack(): { press: () => boolean | null | undefined; restore: () => void } {
  let listener: (() => boolean | null | undefined) | null = null;
  const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    listener = handler as () => boolean;
    return { remove: jest.fn() };
  });
  return { press: () => listener!(), restore: () => spy.mockRestore() };
}

beforeEach(() => {
  mockParams = {};
  mockCanGoBack = true;
  jest.clearAllMocks();
});

describe('a step opened from the answer (from=answer)', () => {
  it('chevron Back saves the edit and goes back to that answer once, never replacing or pushing', async () => {
    mockParams = { id: ID, dir: 'back', from: 'answer' };
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('kind-car'));
    await fireEvent.press(screen.getByTestId('step-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    // Flushed before leaving, so the answer below judges the new kind.
    expect(mockSave).toHaveBeenCalled();
    expect(mockSave.mock.calls.at(-1)![0].inputs.layerAnswers[KEY_KIND]).toBe('car');
  });

  it('"See the answer" goes back to the answer, not a second pushed answer', async () => {
    mockParams = { id: ID, dir: 'back', from: 'answer' };
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByText('See the answer now'));
    expect(mockSave).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('step 3 "See the answer" goes back to the answer too', async () => {
    mockParams = { id: ID, dir: 'back', from: 'answer' };
    seed('Used car');
    await wrap(<CostsStep id={ID} />);
    await fireEvent.press(await screen.findByText('See the answer'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Next and the step bar keep from=answer, so a later step still returns to the answer', async () => {
    mockParams = { id: ID, dir: 'back', from: 'answer' };
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('kind-car'));
    await fireEvent.press(screen.getByLabelText('Next'));
    expect(mockReplace).toHaveBeenCalledWith(withFromAnswer(stepHref(2, ID)));
  });

  it('DN-3: answer -> step 3 -> Android Back x3 never exits the app and ends on the answer or Decide home', async () => {
    const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    const back = captureBack();
    try {
      mockParams = { id: ID, dir: 'back', from: 'answer' };
      seed('Used car');
      await wrap(<CostsStep id={ID} />);
      await screen.findByTestId('step-back');
      expect(back.press()).toBe(true);
      expect(mockBack).toHaveBeenCalledTimes(1);
      // Nothing below (opened by a deep link): Decide home, never the launcher.
      mockCanGoBack = false;
      expect(back.press()).toBe(true);
      expect(back.press()).toBe(true);
      expect(mockDismissTo).toHaveBeenCalledWith('/decide');
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      back.restore();
      exit.mockRestore();
    }
  });
});

describe('a step on the forward path (no from)', () => {
  it('step 2 Back replaces to step 1', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockReplace).toHaveBeenCalledWith(stepHref(1, ID, 'back'));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('step 1 Back dismisses to Decide home', async () => {
    mockParams = { dir: 'back' };
    seed('Something big');
    await wrap(<KindStep id={ID} />);
    await fireEvent.press(await screen.findByTestId('step-back'));
    expect(mockDismissTo).toHaveBeenCalledWith('/decide');
    expect(mockReplace).not.toHaveBeenCalledWith('/decide');
  });

  it('"See the answer" pushes the answer (06.1-49)', async () => {
    seed('Laptop');
    await wrap(<PriceStep id={ID} />);
    await fireEvent.press(await screen.findByText('See the answer now'));
    expect(mockPush).toHaveBeenCalledWith(`/decide/answer/${ID}`);
    expect(mockBack).not.toHaveBeenCalled();
  });
});
