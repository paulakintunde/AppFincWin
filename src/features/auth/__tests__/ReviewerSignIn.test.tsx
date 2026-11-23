// 10-25 (ACC-11, D-30): the visible "App review sign-in" link, the sheet, the one refusal line, and the signed-out reason line.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WelcomeScreen } from '../WelcomeScreen';
import { setSignOutReason, consumeSignOutReason } from '../signOutReason';

const mockReviewerSignIn = jest.fn();

jest.mock('@/services/auth/reviewerSignIn', () => ({
  reviewerSignIn: (...a: unknown[]) => mockReviewerSignIn(...a),
}));

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    continueAs: jest.fn(),
    signInWithDifferentAccount: jest.fn(),
  }),
}));

jest.mock('../rememberedAccounts', () => ({
  loadRememberedAccounts: () => Promise.resolve([]),
  forgetRememberedAccount: jest.fn(),
}));

jest.mock('@/config/env', () => ({ getEnv: () => ({ appleSignInEnabled: true }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

jest.mock('expo-apple-authentication', () => {
  const reactActual = jest.requireActual('react');
  const rnActual = jest.requireActual('react-native');
  return {
    AppleAuthenticationButton: () => reactActual.createElement(rnActual.View),
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn() },
}));

async function renderScreen() {
  return render(
    <ThemeProvider>
      <WelcomeScreen />
    </ThemeProvider>,
  );
}

jest.setTimeout(60000);

beforeEach(() => {
  mockReviewerSignIn.mockReset();
  consumeSignOutReason();
});

describe('reviewer sign-in entry', () => {
  it('shows a visible link and opens the sheet with email and password fields', async () => {
    const { getByText, queryByTestId, findByTestId } = await renderScreen();
    expect(queryByTestId('reviewer-email')).toBeNull();
    fireEvent.press(getByText('App review sign-in'));
    expect(await findByTestId('reviewer-email')).toBeTruthy();
    expect((await findByTestId('reviewer-password')).props.secureTextEntry).toBe(true);
    expect(getByText('Sign in')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('shows one refusal line for a failed attempt', async () => {
    mockReviewerSignIn.mockResolvedValue('invalid');
    const { getByText, findByTestId } = await renderScreen();
    fireEvent.press(getByText('App review sign-in'));
    fireEvent.changeText(await findByTestId('reviewer-email'), 'x@y.z');
    fireEvent.changeText(await findByTestId('reviewer-password'), 'nope');
    await waitFor(() => {
      fireEvent.press(getByText('Sign in'));
      expect(mockReviewerSignIn).toHaveBeenCalled();
    }, { timeout: 15000 });
    await waitFor(() => expect(mockReviewerSignIn).toHaveBeenCalledWith('x@y.z', 'nope'), { timeout: 15000 });
    await waitFor(() => expect(getByText('That email and password did not work.')).toBeTruthy(), { timeout: 15000 });
  });

  it('closes the sheet on success', async () => {
    mockReviewerSignIn.mockResolvedValue('ok');
    const { getByText, findByTestId, queryByTestId } = await renderScreen();
    fireEvent.press(getByText('App review sign-in'));
    fireEvent.changeText(await findByTestId('reviewer-email'), 'x@y.z');
    fireEvent.changeText(await findByTestId('reviewer-password'), 'pw');
    await waitFor(() => {
      fireEvent.press(getByText('Sign in'));
      expect(mockReviewerSignIn).toHaveBeenCalled();
    }, { timeout: 15000 });
    await waitFor(() => expect(mockReviewerSignIn).toHaveBeenCalledWith('x@y.z', 'pw'), { timeout: 15000 });
    // the sheet leaves with a slide, so its fields are cleared on close rather than gone at once
    await waitFor(() => expect((queryByTestId('reviewer-password') as { props: { value: string } } | null)?.props.value ?? '').toBe(''), {
      timeout: 15000,
    });
  });
});

describe('signed-out reason line', () => {
  it('says so after a remote sign-out', async () => {
    setSignOutReason('remote');
    const { findByText } = await renderScreen();
    expect(await findByText('You were signed out of this device.')).toBeTruthy();
  });

  it('says so after deletion', async () => {
    setSignOutReason('deleted');
    const { findByText } = await renderScreen();
    expect(await findByText('Your account was deleted.')).toBeTruthy();
  });

  it('shows nothing after a local sign-out', async () => {
    setSignOutReason('local');
    const { queryByText } = await renderScreen();
    expect(queryByText('You were signed out of this device.')).toBeNull();
    expect(queryByText('Your account was deleted.')).toBeNull();
  });
});
