import React from 'react';
import { BackHandler, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, resetToastForTests } from '@/state/undoToast';
import type { SetupFacts } from '../setupFlow';
import type { SetupStepBodyProps, SetupStepHandle, SetupStepReady } from '../steps/types';
import { SetupStepper } from '../SetupStepper';

jest.setTimeout(30000);

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

const mockTrack = jest.fn();
const mockSave = jest.fn();
let mockFacts: SetupFacts | null;

jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: (input: unknown) => mockSave(input) }),
}));
jest.mock('../useSetupFacts', () => ({ useSetupFacts: () => mockFacts }));
jest.mock('@/shell/header/SyncProblemLine', () => ({ SyncProblemLine: () => null }));
jest.mock('@/shell/header/BackButton', () => {
  const { Pressable } = jest.requireActual('react-native');
  return { BackButton: ({ onPress }: { onPress: () => void }) => <Pressable accessibilityLabel="Back" onPress={onPress} /> };
});

const baseFacts: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: false,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 0,
  moneyAccountIds: [],
  accountIdsWithUse: [],
  everydayOverride: null,
  unspentAnchorSet: false,
  roughTyped: false,
  setupDoneAt: null,
};

/** A controllable step body: tests set what it reports and what save() returns. */
const control = { ready: { canContinue: true, reasonKey: null, dirty: false } as SetupStepReady, stepId: 'step-1' as string | null, saves: 0 };

const TITLES: Record<string, string> = { paid: 'income.paid.title', pay: 'income.pay.title', season: 'income.season.title', other: 'income.other.title' };
const stepTitleKey = (s: string) => TITLES[s] ?? 'income.paid.title';

const FakeStep = React.forwardRef<SetupStepHandle, SetupStepBodyProps & { name: string }>(function FakeStep({ onReadyChange, name }, ref) {
  React.useEffect(() => {
    onReadyChange(control.ready);
  }, [onReadyChange]);
  React.useImperativeHandle(ref, () => ({
    save() {
      control.saves += 1;
      return { stepId: control.stepId };
    },
  }));
  return <><Text>{`body:${name}`}</Text></>;
});

const renderStep = (step: string, ref: React.Ref<SetupStepHandle>, props: SetupStepBodyProps) => <FakeStep ref={ref} name={step} {...props} />;

async function mount(over: Partial<React.ComponentProps<typeof SetupStepper>> = {}) {
  const onClose = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <SetupStepper mode="full" renderStep={renderStep as never} stepTitleKey={stepTitleKey as never} onClose={onClose} {...over} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { onClose };
}

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
};

beforeEach(() => {
  mockTrack.mockClear();
  mockSave.mockClear();
  mockFacts = baseFacts;
  control.ready = { canContinue: true, reasonKey: null, dirty: false };
  control.stepId = 'step-1';
  control.saves = 0;
  resetToastForTests();
});

