// D-10, D-11, D-12: wordmark/tagline from the i18n catalogue, the Apple pending-enrolment
// disabled state, both buttons calling their respective useAuth() sign-in methods exactly
// once, in-flight disabling of both buttons, the sign-in-failed error path (with
// captureError), the silent cancelled path, and the absence of any email/password input.
import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WelcomeScreen } from '../WelcomeScreen';

const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockCaptureError = jest.fn();
let mockAppleEnabled = true;

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
    signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  }),
}));

jest.mock('@/config/env', () => ({
  getEnv: () => ({ appleSignInEnabled: mockAppleEnabled }),
}));

jest.mock('@/services/errors', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}));

// DSG-03: mock insets per react-native-safe-area-context's own jest docs (matches
// src/theme/__tests__/screenInsets.test.tsx) rather than wrapping in SafeAreaProvider.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

jest.mock('expo-apple-authentication', () => {
  const reactActual = jest.requireActual('react');
  const rnActual = jest.requireActual('react-native');
  return {
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      reactActual.createElement(
        rnActual.Pressable,
        { onPress, testID: 'native-apple-button' },
        reactActual.createElement(rnActual.Text, null, 'Sign in with Apple')
      ),
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

async function renderScreen() {
  return render(
    <ThemeProvider>
      <WelcomeScreen />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAppleEnabled = true;
  Platform.OS = 'ios';
});

describe('WelcomeScreen', () => {
  it('renders the wordmark and tagline from the i18n catalogue', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('FincWin')).toBeTruthy();
    expect(getByText('Money with a purpose. Win every month.')).toBeTruthy();
  });

  it('disables the Apple button and shows the pending-enrolment note when Apple sign-in is not enabled', async () => {
    mockAppleEnabled = false;
    const { getAllByRole, getByText } = await renderScreen();

    const appleButton = getAllByRole('button')[0]!;
    expect(appleButton.props.accessibilityState?.disabled).toBe(true);
    expect(
      getByText('Apple sign-in arrives once our developer account is verified.')
    ).toBeTruthy();

    fireEvent.press(appleButton);
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });

  it('does not show the pending-enrolment note when Apple sign-in is enabled', async () => {
    const { queryByText } = await renderScreen();
    expect(
      queryByText('Apple sign-in arrives once our developer account is verified.')
    ).toBeNull();
  });

  it('calls signInWithApple once when the Apple button is pressed and enabled', async () => {
    mockSignInWithApple.mockResolvedValue({ status: 'signedIn' });
    const { getAllByRole } = await renderScreen();

    const appleButton = getAllByRole('button')[0]!;
    await act(async () => {
      fireEvent.press(appleButton);
    });

    expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
  });

  it('calls signInWithGoogle once when the Google button is pressed', async () => {
    mockSignInWithGoogle.mockResolvedValue({ status: 'signedIn' });
    const { getAllByRole } = await renderScreen();

    const googleButton = getAllByRole('button')[1]!;
    await act(async () => {
      fireEvent.press(googleButton);
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while a sign-in is in flight', async () => {
    let resolveSignIn!: (value: { status: 'signedIn' }) => void;
    mockSignInWithApple.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );
    const { getAllByRole } = await renderScreen();
    const [appleButton, googleButton] = getAllByRole('button');

    fireEvent.press(appleButton!);

    await waitFor(() => expect(googleButton!.props.accessibilityState?.disabled).toBe(true));
    expect(appleButton!.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      resolveSignIn({ status: 'signedIn' });
    });
  });

  it('shows the sign-in-failed error and calls captureError when a sign-in rejects', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('network down'));
    const { getAllByRole, getByText } = await renderScreen();

    const googleButton = getAllByRole('button')[1]!;
    await act(async () => {
      fireEvent.press(googleButton);
    });

    await waitFor(() => expect(getByText('Sign-in didn’t go through. Try again.')).toBeTruthy());
    expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), { area: 'auth' });
  });

  it('shows no error when the sign-in result is cancelled', async () => {
    mockSignInWithGoogle.mockResolvedValue({ status: 'cancelled' });
    const { getAllByRole, queryByText } = await renderScreen();

    const googleButton = getAllByRole('button')[1]!;
    await act(async () => {
      fireEvent.press(googleButton);
    });

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
    expect(queryByText('Sign-in didn’t go through. Try again.')).toBeNull();
  });

  it('renders no email or password input', async () => {
    const { queryAllByRole } = await renderScreen();
    expect(queryAllByRole('textbox')).toHaveLength(0);
  });

  it('renders the Android black pill (with the official Apple mark) when there is no native Apple button', async () => {
    Platform.OS = 'android';
    const { queryByTestId, getByText } = await renderScreen();
    expect(queryByTestId('native-apple-button')).toBeNull();
    expect(getByText('Sign in with Apple')).toBeTruthy();
  });
});
