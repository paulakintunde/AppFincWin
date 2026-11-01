/**
 * 05.3-110 (UAT gap 27): system Back from an answer lands on Decide home in one press, however the check was opened.
 * The real BackHistoryProvider, AndroidBackHandler and AnswerScreen run over a mocked router; BackHandler listeners fire
 * newest first, as React Native does.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import { BackHistoryProvider } from '@/shell/backHistory/BackHistoryProvider';
import { AndroidBackHandler } from '@/shell/backHistory/useAndroidBackHandler';
import { TAB_ORDER } from '@/shell/tabBar/tabs';
import { wrap } from '../answer/__tests__/kit';
import { AnswerScreen } from '../answer/AnswerScreen';

jest.setTimeout(60000);

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
// The tab under the answer is Activity: the check was started from the FAB on another tab.
const mockState = {
  index: 0,
  routes: [
    {
      name: '(app)',
      state: {
        index: 1,
        routes: [
          { name: '(tabs)', state: { index: TAB_ORDER.indexOf('activity'), routes: TAB_ORDER.map((name) => ({ name })) } },
          { name: 'decide/answer/[id]' },
        ],
      },
    },
  ],
};

jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return {
    router: {
      navigate: (h: unknown) => mockNavigate(h),
      dismissTo: (h: unknown) => mockDismissTo(h),
      replace: (h: unknown) => mockReplace(h),
      canDismiss: () => true,
      back: () => mockBack(),
      canGoBack: () => true,
      push: jest.fn(),
    },
    useRootNavigationState: () => mockState,
    usePathname: () => '/decide/answer/c1',
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(cb, [cb]),
  };
});
jest.mock('@/data/queries/decideCheckV3', () => {
  const kit = jest.requireActual('../answer/__tests__/answerKit');
  const value = { status: 'ready', row: kit.rowOf(), evaluation: kit.fullEv(), withoutRefunds: null, inputs: kit.SCREEN_INPUTS };
  return { useCheckV3: () => value };
});
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: jest.fn() }),
  useReopenRedirect: () => null,
  useReopenFailed: () => false,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn(), replaceOnce: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
jest.mock('../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('../answer/__tests__/answerKit').fakeFormat }));
jest.mock('../ask/focusNode', () => ({ focusNode: jest.fn() }));
jest.mock('../ready/useReadinessAnswer', () => ({ useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: jest.fn() }) }));
jest.mock('../answer/questionBodies', () => ({ renderQuestionBody: () => null }));
jest.mock('../record/RecordSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    RecordSheet: (p: { variant: string; visible: boolean; onClose: () => void }) => (
      <Text onPress={p.onClose}>{`sheet:${p.variant}:${String(p.visible)}`}</Text>
    ),
  };
});
jest.mock('@/engine/decide/v3', () => ({
  ...jest.requireActual('@/engine/decide/v3'),
  readStoredCheck: () => ({ check: { taxPercent: null, pay: { mode: 'once' } }, reasons: [] }),
}));
jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    setAccessibilityFocus: jest.fn(),
    announceForAccessibility: jest.fn(),
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

let listeners: (() => boolean)[] = [];
/** React Native: newest listener first, stop at the first that returns true. */
function pressBack(): boolean {
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i]?.()) return true;
  return false;
}

function Harness(): React.JSX.Element {
  return (
    <BackHistoryProvider>
      <AndroidBackHandler />
      <AnswerScreen id="c1" />
    </BackHistoryProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    const fn = handler as () => boolean;
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('answer screen hardware Back (gap 27)', () => {
  it('one Back goes to Decide home, not back to the tab underneath', async () => {
    await wrap(<Harness />);
    await act(async () => {
      pressBack();
    });
    // 05.3-114 (gap 33): a (tabs) is beneath, so Back dismisses to it; navigate would push a second (tabs).
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/decide');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows no visible Modal while no sheet is open (nothing to swallow the first Back)', async () => {
    await wrap(<Harness />);
    // Sheet renders its RN Modal (and this gesture root) only while visible.
    expect(screen.queryByTestId('sheet-gesture-root', { hidden: true })).toBeNull();
  });

  it('an open record sheet keeps Back for itself; after it closes one Back goes to Decide', async () => {
    await wrap(<Harness />);
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    expect(screen.getByText('sheet:bought:true')).toBeTruthy();
    await act(async () => {
      pressBack();
    });
    expect(mockDismissTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('sheet:bought:true'));
    await act(async () => {
      pressBack();
    });
    expect(mockDismissTo).toHaveBeenCalledWith('/decide');
  });

  it('two quick Backs navigate once', async () => {
    await wrap(<Harness />);
    await act(async () => {
      pressBack();
      pressBack();
    });
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });
});
