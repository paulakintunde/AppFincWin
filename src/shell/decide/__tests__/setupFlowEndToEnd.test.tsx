/**
 * Plan 05.2-32: the assembled setup flow (SetupScreen + stepper shell) with fake step bodies (the bodies have their own
 * suites) and mocked data. A salaried user with one account and six months of records:
 *  - walking Next through the needed steps and Skip through the optional ones visits exactly paid, pay, regular, everyday,
 *    accountUse, unspent among the needed screens (D-03: six) and reaches the Summary;
 *  - Finish later mid-way leaves with "Setup saved. Pick it up any time.";
 *  - standalone runs only the income steps and ends with "Income setup saved".
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, resetToastForTests } from '@/state/undoToast';
import type { SetupFacts } from '@/features/decide/setup/setupFlow';
import type { SetupStepBodyProps } from '@/features/decide/setup/steps/types';
import { SetupScreen } from '../SetupScreen';

jest.setTimeout(30000);

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockStepId: string | null = null;

jest.mock('expo-router', () => ({
  router: { canGoBack: () => mockCanGoBack, back: () => mockBack(), replace: (h: unknown) => mockReplace(h) },
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: jest.fn() }) }));
jest.mock('@/features/decide/setup/useSetupFacts', () => ({ useSetupFacts: () => mockFacts }));
jest.mock('@/shell/header/SyncProblemLine', () => ({ SyncProblemLine: () => null }));
jest.mock('@/shell/header/BackButton', () => {
  const { Pressable } = jest.requireActual('react-native');
  return { BackButton: ({ onPress }: { onPress: () => void }) => <Pressable accessibilityLabel="Back" onPress={onPress} /> };
});
jest.mock('../setupRegistry', () => {
  const R = jest.requireActual('react');
  const { Text: T } = jest.requireActual('react-native');
  const Fake = R.forwardRef(function Fake({ name, onReadyChange }: { name: string; onReadyChange: (r: unknown) => void }, ref: React.Ref<unknown>) {
    R.useEffect(() => {
      onReadyChange({ canContinue: true, reasonKey: null, dirty: false });
    }, [onReadyChange]);
    R.useImperativeHandle(ref, () => ({ save: () => ({ stepId: mockStepId }) }));
    return <T>{`body:${name}`}</T>;
  });
  return {
    renderSetupStep: (step: string, ref: React.Ref<unknown>, props: SetupStepBodyProps) => <Fake ref={ref} name={step} {...props} />,
    stepTitleKey: () => 'income.paid.title',
  };
});

let mockFacts: SetupFacts;
const facts: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: false,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 6,
  moneyAccountIds: ['a1'],
  accountIdsWithUse: [],
  everydayOverride: null,
  unspentAnchorSet: false,
  roughTyped: false,
  setupDoneAt: null,
};

const mount = async (props: React.ComponentProps<typeof SetupScreen>) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <SetupScreen {...props} />
      </ThemeProvider>
    </SafeAreaProvider>
  );

const current = (): string => {
  const hit = screen.queryAllByText(/^body:/)[0];
  return hit === undefined ? '' : String(hit.props.children).replace('body:', '');
};

beforeEach(() => {
  mockFacts = facts;
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack = true;
  mockStepId = null;
  resetToastForTests();
});

describe('setup flow, full mode', () => {
  it('visits exactly six needed screens on the minimum path and reaches the Summary', async () => {
    await mount({ mode: 'full' });
    await fireEvent.press(screen.getByLabelText('Start'));
    const needed: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 25 && current() !== 'summary'; i += 1) {
      seen.push(current());
      if (screen.queryByLabelText(/^Needed/) !== null) {
        needed.push(current());
        await fireEvent.press(screen.getByLabelText(/^(Next|Finish setup)$/));
      } else {
        await fireEvent.press(screen.getByLabelText('Skip'));
      }
    }
    expect(needed).toEqual(['paid', 'pay', 'regular', 'everyday', 'accountUse', 'unspent']);
    expect(needed).toHaveLength(6);
    // every visible step was reached on the way (the optional ones were skipped, not missed)
    expect(seen).toEqual(['paid', 'pay', 'season', 'other', 'regular', 'loans', 'saving', 'everyday', 'unusual', 'accountUse', 'emergency', 'envelopes', 'unspent', 'share', 'detail', 'reminders']);
    expect(current()).toBe('summary');
    expect(screen.getByLabelText('Done')).toBeTruthy();
    expect(screen.getByLabelText('Change an answer')).toBeTruthy();
  });

  it('Finish later mid-way leaves with the "Pick it up any time" toast', async () => {
    await mount({ mode: 'full', startAt: 'regular' });
    await fireEvent.press(screen.getByLabelText('Finish later'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(getToast()?.text?.key).toBe('decide.setup.shell.toastLater');
  });

  it('Done on the Summary goes back', async () => {
    await mount({ mode: 'full', startAt: 'summary' });
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('Change an answer opens Decide settings', async () => {
    await mount({ mode: 'full', startAt: 'summary' });
    await fireEvent.press(screen.getByLabelText('Change an answer'));
    expect(mockReplace).toHaveBeenCalledWith('/decide/settings');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('edit-one-step shows a single step and Done closes', async () => {
    await mount({ mode: 'full', only: 'accountUse' });
    expect(current()).toBe('accountUse');
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('with nothing to go back to (a deep link) it replaces to the fallback instead', async () => {
    mockCanGoBack = false;
    await mount({ mode: 'full', startAt: 'summary', fallbackHref: '/decide' as never });
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(mockReplace).toHaveBeenCalledWith('/decide');
  });
});

describe('setup flow, standalone mode', () => {
  it('runs only the income steps and ends with Done and "Income setup saved", carrying the last undo step', async () => {
    mockStepId = 'step-last';
    await mount({ mode: 'standalone' });
    const seen: string[] = [];
    for (let i = 0; i < 10 && screen.queryByLabelText('Done') === null; i += 1) {
      seen.push(current());
      await fireEvent.press(screen.getByLabelText('Next'));
    }
    seen.push(current());
    expect(seen).toEqual(['paid', 'pay', 'season', 'other']);
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    const toast = getToast();
    expect(toast?.text?.key).toBe('decide.setup.shell.toastIncome');
    expect(toast?.stepId).toBe('step-last');
  });

  it('shows no Undo step when the last step saved nothing', async () => {
    await mount({ mode: 'standalone', startAt: 'other' });
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(getToast()?.text?.key).toBe('decide.setup.shell.toastIncome');
    expect(getToast()?.stepId).toBeNull();
  });
});

