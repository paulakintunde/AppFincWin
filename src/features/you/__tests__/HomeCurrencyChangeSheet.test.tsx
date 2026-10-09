// REC-25: the confirm flow against a mocked useChangeHomeCurrency.
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, dismissToast, resetToastForTests } from '@/state/undoToast';
import { HomeCurrencyChangeSheet } from '../components/HomeCurrencyChangeSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'GBP' }),
}));

let mockChange: jest.Mock;
let mockPending = false;
jest.mock('@/data/mutations/homeCurrency', () => ({
  useChangeHomeCurrency: () => ({ change: (...a: unknown[]) => mockChange(...a), pending: mockPending }),
}));

const onClose = jest.fn();
async function renderSheet() {
  return render(
    <ThemeProvider>
      <HomeCurrencyChangeSheet visible next="USD" onClose={onClose} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPending = false;
  resetToastForTests();
});

describe('HomeCurrencyChangeSheet', () => {
  it('shows the title, keeps-amounts line, Cancel and Change to USD', async () => {
    const { getByText } = await renderSheet();
    expect(getByText('Change home currency to USD?')).toBeTruthy();
    expect(getByText('Each line keeps the amount and currency it was entered in.')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Change to USD')).toBeTruthy();
  });

  it('shows Getting rates… on a disabled button while pending', async () => {
    mockPending = true;
    const { getByLabelText } = await renderSheet();
    expect(getByLabelText('Getting rates…').props.accessibilityState.disabled).toBe(true);
  });

  it('success with caps: closes, toasts the change then queues the caps toast', async () => {
    mockChange = jest.fn().mockResolvedValue({ ok: true, capsConverted: 2 });
    const { getByText } = await renderSheet();
    await act(async () => {
      fireEvent.press(getByText('Change to USD'));
    });
    expect(mockChange).toHaveBeenCalledWith('USD');
    expect(onClose).toHaveBeenCalled();
    expect(getToast()?.text).toEqual({ key: 'you.homeCurrency.done', params: { code: 'USD' } });
    dismissToast();
    expect(getToast()?.text).toEqual({ key: 'you.homeCurrency.capsConverted', params: { code: 'USD' } });
  });

  it('success with no caps shows only the first toast', async () => {
    mockChange = jest.fn().mockResolvedValue({ ok: true, capsConverted: 0 });
    const { getByText } = await renderSheet();
    await act(async () => {
      fireEvent.press(getByText('Change to USD'));
    });
    dismissToast();
    expect(getToast()).toBeNull();
  });

  it('rates failure keeps the sheet open with the unchanged line', async () => {
    mockChange = jest.fn().mockResolvedValue({ ok: false, reason: 'rates' });
    const { getByText } = await renderSheet();
    await act(async () => {
      fireEvent.press(getByText('Change to USD'));
    });
    expect(getByText('Couldn’t get today’s rates. Home currency is unchanged. Try again.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(getToast()).toBeNull();
  });

  it('changed elsewhere closes the sheet without a success toast', async () => {
    mockChange = jest.fn().mockResolvedValue({ ok: false, reason: 'changed' });
    const { getByText } = await renderSheet();
    await act(async () => {
      fireEvent.press(getByText('Change to USD'));
    });
    expect(onClose).toHaveBeenCalled();
    expect(getToast()).toBeNull();
  });
});
