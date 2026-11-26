// 10.1-21 (D-06..D-09, D-21; UI-SPEC section 3): the Receipt sheet and its thumbnail strip.
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import type { ReceiptGroup } from '../receiptGroups';
import type { ReceiptActions } from '../useReceiptActions';
import { ReceiptSheet } from '../ReceiptSheet';

jest.setTimeout(60000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ showCents: true, householdId: 'h1', userId: 'u1', homeCurrency: 'USD', today: '2026-11-25' }) }));
jest.mock('@/services/receipts/openReceipt', () => ({ signedUrlFor: jest.fn(async () => 'https://signed.example/x'), openPdf: jest.fn(async () => 'opened') }));

const mockAdd = jest.fn(async (_s: string) => undefined);
const mockRemoveGroup = jest.fn(async (_id: string) => undefined);
const mockRemoveAll = jest.fn(async () => undefined);
const mockRetry = jest.fn(async (_id: string) => undefined);
let mockState: Pick<ReceiptActions, 'groups' | 'error' | 'busy' | 'loading'>;
jest.mock('../useReceiptActions', () => ({
  useReceiptActions: () => ({ ...mockState, add: mockAdd, removeGroup: mockRemoveGroup, removeAll: mockRemoveAll, retry: mockRetry }),
}));

function group(over: Partial<ReceiptGroup> & { groupId: string }): ReceiptGroup {
  return {
    kind: 'photo',
    pages: [{ objectPath: `h1/tx1/${over.groupId}.jpg`, localUri: null, mime: 'image/jpeg' }],
    state: 'stored',
    createdAt: '2026-11-20T10:00:00Z',
    ...over,
  };
}

const privateLine = { id: 'tx1', is_shared: false } as unknown as TransactionRow;
const sharedLine = { id: 'tx1', is_shared: true } as unknown as TransactionRow;

async function renderSheet(line: TransactionRow = privateLine, onRead?: (i: { uri: string; mime: string }[]) => void) {
  return render(
    <ThemeProvider>
      <ReceiptSheet visible line={line} householdId="h1" onClose={jest.fn()} onRead={onRead} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { groups: [], error: null, busy: false, loading: false };
});

describe('ReceiptSheet', () => {
  it('says who can see the receipts, how long they stay and the limits, on a private line', async () => {
    const screen = await renderSheet();
    expect(screen.getByText('Only you can see these receipts.')).toBeTruthy();
    expect(screen.getByText('Receipts stay with the line until you remove them or delete the line.')).toBeTruthy();
    expect(screen.getByText('Up to 5 files per line, 5 MB each.')).toBeTruthy();
    expect(screen.getByText('They are included when you export your data.')).toBeTruthy();
  });

  it('says it for everyone the line is shared with on a shared line', async () => {
    const screen = await renderSheet(sharedLine);
    expect(screen.getByText('Everyone this line is shared with can open these receipts. No one else can.')).toBeTruthy();
    expect(screen.queryByText('Only you can see these receipts.')).toBeNull();
  });

  it('with no files shows three actions, no strip and no Remove all', async () => {
    const screen = await renderSheet();
    for (const label of ['Take a photo', 'Choose from files', 'Scan a document']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByTestId('receipt-strip')).toBeNull();
    expect(screen.queryByText('Remove all')).toBeNull();
    await fireEvent.press(screen.getByText('Take a photo'));
    await fireEvent.press(screen.getByText('Choose from files'));
    await fireEvent.press(screen.getByText('Scan a document'));
    expect(mockAdd.mock.calls.map((c) => c[0])).toEqual(['camera', 'file', 'scan']);
  });

  it('with files shows the strip with spoken labels, a waiting badge word and Remove all', async () => {
    mockState.groups = [
      group({ groupId: 'g1' }),
      group({ groupId: 'g2', state: 'waiting', pages: [{ objectPath: null, localUri: 'file:///a.jpg', mime: 'image/jpeg' }] }),
      group({ groupId: 'g3', kind: 'file', pages: [{ objectPath: 'h1/tx1/g3.pdf', localUri: null, mime: 'application/pdf' }] }),
    ];
    const screen = await renderSheet();
    expect(screen.getByTestId('receipt-strip')).toBeTruthy();
    expect(screen.getByLabelText('Receipt 2 of 3, photo, waiting to upload')).toBeTruthy();
    expect(screen.getByLabelText('Receipt 3 of 3, PDF')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Remove all')).toBeTruthy();
    expect(screen.queryByText('They are included when you export your data.')).toBeNull();
  });

  it('a failed thumbnail opens a menu with Try again and Remove', async () => {
    mockState.groups = [group({ groupId: 'g1', state: 'failed', pages: [{ objectPath: null, localUri: 'file:///a.jpg', mime: 'image/jpeg' }] })];
    const screen = await renderSheet();
    expect(screen.getByText('Didn’t upload')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('receipt-thumb-g1'));
    expect(screen.getByTestId('receipt-failed-menu')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRetry).toHaveBeenCalledWith('g1');
  });

  it('a denied camera shows the info card with Open settings and Choose from files', async () => {
    mockState.error = 'cameraOff';
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const screen = await renderSheet();
    expect(screen.getByText('Camera access is off')).toBeTruthy();
    expect(screen.queryByText('Take a photo')).toBeNull();
    await fireEvent.press(screen.getByText('Open settings'));
    expect(open).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Choose from files'));
    expect(mockAdd).toHaveBeenCalledWith('file');
  });

  it('shows the inline line for a file that is too big', async () => {
    mockState.error = 'tooBig';
    const screen = await renderSheet();
    expect(screen.getByText('That file is too big. Up to 5 MB.')).toBeTruthy();
  });

  it('Remove all asks first and says the receipts are deleted for good', async () => {
    mockState.groups = [group({ groupId: 'g1' }), group({ groupId: 'g2' })];
    const screen = await renderSheet();
    await fireEvent.press(screen.getByText('Remove all'));
    expect(screen.getByText('Remove all 2 receipts from this line? They are deleted for good.')).toBeTruthy();
    expect(mockRemoveAll).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep them'));
    expect(mockRemoveAll).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Remove all'));
    // the sheet row and the confirm button both read "Remove all"; the confirm is the last one
    const buttons = screen.getAllByText('Remove all');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(mockRemoveAll).toHaveBeenCalledTimes(1);
  });

  it('shows "Read this receipt" only when a reader is given and a picture is attached', async () => {
    mockState.groups = [group({ groupId: 'g1' })];
    const onRead = jest.fn();
    const withReader = await renderSheet(privateLine, onRead);
    expect(withReader.getByText('Read this receipt')).toBeTruthy();
    await fireEvent.press(withReader.getByText('Read this receipt'));
    await withReader.findByText('Read this receipt');
    expect(onRead).toHaveBeenCalledWith([{ uri: 'https://signed.example/x', mime: 'image/jpeg' }]);
  });

  it('has no read row without a reader or without a picture', async () => {
    mockState.groups = [group({ groupId: 'g1' })];
    expect((await renderSheet()).queryByText('Read this receipt')).toBeNull();
    mockState.groups = [group({ groupId: 'g1', kind: 'file', pages: [{ objectPath: 'p.pdf', localUri: null, mime: 'application/pdf' }] })];
    expect((await renderSheet(privateLine, jest.fn())).queryByText('Read this receipt')).toBeNull();
  });
});
