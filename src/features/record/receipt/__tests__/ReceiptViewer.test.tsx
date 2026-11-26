// 10.1-21 (RCP-03; UI-SPEC section 3a): the receipt viewer.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ReceiptGroup } from '../receiptGroups';
import { ReceiptViewer } from '../ReceiptViewer';

jest.setTimeout(60000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockSign = jest.fn(async (_p: string): Promise<string | null> => 'https://signed.example/x');
const mockOpenPdf = jest.fn(async (_p: string): Promise<'opened' | 'failed'> => 'opened');
jest.mock('@/services/receipts/openReceipt', () => ({
  signedUrlFor: (p: string) => mockSign(p),
  openPdf: (p: string) => mockOpenPdf(p),
}));

const photo = (id: string, state: ReceiptGroup['state'] = 'stored'): ReceiptGroup => ({
  groupId: id,
  kind: 'photo',
  pages: [{ objectPath: state === 'stored' ? `h1/tx1/${id}.jpg` : null, localUri: state === 'stored' ? null : `file:///${id}.jpg`, mime: 'image/jpeg' }],
  state,
  createdAt: '2026-11-20T10:00:00Z',
});
const pdf: ReceiptGroup = {
  groupId: 'gp',
  kind: 'file',
  pages: [{ objectPath: 'h1/tx1/gp.pdf', localUri: null, mime: 'application/pdf' }],
  state: 'stored',
  createdAt: '2026-11-20T11:00:00Z',
};

async function renderViewer(groups: ReceiptGroup[], startGroupId?: string) {
  const onClose = jest.fn();
  const onRemove = jest.fn();
  const screen = await render(
    <ThemeProvider>
      <ReceiptViewer visible groups={groups} startGroupId={startGroupId} onClose={onClose} onRemove={onRemove} />
    </ThemeProvider>
  );
  return { screen, onClose, onRemove };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSign.mockResolvedValue('https://signed.example/x');
  mockOpenPdf.mockResolvedValue('opened');
});

describe('ReceiptViewer', () => {
  it('shows the counter, signs the picture on open and moves with Previous / Next', async () => {
    const { screen } = await renderViewer([photo('g1'), photo('g2'), pdf], 'g2');
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await screen.findByTestId('receipt-viewer-image');
    expect(mockSign).toHaveBeenCalledWith('h1/tx1/g2.jpg');
    await fireEvent.press(screen.getByLabelText('Next'));
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Next').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText('Previous'));
    await fireEvent.press(screen.getByLabelText('Previous'));
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  it('opens a PDF in the system viewer', async () => {
    const { screen } = await renderViewer([pdf]);
    await fireEvent.press(screen.getByLabelText(/PDF/));
    expect(mockOpenPdf).toHaveBeenCalledWith('h1/tx1/gp.pdf');
  });

  it('a link that cannot be made shows "This file did not open." and Try again signs again', async () => {
    mockSign.mockResolvedValueOnce(null);
    const { screen } = await renderViewer([photo('g1')]);
    expect(await screen.findByText('This file did not open.')).toBeTruthy();
    expect(screen.getByText('Your records are safe.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    await screen.findByTestId('receipt-viewer-image');
    expect(mockSign).toHaveBeenCalledTimes(2);
  });

  it('a local file needs no link', async () => {
    const { screen } = await renderViewer([photo('g1', 'waiting')]);
    await screen.findByTestId('receipt-viewer-image');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('Remove asks first, then removes the receipt and closes when it was the last', async () => {
    const { screen, onRemove, onClose } = await renderViewer([photo('g1')]);
    await fireEvent.press(screen.getByLabelText('Remove'));
    expect(screen.getByText('Remove this receipt? It is deleted for good.')).toBeTruthy();
    expect(onRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(onRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Remove'));
    const confirm = screen.getAllByText('Remove');
    await fireEvent.press(confirm[confirm.length - 1]!);
    expect(onRemove).toHaveBeenCalledWith('g1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close calls onClose', async () => {
    const { screen, onClose } = await renderViewer([photo('g1')]);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
