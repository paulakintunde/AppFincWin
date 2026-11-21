// 08.1-23 (CMP-F19, UX-21, owner 2026-11-21 Q8-Q10): the joint account purpose sheet. The RPC hook is mocked; the sheet, the choice
// list, the switches and the tips are real.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { JointPurposeSheet, type JointPurposeSheetProps } from '../JointPurposeSheet';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticWarn: jest.fn() }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
let mockOnline = true;
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: mockOnline }) }));
type Res = { ok: true; version: number } | { ok: false; reason: string };
const mockSet = jest.fn(async (..._a: unknown[]): Promise<Res> => ({ ok: true, version: 5 }));
jest.mock('@/data/queries/jointAccounts', () => ({ useSetJointAccountPurpose: () => ({ mutateAsync: (...a: unknown[]) => mockSet(...a) }) }));

const onClose = jest.fn();
async function setup(over: Partial<JointPurposeSheetProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <JointPurposeSheet visible householdId="h" account={{ id: 'j1', name: 'Our savings' }} onClose={onClose} {...over} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
const save = () => screen.getByLabelText('Save');
const checked = (id: string): boolean => Boolean(screen.getByTestId(id).props.accessibilityState?.checked);

beforeEach(() => {
  mockOnline = true;
  mockSet.mockClear();
  mockSet.mockImplementation(async () => ({ ok: true, version: 5 }));
  mockToast.mockClear();
  onClose.mockClear();
});

describe('JointPurposeSheet', () => {
  it('asks what the account is for with nothing picked, and Save off until a pick', async () => {
    await setup();
    expect(screen.getByText('What is Our savings for?')).toBeTruthy();
    expect(checked('joint-purpose-bills')).toBe(false);
    expect(checked('joint-purpose-savings')).toBe(false);
    expect(checked('joint-purpose-everyday')).toBe(false);
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('joint-savings-switches')).toBeNull();
  });

  it('saves a pick with Undo back to not set', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('joint-purpose-bills'));
    await fireEvent.press(save());
    expect(mockSet).toHaveBeenCalledWith({ accountId: 'j1', purpose: 'bills', spendable: false, safetyNet: false, expectedVersion: null });
    expect(onClose).toHaveBeenCalled();
    const undo = (mockToast.mock.calls[0]![0] as { onUndo: () => void }).onUndo;
    undo();
    expect(mockSet).toHaveBeenLastCalledWith({ accountId: 'j1', purpose: null, spendable: false, safetyNet: false, expectedVersion: 5 });
  });

  it('joint savings shows Can be spent and This is our safety net; the safety net turns Can be spent off (Q10)', async () => {
    await setup({ current: { joint_purpose: 'savings', joint_savings_spendable: true, joint_safety_net: false, version: 3 } });
    expect(screen.getByTestId('joint-savings-switches')).toBeTruthy();
    expect(screen.getByLabelText('Can be spent').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('This is our safety net'));
    expect(screen.getByLabelText('Can be spent').props.accessibilityState.checked).toBe(false);
    await fireEvent.press(save());
    expect(mockSet).toHaveBeenCalledWith({ accountId: 'j1', purpose: 'savings', spendable: false, safetyNet: true, expectedVersion: 3 });
  });

  it('marks savings as money that can be spent', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('joint-purpose-savings'));
    expect(screen.getByLabelText('Can be spent').props.accessibilityState.checked).toBe(false);
    await fireEvent.press(screen.getByLabelText('Can be spent'));
    await fireEvent.press(save());
    expect(mockSet).toHaveBeenCalledWith({ accountId: 'j1', purpose: 'savings', spendable: true, safetyNet: false, expectedVersion: null });
  });

  it.each([
    ['not_joint', 'This account is no longer a joint account.'],
    ['not_member', 'This account is not in your household any more.'],
    ['version_conflict', 'Someone changed this a moment ago. The latest is shown.'],
    ['invalid_purpose', 'This wasn’t saved. Try again.'],
  ])('shows a plain line for %s and does not retry', async (reason, line) => {
    mockSet.mockImplementation(async () => ({ ok: false, reason }));
    await setup();
    await fireEvent.press(screen.getByTestId('joint-purpose-everyday'));
    await fireEvent.press(save());
    expect(screen.getByTestId('joint-purpose-failure').props.children).toBe(line);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is off with the connection helper while offline', async () => {
    mockOnline = false;
    await setup();
    await fireEvent.press(screen.getByTestId('joint-purpose-everyday'));
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Needs a connection. Try again when you’re back online.')).toBeTruthy();
  });

  it('every purpose and switch has a tip a screen reader reaches', async () => {
    await setup({ current: { joint_purpose: 'savings', joint_savings_spendable: false, joint_safety_net: false, version: 1 } });
    for (const name of ['Joint household bills', 'Joint savings', 'Joint everyday spending', 'Can be spent', 'This is our safety net']) {
      expect(screen.getByLabelText(`What ${name} means`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByLabelText('What This is our safety net means'));
    expect(screen.getByTestId('joint-safety-net-tip-text').props.children).toBe(
      'When on, this money is the group’s safety net. It is counted once for everyone, and checks never spend it.',
    );
  });
});
