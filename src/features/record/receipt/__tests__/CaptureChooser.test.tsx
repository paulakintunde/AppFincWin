// 10.1-25 (SCN-01, D-13; UI-SPEC section 4): the capture choice behind Add's "Scan a receipt".
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { LocalReceiptFile, PickResult } from '@/services/receipts/types';
import { CaptureChooser } from '../CaptureChooser';

jest.setTimeout(60000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPickPhoto = jest.fn<Promise<PickResult>, [string]>();
const mockScan = jest.fn<Promise<PickResult>, []>();
const mockPickFile = jest.fn<Promise<PickResult>, [unknown]>();
const mockFileDeps = jest.fn((types?: readonly string[]) => ({ types }));
const mockRemove = jest.fn(async (_uri: string) => undefined);
jest.mock('@/services/receipts/pickPhoto', () => ({ pickPhoto: (s: string) => mockPickPhoto(s) }));
jest.mock('@/services/receipts/scanDocument', () => ({ scanDocument: () => mockScan() }));
jest.mock('@/services/receipts/pickFile', () => ({
  pickFile: (d: unknown) => mockPickFile(d),
  defaultPickFileDeps: (types?: readonly string[]) => mockFileDeps(types),
}));
jest.mock('@/services/receipts/outbox', () => ({ defaultOutboxDeps: () => ({ remove: (u: string) => mockRemove(u) }) }));

const page = (n: number, mime: LocalReceiptFile['mime'] = 'image/jpeg'): LocalReceiptFile => ({
  uri: `file:///cache/p${n}.jpg`,
  mime,
  ext: mime === 'application/pdf' ? 'pdf' : 'jpg',
  bytes: 1000 + n,
  width: 800,
  height: 1200,
});

async function renderChooser(onPicked = jest.fn(), onClose = jest.fn()) {
  const screen = await render(
    <ThemeProvider>
      <CaptureChooser visible onClose={onClose} onPicked={onPicked} />
    </ThemeProvider>,
  );
  return { screen, onPicked, onClose };
}

beforeEach(() => jest.clearAllMocks());

describe('CaptureChooser', () => {
  it('renders nothing while closed', async () => {
    const screen = await render(
      <ThemeProvider>
        <CaptureChooser visible={false} onClose={jest.fn()} onPicked={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Take a photo')).toBeNull();
  });

  it('offers a photo, a file and a scan under the Scan a receipt title', async () => {
    const { screen } = await renderChooser();
    expect(screen.getAllByText('Scan a receipt').length).toBeGreaterThan(0);
    for (const label of ['Take a photo', 'Choose from files', 'Scan a document']) expect(screen.getByText(label)).toBeTruthy();
  });

  it('a photo goes back as one image of kind photo, with its size kept', async () => {
    const file = page(1);
    mockPickPhoto.mockResolvedValue({ ok: true, kind: 'photo', files: [file] });
    const { screen, onPicked } = await renderChooser();
    await fireEvent.press(screen.getByText('Take a photo'));
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(mockPickPhoto).toHaveBeenCalledWith('camera');
    expect(onPicked).toHaveBeenCalledWith([file], 'photo');
    expect(onPicked.mock.calls[0][0][0].bytes).toBe(1001);
  });

  it('a three-page scan goes back as three images of kind scan, in page order', async () => {
    const files = [page(1), page(2), page(3)];
    mockScan.mockResolvedValue({ ok: true, kind: 'scan', files });
    const { screen, onPicked } = await renderChooser();
    await fireEvent.press(screen.getByText('Scan a document'));
    await waitFor(() => expect(onPicked).toHaveBeenCalledWith(files, 'scan'));
  });

  it('the file row opens the picker for images only', async () => {
    mockPickFile.mockResolvedValue({ ok: true, kind: 'file', files: [page(4)] });
    const { screen, onPicked } = await renderChooser();
    await fireEvent.press(screen.getByText('Choose from files'));
    await waitFor(() => expect(onPicked).toHaveBeenCalledWith([page(4)], 'file'));
    expect(mockFileDeps).toHaveBeenCalledWith(['image/*']);
  });

  it('a PDF that still arrives is deleted and named as not supported', async () => {
    const pdf = page(5, 'application/pdf');
    mockPickFile.mockResolvedValue({ ok: true, kind: 'file', files: [pdf] });
    const { screen, onPicked } = await renderChooser();
    await fireEvent.press(screen.getByText('Choose from files'));
    await waitFor(() => expect(screen.getByTestId('capture-chooser-error')).toBeTruthy());
    expect(onPicked).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith(pdf.uri);
  });

  it('a cancelled capture does nothing and says nothing', async () => {
    mockPickPhoto.mockResolvedValue({ ok: false, reason: 'cancelled' });
    const { screen, onPicked, onClose } = await renderChooser();
    await fireEvent.press(screen.getByText('Take a photo'));
    await waitFor(() => expect(mockPickPhoto).toHaveBeenCalled());
    expect(onPicked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('capture-chooser-error')).toBeNull();
  });

  it('a camera that is off shows the camera-off card with Open settings and Choose from files', async () => {
    mockScan.mockResolvedValue({ ok: false, reason: 'permission_denied' });
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { screen } = await renderChooser();
    await fireEvent.press(screen.getByText('Scan a document'));
    await waitFor(() => expect(screen.getByText('Camera access is off')).toBeTruthy());
    expect(screen.getByText('FincWin needs the camera to take a receipt photo. You can still choose a file.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open settings'));
    expect(spy).toHaveBeenCalled();
    expect(screen.getByText('Choose from files')).toBeTruthy();
    expect(screen.queryByText('Take a photo')).toBeNull();
  });

  it('a file that is too big says so under the list', async () => {
    mockPickFile.mockResolvedValue({ ok: false, reason: 'too_big' });
    const { screen } = await renderChooser();
    await fireEvent.press(screen.getByText('Choose from files'));
    await waitFor(() => expect(screen.getByText('That file is too big. Up to 5 MB.')).toBeTruthy());
  });

  it('Cancel closes', async () => {
    const { screen, onClose } = await renderChooser();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
