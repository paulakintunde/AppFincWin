import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { OnboardingFlow } from '../OnboardingFlow';

jest.setTimeout(30000);

const mockSave = jest.fn();
const mockReplace = jest.fn();
const mockTrack = jest.fn();
const mockShowToast = jest.fn();
let mockSetup: Record<string, unknown> | null = null;
let mockConsent: { loading: boolean; consent: 'granted' | 'declined' | null } = { loading: false, consent: null };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/features/levels/useUserSetup', () => ({ useUserSetup: () => ({ data: mockSetup, loading: false }) }));
jest.mock('@/data/mutations/userSetup', () => ({
  useSaveUserSetup: () => ({ saveUserSetup: (v: unknown) => mockSave(v) }),
  useReplaceFeatureSwitches: () => ({ replaceFeatureSwitches: (v: unknown) => mockReplace(v) }),
}));
jest.mock('@/features/consent/useConsent', () => ({
  useConsent: () => ({ ...mockConsent, needsPrompt: mockConsent.consent === null, grant: jest.fn(async () => true), decline: jest.fn(async () => true), setEnabled: jest.fn() }),
}));
jest.mock('@/features/levels/useHoldsData', () => ({ useHoldsData: () => ({}) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { home_currency: 'USD', region: null } }) }));
jest.mock('@/data/mutations/moneyPrefs', () => ({ useUpdateMoneyPrefs: () => ({ setHomeCurrency: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: () => ({ options: [{ code: 'USD', name: 'US dollar', symbol: '$', exponent: 2, kind: 'iso', rateDate: null }], loading: false }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
jest.mock('@/features/income/useIncomeContext', () => ({ useIncomeContext: () => ({ settings: null, series: [] }) }));
jest.mock('@/features/income/IncomeProfileSteps', () => {
  const R = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IncomeProfileSteps: R.forwardRef(({ step, onReadyChange }: { step: string; onReadyChange: (r: unknown) => void }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ save: () => ({ stepId: null }) }));
      R.useEffect(() => onReadyChange({ canContinue: true, reasonKey: null, dirty: false }), [onReadyChange]);
      return <Text>{`income-step-${step}`}</Text>;
    }),
  };
});

async function renderFlow(props: Partial<React.ComponentProps<typeof OnboardingFlow>> & { mode: 'first_run' | 'partner' | 'rerun' }) {
  const onFinished = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <OnboardingFlow onFinished={onFinished} {...props} />
    </ThemeProvider>
  );
  return { ...utils, onFinished };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetup = null;
  mockConsent = { loading: false, consent: null };
});

describe('OnboardingFlow', () => {
  it('first run: skipping every question reaches the summary with Skipped rows and Everyday', async () => {
    const { getByText, getAllByText, queryByTestId, onFinished } = await renderFlow({ mode: 'first_run' });
    expect(getByText('1 of 11')).toBeTruthy();
    for (let i = 0; i < 11; i++) await fireEvent.press(screen.getByTestId('onb-skip'));
    // the unnumbered analytics step comes before the summary
    expect(getByText('Last step. Your answer is not counted in the 11 questions.')).toBeTruthy();
    expect(queryByTestId('onb-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('consent-decline'));
    expect(await screen.findByText('Here is your FincWin')).toBeTruthy();
    expect(getAllByText('Skipped').length).toBe(9);
    expect(screen.getByText(/^Everyday · \d+ of \d+ features on$/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(onFinished).toHaveBeenCalledWith({ level: 2 });
    expect(mockReplace).toHaveBeenCalledWith({ userId: 'u1', map: {} });
  });

  it('first run: a question answer is kept and the summary shows it', async () => {
    const { getByText } = await renderFlow({ mode: 'first_run' });
    await fireEvent.press(screen.getByTestId('onb-option-goal-debt'));
    await fireEvent.press(getByText('Continue'));
    expect(getByText('2 of 11')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-skip-rest'));
    await fireEvent.press(screen.getByTestId('consent-share'));
    expect(await screen.findByText('Clear debt')).toBeTruthy();
  });

  it('questions 4 to 6 mount the shared income steps', async () => {
    mockConsent = { loading: false, consent: 'granted' };
    const { getByText } = await renderFlow({ mode: 'first_run' });
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(getByText('4 of 11')).toBeTruthy();
    expect(getByText('income-step-paid')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(getByText('income-step-pay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(getByText('income-step-season')).toBeTruthy();
  });

  it('partner mode: 3 of 9, the privacy line, and no currency or sharing question', async () => {
    const { getByText, queryByText } = await renderFlow({ mode: 'partner', payerName: 'Sam' });
    expect(getByText('1 of 9')).toBeTruthy();
    expect(getByText('Private. Not shown to Sam or other members.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(queryByText('What do you count in?')).toBeNull();
    expect(getByText('2 of 9')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(getByText('3 of 9')).toBeTruthy();
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByTestId('onb-skip'));
    expect(queryByText('Do you share money with anyone?')).toBeNull();
  });

  it('the analytics step has Share and Don’t share at the same size', async () => {
    const { getByTestId } = await renderFlow({ mode: 'first_run' });
    await fireEvent.press(screen.getByTestId('onb-skip-rest'));
    const share = StyleSheet.flatten(getByTestId('consent-share').props.style);
    const decline = StyleSheet.flatten(getByTestId('consent-decline').props.style);
    expect(share.width).toBe(decline.width);
    expect(share.minHeight).toBe(decline.minHeight);
  });

  it('the analytics step is absent when consent is already answered', async () => {
    mockConsent = { loading: false, consent: 'granted' };
    const { queryByTestId, getByText } = await renderFlow({ mode: 'first_run' });
    await fireEvent.press(screen.getByTestId('onb-skip-rest'));
    expect(queryByTestId('consent-share')).toBeNull();
    expect(getByText('Here is your FincWin')).toBeTruthy();
  });

  it('re-run: Apply these is offered, and Keep what I have writes nothing', async () => {
    mockSetup = { version: 2, level: 3, answers: { goal: 'debt' }, resumeStep: null };
    const { getByText, onFinished } = await renderFlow({ mode: 'rerun' });
    await fireEvent.press(screen.getByTestId('onb-skip-rest'));
    expect(getByText('Apply these')).toBeTruthy();
    expect(getByText('Features that hold your records stay on.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onb-keep'));
    expect(onFinished).toHaveBeenCalledWith(null);
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'onboarding.rerun.keepToast' } });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('no question screen mentions tax', async () => {
    mockConsent = { loading: false, consent: 'granted' };
    await renderFlow({ mode: 'first_run' });
    for (let i = 0; i < 11; i++) {
      expect(screen.queryByText(/\btax\b/i)).toBeNull();
      await fireEvent.press(screen.getByTestId('onb-skip'));
    }
  });
});
