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
const mockContinueAs = jest.fn();
const mockSignInDifferent = jest.fn();
const mockLoad = jest.fn();
const mockForget = jest.fn();
let mockAppleEnabled = true;

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
    signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
    continueAs: (...args: unknown[]) => mockContinueAs(...args),
    signInWithDifferentAccount: (...args: unknown[]) => mockSignInDifferent(...args),
  }),
}));

jest.mock('../rememberedAccounts', () => ({
  loadRememberedAccounts: () => mockLoad(),
  forgetRememberedAccount: (...args: unknown[]) => mockForget(...args),
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
        reactActual.createElement(rnActual.Text, null, 'Sign in with Apple'),
      ),
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

async function renderScreen() {
  return render(
    <ThemeProvider>
      <WelcomeScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAppleEnabled = true;
  Platform.OS = 'ios';
  mockLoad.mockResolvedValue([]);
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
    expect(getByText('Apple sign-in arrives once our developer account is verified.')).toBeTruthy();

    fireEvent.press(appleButton);
    expect(mockSignInWithApple).not.toHaveBeenCalled();
  });

  it('does not show the pending-enrolment note when Apple sign-in is enabled', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText('Apple sign-in arrives once our developer account is verified.')).toBeNull();
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
      }),
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
    expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), {
      area: 'auth',
    });
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

  describe('remembered accounts (ACC-14)', () => {
    const ann = {
      provider: 'google',
      email: 'ann@x.com',
      name: 'Ann',
      lastUsedAt: '2026-10-01T00:00:00Z',
    };
    const bob = {
      provider: 'google',
      email: 'bob@x.com',
      name: null,
      lastUsedAt: '2026-09-01T00:00:00Z',
    };

    it('shows no heading, note or different-account label when none are remembered', async () => {
      const { queryByText, getByText } = await renderScreen();
      expect(getByText('Continue with Google')).toBeTruthy();
      expect(queryByText('Continue as')).toBeNull();
      expect(
        queryByText('Only the name and email are kept on this phone after sign-out.'),
      ).toBeNull();
    });

    it('renders tiles, the different-account label and the retention note', async () => {
      mockLoad.mockResolvedValue([ann, bob]);
      const { findByText, getByLabelText, getByText } = await renderScreen();
      expect(await findByText('Continue as')).toBeTruthy();
      expect(getByLabelText('Continue as Ann, ann@x.com, Google')).toBeTruthy();
      expect(getByLabelText('Continue as bob@x.com, bob@x.com, Google')).toBeTruthy();
      expect(getByText('Use a different account')).toBeTruthy();
      expect(
        getByText('Only the name and email are kept on this phone after sign-out.'),
      ).toBeTruthy();
    });

    it('signs in through continueAs and disables everything while pending', async () => {
      mockLoad.mockResolvedValue([ann, bob]);
      let resolve!: (v: { status: 'signedIn' }) => void;
      mockContinueAs.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const { findByLabelText, getByLabelText, getByText } = await renderScreen();
      const tile = await findByLabelText('Continue as Ann, ann@x.com, Google');
      fireEvent.press(tile);
      await waitFor(() =>
        expect(tile.props.accessibilityState).toMatchObject({
          busy: true,
          disabled: true,
        }),
      );
      expect(mockContinueAs).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google', email: 'ann@x.com' }),
      );
      expect(
        getByLabelText('Continue as bob@x.com, bob@x.com, Google').props.accessibilityState
          .disabled,
      ).toBe(true);
      expect(getByText('Use a different account')).toBeTruthy();
      await act(async () => {
        resolve({ status: 'signedIn' });
      });
    });

    it('shows the error on rejection and none on cancelled', async () => {
      mockLoad.mockResolvedValue([ann]);
      mockContinueAs.mockRejectedValueOnce(new Error('x'));
      const { findByLabelText, getByText, queryByText } = await renderScreen();
      const tile = await findByLabelText('Continue as Ann, ann@x.com, Google');
      await act(async () => {
        fireEvent.press(tile);
      });
      await waitFor(() => expect(getByText('Sign-in didn’t go through. Try again.')).toBeTruthy());
      expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), {
        area: 'auth',
      });
      mockContinueAs.mockResolvedValueOnce({ status: 'cancelled' });
      await act(async () => {
        fireEvent.press(tile);
      });
      await waitFor(() => expect(queryByText('Sign-in didn’t go through. Try again.')).toBeNull());
    });

    it('opens the account list via signInWithDifferentAccount', async () => {
      mockLoad.mockResolvedValue([ann]);
      mockSignInDifferent.mockResolvedValue({ status: 'cancelled' });
      const { findByText } = await renderScreen();
      await act(async () => {
        fireEvent.press(await findByText('Use a different account'));
      });
      expect(mockSignInDifferent).toHaveBeenCalledTimes(1);
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });

    it('removes a tile immediately and restores the default layout after the last', async () => {
      mockLoad.mockResolvedValue([ann, bob]);
      mockForget.mockResolvedValueOnce([ann]).mockResolvedValueOnce([]);
      const { findByLabelText, queryByLabelText, queryByText, getByText } = await renderScreen();
      await act(async () => {
        fireEvent.press(await findByLabelText('Remove bob@x.com from this phone'));
      });
      expect(mockForget).toHaveBeenCalledWith('google', 'bob@x.com');
      await waitFor(() =>
        expect(queryByLabelText('Continue as bob@x.com, bob@x.com, Google')).toBeNull(),
      );
      await act(async () => {
        fireEvent.press(await findByLabelText('Remove Ann from this phone'));
      });
      await waitFor(() => expect(getByText('Continue with Google')).toBeTruthy());
      expect(queryByText('Continue as')).toBeNull();
    });
  });
});