describe('SetupStepper shell', () => {
  it('opens on Welcome with Start and Not now, fires decide_setup_started once', async () => {
    const { onClose } = await mount();
    expect(screen.getByText('Set up Decide')).toBeTruthy();
    expect(screen.getByLabelText('Start')).toBeTruthy();
    await press('Not now');
    expect(onClose).toHaveBeenCalledWith('notNow');
    expect(mockTrack.mock.calls.filter((c) => c[0] === 'decide_setup_started')).toHaveLength(1);
  });

  it('shows the section name without a counter, "Needed" on a needed step, and the rail is hidden from assistive tech', async () => {
    await mount({ startAt: 'paid' });
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.queryByText(/of 5/)).toBeNull();
    expect(screen.getByLabelText('Needed, this step can’t be skipped')).toBeTruthy();
    expect(screen.queryByLabelText('Skip')).toBeNull();
    expect(screen.getByTestId('setup-rail', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByLabelText('Section 1 of 5, Income')).toBeTruthy();
  });

  it('shows Skip on an optional step', async () => {
    await mount({ startAt: 'season' });
    expect(screen.getByLabelText('Skip')).toBeTruthy();
    expect(screen.queryByLabelText(/^Needed/)).toBeNull();
  });

  it('Next saves, shows "{title} saved" with an undo step id, and tracks the step key only', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    await mount({ startAt: 'paid' });
    await press('Next');
    expect(control.saves).toBe(1);
    const toast = getToast();
    expect(toast?.text?.key).toBe('decide.setup.shell.toastSaved');
    expect(toast?.stepId).toBe('step-1');
    expect(mockTrack).toHaveBeenCalledWith('decide_setup_step_saved', { step: 'paid' });
    expect(screen.getByText('body:pay')).toBeTruthy();
  });

  it('an unchanged step shows no toast and tracks no save', async () => {
    control.stepId = null;
    await mount({ startAt: 'paid' });
    await press('Next');
    expect(control.saves).toBe(1);
    expect(getToast()).toBeNull();
    expect(mockTrack.mock.calls.filter((c) => c[0] === 'decide_setup_step_saved')).toHaveLength(0);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a needed incomplete step disables Next, shows the reason and uses it as the hint', async () => {
    control.ready = { canContinue: false, reasonKey: 'decide.setup.shell.neededReason', dirty: false };
    await mount({ startAt: 'paid' });
    expect(screen.getByText('At least one is needed to continue.')).toBeTruthy();
    const next = screen.getByLabelText('Next');
    expect(next.props.accessibilityState.disabled).toBe(true);
    expect(next.props.accessibilityHint).toBe('At least one is needed to continue.');
    await press('Next');
    expect(control.saves).toBe(0);
  });

  it('Skip writes nothing when nothing was typed', async () => {
    await mount({ startAt: 'season' });
    await press('Skip');
    expect(control.saves).toBe(0);
    expect(getToast()).toBeNull();
    expect(screen.getByText('body:other')).toBeTruthy();
  });

  it('Skip saves an answer that was already typed and valid', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    await mount({ startAt: 'season' });
    await press('Skip');
    expect(control.saves).toBe(1);
  });

  it('Skip does not save an invalid typed answer', async () => {
    control.ready = { canContinue: false, reasonKey: null, dirty: true };
    await mount({ startAt: 'season' });
    await press('Skip');
    expect(control.saves).toBe(0);
  });

  it('Back goes to the previous visible step, never prompts, and writes nothing', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    const { onClose } = await mount({ startAt: 'pay' });
    mockFacts = { ...baseFacts };
    await press('Back');
    expect(screen.getByText('body:paid')).toBeTruthy();
    expect(control.saves).toBe(0);
    expect(getToast()).toBeNull();
    await press('Back');
    expect(screen.getByText('Set up Decide')).toBeTruthy();
    await press('Back');
    expect(onClose).toHaveBeenCalledWith('notNow');
  });

  it('Android back does what Back does', async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, h: () => boolean) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never);
    await mount({ startAt: 'pay' });
    await act(async () => {
      expect(handlers[handlers.length - 1]!()).toBe(true);
    });
    expect(screen.getByText('body:paid')).toBeTruthy();
    spy.mockRestore();
  });

  it('Finish later saves a valid step, closes, tracks the step and shows the later toast', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    const { onClose } = await mount({ startAt: 'paid' });
    await press('Finish later');
    expect(control.saves).toBe(1);
    expect(onClose).toHaveBeenCalledWith('later');
    expect(mockTrack).toHaveBeenCalledWith('decide_setup_left', { step: 'paid' });
    expect(getToast()?.text?.key).toBe('decide.setup.shell.toastSaved');
  });

  it('Finish later on an invalid step saves nothing and shows only "Setup saved"', async () => {
    control.ready = { canContinue: false, reasonKey: 'decide.setup.shell.neededReason', dirty: true };
    const { onClose } = await mount({ startAt: 'paid' });
    await press('Finish later');
    expect(control.saves).toBe(0);
    expect(onClose).toHaveBeenCalledWith('later');
    expect(getToast()?.text?.key).toBe('decide.setup.shell.toastLater');
    expect(getToast()?.stepId).toBeNull();
  });

  it('standalone: hides the rail, names "Your income", ends with Done and does not write setup_done_at', async () => {
    mockFacts = { ...baseFacts, incomeTypes: ['salary_or_wages'] };
    const { onClose } = await mount({ mode: 'standalone', startAt: 'other' });
    expect(screen.queryByTestId('setup-rail', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Your income')).toBeTruthy();
    await press('Done');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('decide_setup_finished', {});
    expect(onClose).toHaveBeenCalledWith('done', expect.any(Array));
  });

  it('full mode: the step before Summary reads "Finish setup"; Done on Summary writes setup_done_at and finishes', async () => {
    const { onClose } = await mount({ startAt: 'reminders' });
    expect(screen.getByLabelText('Finish setup')).toBeTruthy();
    await press('Finish setup');
    expect(screen.getByText('body:summary')).toBeTruthy();
    await press('Done');
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { setup_done_at: expect.any(String) } }));
    expect(mockTrack).toHaveBeenCalledWith('decide_setup_finished', {});
    expect(onClose).toHaveBeenCalledWith('done', expect.any(Array));
  });

  it('analytics carry step keys only', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    await mount({ startAt: 'paid' });
    await press('Next');
    expect(JSON.stringify(mockTrack.mock.calls)).not.toMatch(/\d{3,}|salary/);
  });

  it('keeps the footer and the body separate at font scale 2.0 (footer is outside the scroll view)', async () => {
    await mount({ startAt: 'paid' });
    const footerNext = screen.getByLabelText('Next');
    let node = footerNext.parent;
    let insideScroll = false;
    while (node) {
      if (node.type && String(node.type).includes('ScrollView')) insideScroll = true;
      node = node.parent;
    }
    expect(insideScroll).toBe(false);
  });
});

