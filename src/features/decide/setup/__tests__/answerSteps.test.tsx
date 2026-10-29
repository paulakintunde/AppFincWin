import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { ShareStep } from '../steps/ShareStep';
import { DetailStep } from '../steps/DetailStep';
import { RemindersStep } from '../steps/RemindersStep';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSave = jest.fn((_i: { patch: Record<string, unknown> }) => ({ stepId: 'step-1' }) as { stepId: string } | null);
jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: (i: { patch: Record<string, unknown> }) => mockSave(i) }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));
let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings }) }));
const mockPermission = jest.fn<Promise<boolean>, []>();
jest.mock('@/features/decide/notifications/waitReminder', () => ({ requestReminderPermission: () => mockPermission() }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };
async function mount(Step: typeof ShareStep) {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <Step ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}
const save = async (ref: React.RefObject<SetupStepHandle | null>) => {
  let out: { stepId: string | null } = { stepId: null };
  await act(async () => {
    out = ref.current!.save();
  });
  return out;
};

beforeEach(() => {
  mockSettings = null;
  mockSave.mockClear();
  mockPermission.mockReset();
});

describe('ShareStep', () => {
  it('starts with nothing chosen and writes nothing', async () => {
    const { ref, last } = await mount(ShareStep);
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    expect((await save(ref)).stepId).toBeNull();
    expect(screen.queryByText('Your share of shared bills')).toBeNull();
  });

  it('Just me stores 100', async () => {
    const { ref, last } = await mount(ShareStep);
    await fireEvent.press(screen.getByLabelText('Just me. All costs are mine'));
    expect(last().dirty).toBe(true);
    expect((await save(ref)).stepId).toBe('step-1');
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ share_pct: 100 });
  });

  it('sharing without a percentage writes nothing; a chip stores it', async () => {
    const { ref, last } = await mount(ShareStep);
    await fireEvent.press(screen.getByLabelText('I share some costs. With a partner or housemate'));
    expect(screen.getByText('Your share of shared bills')).toBeTruthy();
    expect(last().dirty).toBe(false);
    expect((await save(ref)).stepId).toBeNull();
    await fireEvent.press(screen.getByText('60%'));
    expect(last().dirty).toBe(true);
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ share_pct: 60 });
  });

  it('a custom percentage in 1 to 99 is stored and 100 is refused', async () => {
    const { ref } = await mount(ShareStep);
    await fireEvent.press(screen.getByLabelText('I share some costs. With a partner or housemate'));
    await fireEvent.press(screen.getByLabelText('Custom'));
    const field = screen.getByLabelText('Your share of shared bills, percent, custom, % of shared bills');
    await fireEvent.changeText(field, '100');
    expect((await save(ref)).stepId).toBeNull();
    await fireEvent.changeText(field, '45');
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ share_pct: 45 });
  });

  it('shows a stored share and writes nothing until it changes', async () => {
    mockSettings = { share_pct: 50 };
    const { ref, last } = await mount(ShareStep);
    expect(screen.getByLabelText('I share some costs. With a partner or housemate').props.accessibilityState).toMatchObject({ checked: true });
    expect(last().dirty).toBe(false);
    expect((await save(ref)).stepId).toBeNull();
  });
});

describe('DetailStep', () => {
  it('stores short or full and shows the footer line', async () => {
    const { ref, last } = await mount(DetailStep);
    expect(screen.getByText('This only changes what opens first. The answer is worked out the same way.')).toBeTruthy();
    expect((await save(ref)).stepId).toBeNull();
    await fireEvent.press(screen.getByLabelText('Full answers. Open ‘What could I do instead?’ for bigger purchases.'));
    expect(last().dirty).toBe(true);
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ detail: 'full' });
  });

  it('a stored answer that is unchanged writes nothing', async () => {
    mockSettings = { detail: 'short' };
    const { ref } = await mount(DetailStep);
    expect((await save(ref)).stepId).toBeNull();
    await fireEvent.press(screen.getByLabelText('Short answers. The answer first; more only when I tap.'));
    expect((await save(ref)).stepId).toBeNull();
  });
});

describe('RemindersStep', () => {
  const planSwitch = () => screen.getByLabelText('Remind me when a saved plan becomes covered');
  const unspentSwitch = () => screen.getByLabelText('Remind me to check my unspent money each month');

  it('both switches start Off and nothing is written', async () => {
    const { ref, last } = await mount(RemindersStep);
    expect(planSwitch().props.accessibilityState).toMatchObject({ checked: false });
    expect(unspentSwitch().props.accessibilityState).toMatchObject({ checked: false });
    expect(last().dirty).toBe(false);
    expect((await save(ref)).stepId).toBeNull();
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it('granted permission keeps the switch On and stores it', async () => {
    mockPermission.mockResolvedValue(true);
    const { ref, last } = await mount(RemindersStep);
    await fireEvent.press(planSwitch());
    expect(mockPermission).toHaveBeenCalledTimes(1);
    expect(planSwitch().props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.queryByText('Notifications are off for FincWin in your phone settings.')).toBeNull();
    expect(last().dirty).toBe(true);
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ remind_plan: true });
  });

  it('refused permission returns the switch to Off with the notifications-off line and writes nothing', async () => {
    mockPermission.mockResolvedValue(false);
    const { ref, last } = await mount(RemindersStep);
    await fireEvent.press(planSwitch());
    expect(planSwitch().props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('Notifications are off for FincWin in your phone settings.')).toBeTruthy();
    expect(last().dirty).toBe(false);
    expect((await save(ref)).stepId).toBeNull();
  });

  it('turning a stored On switch Off stores false, without asking for permission', async () => {
    mockSettings = { remind_plan: true, remind_unspent: false };
    const { ref } = await mount(RemindersStep);
    expect(planSwitch().props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(planSwitch());
    expect(mockPermission).not.toHaveBeenCalled();
    await save(ref);
    expect(mockSave.mock.calls[0]![0].patch).toEqual({ remind_plan: false });
  });

  it('carries no amount in its copy', async () => {
    await mount(RemindersStep);
    expect(planSwitch().props.accessibilityLabel).not.toMatch(/\d/);
    expect(unspentSwitch().props.accessibilityLabel).not.toMatch(/\d/);
  });
});
