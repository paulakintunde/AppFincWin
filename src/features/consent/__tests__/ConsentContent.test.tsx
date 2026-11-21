// 09-21: ConsentContent reports the answer through onDone and never redirects; the Last step line is opt-in.
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConsentContent } from '../ConsentScreen';

const mockGrant = jest.fn();
const mockDecline = jest.fn();

jest.mock('../useConsent', () => ({
  useConsent: () => ({
    consent: null,
    loading: false,
    needsPrompt: true,
    grant: (...args: unknown[]) => mockGrant(...args),
    decline: (...args: unknown[]) => mockDecline(...args),
    setEnabled: jest.fn(),
  }),
}));

jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));

jest.mock('expo-router', () => ({
  Redirect: () => {
    throw new Error('ConsentContent must not redirect');
  },
}));

async function renderContent(onDone: jest.Mock, lastStep = false) {
  return await render(
    <ThemeProvider>
      <ConsentContent onDone={onDone} lastStep={lastStep} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGrant.mockResolvedValue(true);
  mockDecline.mockResolvedValue(true);
});

describe('ConsentContent', () => {
  it('calls onDone with granted after Share saves', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await renderContent(onDone);
    fireEvent.press(getByTestId('consent-share'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('granted'));
    expect(mockGrant).toHaveBeenCalledTimes(1);
  });

  it('calls onDone with declined after Don’t share saves', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await renderContent(onDone);
    fireEvent.press(getByTestId('consent-decline'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('declined'));
  });

  it('does not call onDone when the write fails and shows the error', async () => {
    mockGrant.mockResolvedValue(false);
    const onDone = jest.fn();
    const { getByTestId } = await renderContent(onDone);
    fireEvent.press(getByTestId('consent-share'));
    await waitFor(() => expect(getByTestId('consent-save-failed')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the Last step line only when asked', async () => {
    const a = await renderContent(jest.fn(), false);
    expect(a.queryByTestId('consent-last-step')).toBeNull();
    a.unmount();
    const b = await renderContent(jest.fn(), true);
    expect(b.getByText('Last step. Your answer is not counted in the 11 questions.')).toBeTruthy();
  });
});