describe('SetupStepper edit-one-step mode (05.2-34)', () => {
  it('shows the step name in the header, no rail, no Skip, and "Save answer" / "Keep as is"', async () => {
    await mount({ only: 'season' });
    expect(screen.getByText('Does your income change by season?')).toBeTruthy();
    expect(screen.queryByTestId('setup-rail')).toBeNull();
    expect(screen.queryByLabelText('Skip')).toBeNull();
    expect(screen.queryByLabelText('Next')).toBeNull();
    expect(screen.getByLabelText('Save answer')).toBeTruthy();
    expect(screen.getByLabelText('Keep as is')).toBeTruthy();
  });

  it('keeps Save answer disabled until the step changes and is valid', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: false };
    await mount({ only: 'season' });
    expect(screen.getByLabelText('Save answer').props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps Save answer disabled when a needed step is cleared (canContinue false)', async () => {
    control.ready = { canContinue: false, reasonKey: 'decide.setup.shell.neededReason', dirty: true };
    await mount({ only: 'paid' });
    expect(screen.getByLabelText('Save answer').props.accessibilityState?.disabled).toBe(true);
  });

  it('Save answer saves the one step, shows "{title} saved" with Undo, and closes', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    const { onClose } = await mount({ only: 'season' });
    await press('Save answer');
    expect(control.saves).toBe(1);
    expect(getToast()?.text?.key).toBe('decide.setup.shell.toastSaved');
    expect(getToast()?.stepId).toBe('step-1');
    expect(onClose).toHaveBeenCalledWith('done', expect.any(Array));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('Keep as is leaves without saving', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    const { onClose } = await mount({ only: 'season' });
    await press('Keep as is');
    expect(control.saves).toBe(0);
    expect(getToast()).toBeNull();
    expect(onClose).toHaveBeenCalledWith('notNow');
  });

  it('Back with edits asks "Discard changes?"; Discard leaves, Keep editing stays', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: true };
    const { onClose } = await mount({ only: 'season' });
    await press('Back');
    expect(screen.getByText('Discard changes?')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await press('Keep editing');
    expect(onClose).not.toHaveBeenCalled();
    await press('Back');
    await press('Discard');
    expect(onClose).toHaveBeenCalledWith('notNow');
    expect(control.saves).toBe(0);
  });

  it('Back without edits leaves at once', async () => {
    control.ready = { canContinue: true, reasonKey: null, dirty: false };
    const { onClose } = await mount({ only: 'season' });
    await press('Back');
    expect(onClose).toHaveBeenCalledWith('notNow');
  });
});
