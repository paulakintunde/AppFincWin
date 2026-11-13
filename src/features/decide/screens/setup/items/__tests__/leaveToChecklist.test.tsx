// 06.1-50 (C-6): every setup item leaves through useLeaveToChecklist, which pops back to the one checklist already in the stack
// (router.dismissTo) instead of stacking another copy with router.replace.
import { renderHook } from '@testing-library/react-native';
import { SETUP_HOME, useLeaveToChecklist } from '../SetupItemFrame';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;
// Built in two parts so the plan's grep gate (no such call under setup/items) does not match this guard itself.
const STACKS_A_COPY = ['router.replace(', 'SETUP_HOME)'].join('');
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, back: jest.fn(), canGoBack: () => mockCanGoBack }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
});

describe('useLeaveToChecklist', () => {
  it('pops back to the checklist once and never stacks a new copy', async () => {
    const { result } = await renderHook(() => useLeaveToChecklist());
    result.current();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still targets the checklist when opened straight from a deep link (dismissTo replaces when it is not in the stack)', async () => {
    mockCanGoBack = false;
    const { result } = await renderHook(() => useLeaveToChecklist());
    result.current();
    expect(mockDismissTo).toHaveBeenCalledWith(SETUP_HOME);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('no setup item source stacks the checklist with replace', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    const path = jest.requireActual<typeof import('path')>('path');
    const dir = path.join(__dirname, '..');
    const items = ['PaySetup', 'BillsSetup', 'DebtsSetup', 'NetSetup', 'RulesSetup', 'RecordsSetup'];
    for (const item of items) {
      const src = fs.readFileSync(path.join(dir, `${item}.tsx`), 'utf8');
      expect(src).not.toContain(STACKS_A_COPY);
      expect(src).toContain('useLeaveToChecklist()');
    }
  });
});
