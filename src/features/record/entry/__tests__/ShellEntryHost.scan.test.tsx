// 10.1-25 (SCN-01, D-13): "Scan a receipt" from Add. Registered at level 2 only; capture, then the scan sheet in 'new' mode
// with the picked files as they are; any way out deletes the picked files.
import React, { useEffect } from 'react';
import { act } from '@testing-library/react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { FabProvider, useFab, type FabContextValue } from '@/shell/fab/FabProvider';
import type { LocalReceiptFile } from '@/services/receipts/types';
import { resetEntryHostForTests } from '../entryHost';
import { ShellEntryHost } from '../ShellEntryHost';

jest.setTimeout(30000);

let mockReceiptsVisible = true;
jest.mock('@/features/levels/useFeatureAccess', () => ({
  useFeatureAccess: (id: string) => ({ visible: id === 'receipts' && mockReceiptsVisible, on: id === 'receipts' && mockReceiptsVisible }),
}));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ status: 'active', writable: true, loading: false }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn' }) }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), useSegments: () => [], router: { push: jest.fn() } }));
jest.mock('../SeriesStatusSheet', () => ({ SeriesStatusHost: () => null }));
jest.mock('../TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ householdId: 'h1' }) }));

const mockDiscard = jest.fn();
jest.mock('@/features/record/receipt/scanFiles', () => ({ discardFiles: (uris: string[]) => mockDiscard(uris) }));

type ChooserProps = { visible: boolean; onClose(): void; onPicked(images: LocalReceiptFile[], kind: string): void };
type ScanProps = {
  visible: boolean;
  mode: string;
  householdId: string;
  images: LocalReceiptFile[];
  onClose(): void;
  onDone(id: string): void;
  onRetake?(): void;
};
const mockChooser = jest.fn();
const mockScan = jest.fn();
jest.mock('@/features/record/receipt/CaptureChooser', () => ({
  CaptureChooser: (p: unknown) => {
    mockChooser(p);
    return null;
  },
}));
jest.mock('@/features/record/receipt/ScanSheet', () => ({
  ScanSheet: (p: unknown) => {
    mockScan(p);
    return null;
  },
}));
const chooser = (): ChooserProps | undefined => mockChooser.mock.calls.at(-1)?.[0] as ChooserProps | undefined;
const scan = (): ScanProps | undefined => mockScan.mock.calls.at(-1)?.[0] as ScanProps | undefined;

const holder: { current: FabContextValue | null } = { current: null };
function Probe(): null {
  const value = useFab();
  useEffect(() => {
    holder.current = value;
  });
  return null;
}
const cur = (): FabContextValue => holder.current as FabContextValue;

const page = (n: number): LocalReceiptFile => ({ uri: `file:///cache/p${n}.jpg`, mime: 'image/jpeg', ext: 'jpg', bytes: 2000 + n, width: 800, height: 1200 });

async function mount() {
  return renderWithShellProviders(
    <FabProvider>
      <Probe />
      <ShellEntryHost />
    </FabProvider>,
  );
}
async function startScan() {
  await act(async () => cur().quickActions.find((a) => a.id === 'scanReceipt')!.run());
}
async function nextFrame() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  resetEntryHostForTests();
  holder.current = null;
  mockReceiptsVisible = true;
});

describe('ShellEntryHost: Scan a receipt (10.1-25)', () => {
  it('at level 2 lists Scan a receipt right after Add expense', async () => {
    await mount();
    expect(cur().quickActions.map((a) => a.id)).toEqual(['addExpense', 'scanReceipt', 'addIncome', 'transfer', 'importStatement']);
    expect(cur().quickActions.find((a) => a.id === 'scanReceipt')!.label).toBe('Scan a receipt');
  });

  it('below level 2 does not offer it', async () => {
    mockReceiptsVisible = false;
    await mount();
    expect(cur().quickActions.map((a) => a.id)).not.toContain('scanReceipt');
  });

  it('opens the capture choice and hides the FAB; nothing is read yet', async () => {
    await mount();
    expect(chooser()).toBeUndefined();
    await startScan();
    expect(chooser()?.visible).toBe(true);
    expect(scan()?.visible ?? false).toBe(false);
    expect(cur().hidden).toBe(true);
  });

  it('after a pick opens the scan sheet in new mode with the picked files as they are', async () => {
    await mount();
    await startScan();
    const files = [page(1), page(2), page(3)];
    await act(async () => chooser()!.onPicked(files, 'scan'));
    expect(chooser()?.visible).toBe(false);
    await nextFrame();
    expect(scan()?.visible).toBe(true);
    expect(scan()?.mode).toBe('new');
    expect(scan()?.householdId).toBe('h1');
    expect(scan()?.images).toBe(files);
    expect(scan()?.images[0]?.bytes).toBe(2001);
    expect(mockDiscard).not.toHaveBeenCalledWith(expect.arrayContaining([files[0]!.uri]));
  });

  it('closing the scan without confirming deletes the picked files and shows the FAB again', async () => {
    await mount();
    await startScan();
    await act(async () => chooser()!.onPicked([page(1)], 'photo'));
    await nextFrame();
    await act(async () => scan()!.onClose());
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/p1.jpg']);
    expect(cur().hidden).toBe(false);
  });

  it('after confirm the flow closes and the cache copies go (the outbox holds its own)', async () => {
    await mount();
    await startScan();
    await act(async () => chooser()!.onPicked([page(1)], 'photo'));
    await nextFrame();
    await act(async () => scan()!.onDone('tx-new'));
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/p1.jpg']);
    expect(cur().hidden).toBe(false);
  });

  it('Try another photo deletes the files and goes back to the capture choice', async () => {
    await mount();
    await startScan();
    await act(async () => chooser()!.onPicked([page(1)], 'photo'));
    await nextFrame();
    await act(async () => scan()!.onRetake!());
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/p1.jpg']);
    await nextFrame();
    expect(chooser()?.visible).toBe(true);
    expect(scan()?.visible).toBe(false);
  });

  it('cancelling the capture choice ends the flow with nothing to delete', async () => {
    await mount();
    await startScan();
    await act(async () => chooser()!.onClose());
    expect(cur().hidden).toBe(false);
    expect(mockDiscard.mock.calls.every((c) => (c[0] as string[]).length === 0)).toBe(true);
  });
});
