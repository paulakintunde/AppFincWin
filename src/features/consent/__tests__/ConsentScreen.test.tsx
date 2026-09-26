// D-17: proves the heading/body/never-sent list render from the i18n catalogue, that the two
// choice buttons are the same size (equal weight, no dark pattern), that Share usage calls
// grant() exactly once and Not now calls decline() exactly once, that either choice then
// navigates to /you, and that there is no third close/skip control.
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConsentScreen } from '../ConsentScreen';

const mockGrant = jest.fn();
const mockDecline = jest.fn();

jest.mock('../useConsent', () => ({
  useConsent: () => ({
    consent: null,
    needsPrompt: true,
    grant: (...args: unknown[]) => mockGrant(...args),
    decline: (...args: unknown[]) => mockDecline(...args),
    setEnabled: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

// DSG-03: mock insets per react-native-safe-area-context's own jest docs.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

async function renderScreen() {
  return render(
    <ThemeProvider>
      <ConsentScreen />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGrant.mockResolvedValue(undefined);
  mockDecline.mockResolvedValue(undefined);
});

describe('ConsentScreen', () => {
  it('renders the heading, body and all five never-sent items', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Share anonymous usage?')).toBeTruthy();
    expect(
      getByText(
        'Helps us see where the app is confusing — never your amounts, payees or account names. Change this anytime in settings.'
      )
    ).toBeTruthy();
    expect(getByText('Amounts and balances')).toBeTruthy();
    expect(getByText('Payees and merchants')).toBeTruthy();
    expect(getByText('Account names')).toBeTruthy();
    expect(getByText('Notes, or anything you type')).toBeTruthy();
    expect(getByText('Your name or email')).toBeTruthy();
  });

  it('renders exactly two choices, of identical size, with neither pre-selected', async () => {
    const { getAllByRole, getByTestId } = await renderScreen();

    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);

    const shareStyle = StyleSheet.flatten(getByTestId('consent-share').props.style);
    const declineStyle = StyleSheet.flatten(getByTestId('consent-decline').props.style);
    expect(shareStyle.width).toBe(declineStyle.width);
    expect(shareStyle.minHeight).toBe(declineStyle.minHeight);
    expect(shareStyle.paddingVertical).toBe(declineStyle.paddingVertical);

    for (const button of buttons) {
      expect(button.props.accessibilityState?.selected).not.toBe(true);
    }
  });

  it('calls grant() once when Share usage is pressed, then navigates to /you', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('consent-share'));
    });

    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockDecline).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText('/you')).toBeTruthy());
  });

  it('calls decline() once when Not now is pressed, then navigates to /you', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('consent-decline'));
    });

    expect(mockDecline).toHaveBeenCalledTimes(1);
    expect(mockGrant).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText('/you')).toBeTruthy());
  });
});
