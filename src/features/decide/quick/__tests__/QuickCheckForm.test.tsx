import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { showToast } from '@/state/undoToast';
import { minorUnits } from '@/engine/money';
import { computeQuick } from '../../snapshot/computeCheck';
import { defaultQuickInputs } from '../../snapshot/checkInputs';
import { EMPTY_STACK, type QuickComputation, type StackSelection } from '../../snapshot/types';
import { TODAY, loggedSource, noneSource, roughSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { QuickCheckForm, type QuickCheckFormProps } from '../QuickCheckForm';
import { QuickResult } from '../QuickResult';
import { toEngineOther } from './helpers/otherCheck';

jest.setTimeout(30000);

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const safe = (node: React.ReactNode) => <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>;

const mockTrack = jest.fn();
let mockStack: StackSelection = EMPTY_STACK;
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/data/queries/decide', () => ({ useOtherChecks: () => mockStack }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockStack = EMPTY_STACK;
});

function formProps(over: Partial<QuickCheckFormProps> = {}): QuickCheckFormProps {
  return { surface: 'home', source: loggedSource(), sourceStatus: 'ready', today: TODAY, currency: 'USD', ...over };
}
async function renderForm(over: Partial<QuickCheckFormProps> = {}) {
  const props = formProps(over);
  const view = await render(
    safe(
      <ThemeProvider>
        <QuickCheckForm {...props} />
      </ThemeProvider>
    )
  );
  return { props, view };
}
async function checkIt(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Quick check'), text);
  await fireEvent.press(screen.getByText('Check it'));
}

describe('QuickCheckForm: home', () => {
  it('starts on Cash with no result, a 12 month default hidden until Credit', async () => {
    await renderForm();
    expect(screen.getByPlaceholderText('car 14500')).toBeTruthy();
    expect(screen.queryByLabelText('Cash')).toBeNull();
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
    expect(screen.queryByLabelText('Annual rate, percent')).toBeNull();
    expect(screen.queryByText('Run the full check')).toBeNull();
  });

  it('D-78 the idle card is the pill only', async () => {
    await renderForm();
    expect(screen.getByText('Check it')).toBeTruthy();
    for (const absent of ['Cash', 'Credit', '+ Tax, fees', 'Clear', 'Run the full check']) {
      expect(screen.queryByLabelText(absent)).toBeNull();
    }
    expect(screen.queryByLabelText('Clear the quick check')).toBeNull();
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
  });

  it('D-78 the toggle appears with a result, Cash selected', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.getByLabelText('Cash').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('Credit').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('D-78 the Credit footer is the last line of the result block and Cash has none', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Credit'));
    expect(screen.getByText('Worked out from the figures you entered.')).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    const at = (needle: string) => tree.indexOf(needle);
    expect(at('Worked out from the figures you entered.')).toBeGreaterThan(-1);
    expect(at('Worked out from the figures you entered.')).toBeLessThan(at('Annual rate, percent'));
    expect(at('Worked out from the figures you entered.')).toBeLessThan(at('+ Tax, fees'));
  });

  it('D-78 Clear returns the card to idle with no toast', async () => {
    await renderForm();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Clear the quick check'));
    expect(screen.queryByLabelText('Cash')).toBeNull();
    expect(screen.queryByLabelText('Clear the quick check')).toBeNull();
    expect(screen.getByLabelText('Quick check').props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('D-70 the size line and the annual rate carry their ⓘ', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.getAllByLabelText(/^About /).length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(screen.getByLabelText('Credit'));
    expect(screen.getAllByLabelText(/^About /).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText('About Before any interest')).toBeTruthy();
  });

  it('D-76 the quick result line is not clamped', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(JSON.stringify(screen.toJSON())).not.toContain('"numberOfLines":3');
  });

  it('D-76 rule P: the idle pill always shows the short placeholder, since the Check it button shares the pill', async () => {
    await renderForm();
    expect(screen.getByPlaceholderText('car 14500')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Something and a price/)).toBeNull();
  });

  it('R4 the quick APR refuses 1000% and shows the range line', async () => {
    await renderForm();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Credit'));
    await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '1000');
    expect(screen.getByLabelText('Annual rate, percent').props.value).toBe('0');
    expect(screen.getByText('0 to 999.99% a year')).toBeTruthy();
  });

  it('R4 the sales tax refuses 101% and shows the range line', async () => {
    await renderForm();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('+ Tax, fees'));
    await fireEvent.changeText(screen.getByLabelText('Sales tax, percent'), '101');
    expect(screen.getByLabelText('Sales tax, percent').props.value).toBe('');
    expect(screen.getByText('0 to 100%')).toBeTruthy();
  });

  it('D-71 a custom duration drives the label and carries to the full check', async () => {
    const onRunFull = jest.fn();
    await renderForm({ onRunFull });
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Credit'));
    await fireEvent.press(screen.getByText('Custom'));
    await fireEvent.changeText(screen.getByLabelText('Over how many months, custom, months'), '90');
    expect(screen.getByText(/^Over 90\s+months$/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Run the full check'));
    expect(onRunFull.mock.calls[0][0].loan.termMonths).toBe(90);
  });

  it('gives one chip, the size and one line, and See it on credit keeps the amount at 0 and 12 months', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.getByText('Not from cash')).toBeTruthy();
    expect(screen.getByText(/^Car at \$14,500(\.00)?$/)).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('quick_check_run', { state: 'no' });
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
    await fireEvent.press(screen.getByText('See it on credit'));
    expect(screen.getByText('Worked out from the figures you entered.')).toBeTruthy();
    expect(screen.getByLabelText('Credit').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('Annual rate, percent').props.value).toBe('0');
    expect(screen.getByText('before any interest')).toBeTruthy();
    expect(screen.getByLabelText('Over how many months')).toBeTruthy();
    expect(screen.getByLabelText('12 months').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getAllByText(/a month for 12\s+months, before any interest/).length).toBeGreaterThan(0);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('WR-B08: a model number is not read as the price, and the result echoes the price it read', async () => {
    await renderForm();
    await checkIt('iPhone 15 Pro 1199');
    expect(screen.getByText(/^iPhone 15 Pro at \$1,199(\.00)?$/)).toBeTruthy();
  });

  it('CR-B04: See it on credit sits outside the accessible live region, so screen readers can focus it', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.getByTestId('quick-result-live').props.accessible).toBe(true);
    const button = screen.getByLabelText('See it on credit, keeps the amount');
    for (let node = button.parent; node !== null; node = node.parent) {
      expect(node.props.accessible === true).toBe(false);
    }
  });

  it('shows a rate hint of a year once a rate above zero is typed, and no rate the user did not type', async () => {
    await renderForm();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Credit'));
    await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '9.5');
    expect(screen.getByText('a year')).toBeTruthy();
    expect(screen.queryByText('before any interest')).toBeNull();
    await fireEvent.press(screen.getByLabelText('36 months'));
    expect(screen.getByLabelText('36 months').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('12 months').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('shows no rate or term the user did not enter', async () => {
    await renderForm();
    await checkIt('car 14500');
    expect(screen.queryByText(/9\.4/)).toBeNull();
    expect(screen.queryByText(/48 months/)).toBeNull();
  });

  it('collapses Tax, fees and sums them in the summary', async () => {
    await renderForm();
    await checkIt('car 14500');
    const row = screen.getByLabelText('+ Tax, fees');
    expect(row.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByLabelText('Sales tax, percent')).toBeNull();
    await fireEvent.press(row);
    expect(screen.getByLabelText('Sales tax, percent').props.placeholder).toBe('The rate');
    await fireEvent.changeText(screen.getByLabelText('Sales tax, percent'), '10');
    await fireEvent.press(row);
    expect(screen.getByLabelText(/^\+ Tax, fees, \+/).props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByText('+$1,450')).toBeTruthy();
  });

  it('Run the full check hands every field over as CheckInputs with loan and 0% in Credit', async () => {
    const onRunFull = jest.fn();
    await renderForm({ onRunFull });
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Credit'));
    await fireEvent.press(screen.getByText('Run the full check'));
    expect(onRunFull).toHaveBeenCalledTimes(1);
    const inputs = onRunFull.mock.calls[0][0];
    expect(inputs).toMatchObject({ name: 'Car', advertised: 1_450_000, method: 'loan' });
    expect(inputs.loan.aprText).toBe('0');
  });

  it('Clear hides the result again', async () => {
    await renderForm();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByText('Clear'));
    expect(screen.queryByText('Not from cash')).toBeNull();
    expect(screen.getByLabelText('Quick check').props.value).toBe('');
  });

  it('a parse failure shows the toast and fires nothing', async () => {
    await renderForm();
    await checkIt('car');
    expect(showToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'decide.quick.parseError' } });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('no figures shows no chip', async () => {
    const onAddRough = jest.fn();
    await renderForm({ source: noneSource(), onAddRough });
    await checkIt('car 14500');
    expect(screen.queryByText('Missing terms')).toBeNull();
    expect(screen.queryByText('Not from cash')).toBeNull();
    expect(screen.getByText('There is nothing to judge this against yet.')).toBeTruthy();
    expect(screen.queryByText('Run the full check')).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
    expect(onAddRough).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Clear')).toBeTruthy();
  });

  it('a missing rate disables the full check', async () => {
    const onRunFull = jest.fn();
    await renderForm({ source: unconvertedSource(), onRunFull });
    await checkIt('car 14500');
    expect(screen.getByText('Missing terms')).toBeTruthy();
    expect(screen.getByText('No rate is stored for EUR, so this cannot be scored yet.')).toBeTruthy();
    const run = screen.getByLabelText('Run the full check');
    expect(run.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(run);
    expect(onRunFull).not.toHaveBeenCalled();
  });

  it('the pill shows only with two open checks', async () => {
    mockStack = { otherChecks: [], openCount: 1, leftOutIncomplete: 0, leftOutCurrency: 0 };
    const one = await renderForm();
    await checkIt('car 14500');
    expect(screen.queryByLabelText('With my other open checks')).toBeNull();
    await one.view.unmount();
    mockStack = { otherChecks: [], openCount: 2, leftOutIncomplete: 0, leftOutCurrency: 0 };
    await renderForm();
    await checkIt('car 14500');
    const pill = screen.getByLabelText('With my other open checks');
    expect(pill.props.accessibilityState).toMatchObject({ checked: true });
    mockTrack.mockClear();
    await fireEvent.press(pill);
    expect(screen.getByLabelText('With my other open checks').props.accessibilityState).toMatchObject({ checked: false });
    expect(mockTrack).not.toHaveBeenCalled(); // the toggle sends nothing
  });

  it('one open check still combines and says so', async () => {
    mockStack = { otherChecks: [toEngineOther(100_000)], openCount: 1, leftOutIncomplete: 0, leftOutCurrency: 0 };
    await renderForm();
    await checkIt('car 1000');
    expect(screen.queryByLabelText('With my other open checks')).toBeNull();
    expect(screen.getByText('Worked out with your other open check.')).toBeTruthy();
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
  });

  it('an out-of-range rate or price never reaches the engine', async () => {
    await renderForm();
    await checkIt(`car ${'9'.repeat(16)}`);
    expect(showToast).toHaveBeenCalled();
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
    await checkIt('car 14500');
    await fireEvent.press(screen.getByLabelText('Credit'));
    await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '5000');
    expect(screen.getByLabelText('Annual rate, percent').props.value).toBe('0');
    await fireEvent.changeText(screen.getByLabelText('Annual rate, percent'), '9.');
    expect(screen.getByLabelText('Annual rate, percent').props.value).toBe('9.');
    await fireEvent.changeText(screen.getByLabelText('Quick check'), `car ${'9'.repeat(16)}`);
    expect(screen.queryByText('Worked out from the figures you entered.')).toBeNull();
  });

  it('loading renders a busy skeleton and error offers Try again', async () => {
    const loading = await renderForm({ sourceStatus: 'loading', source: null });
    expect(screen.getByLabelText('Checking').props.accessibilityState).toMatchObject({ busy: true });
    await loading.view.unmount();
    const onRetry = jest.fn();
    await renderForm({ sourceStatus: 'error', source: null, onRetry });
    expect(screen.getByText('Your figures didn’t load')).toBeTruthy();
    expect(screen.getByText('A check needs your latest figures.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('QuickCheckForm: first read', () => {
  it('uses two fields, shows the basis and no Run the full check', async () => {
    const onResult = jest.fn();
    await renderForm({ surface: 'firstRead', source: roughSource(), onResult });
    expect(screen.queryByLabelText('Quick check')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('What is it?'), 'Laptop');
    await fireEvent.changeText(screen.getByLabelText('Price'), '1500');
    await fireEvent(screen.getByLabelText('Price'), 'blur');
    await fireEvent.press(screen.getByText('Check it'));
    expect(screen.getByText('First read, from the figures you gave. An import or a month of logging sharpens it.')).toBeTruthy();
    expect(screen.queryByText('Run the full check')).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('the skip path is cash only', async () => {
    await renderForm({ surface: 'firstRead', source: noneSource() });
    await fireEvent.changeText(screen.getByLabelText('What is it?'), 'Car');
    await fireEvent.changeText(screen.getByLabelText('Price'), '1450');
    await fireEvent(screen.getByLabelText('Price'), 'blur');
    await fireEvent.press(screen.getByText('Check it'));
    expect(screen.getByText('Cash only · no monthly figures yet')).toBeTruthy();
    expect(screen.getByText(/From your cash alone/)).toBeTruthy();
    expect(screen.queryByText(/cushion/)).toBeNull();
    expect(screen.queryByText(/The month/)).toBeNull();
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.queryByText('Not from cash')).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe('QuickResult', () => {
  const plain = (n: number) => `$${Math.round(n / 100)}`;
  const cents = (n: number) => `$${(n / 100).toFixed(2)}`;
  const base = (): Extract<QuickComputation, { kind: 'cash_only' }> => {
    const c = computeQuick(noneSource(), { ...defaultQuickInputs(), name: 'Car', price: 500_000, mode: 'credit', aprText: '5', termMonths: 12 }, { allowCashOnly: true });
    if (c.kind !== 'cash_only') throw new Error(c.kind);
    return c;
  };
  const show = (computation: Exclude<QuickComputation, { kind: 'incomplete' }>) =>
    safe(
      <ThemeProvider>
        <QuickResult
          computation={computation}
          mode="credit"
          name="Car"
          fmt={plain}
          fmtCents={cents}
          onTryCredit={jest.fn()}
          combine
          onCombine={jest.fn()}
          openCount={0}
        />
      </ThemeProvider>
    );

  it('the caption keeps the chosen term and adds the payoff month', async () => {
    await render(show({ ...base(), months: 10 }));
    expect(screen.getByText('a month for 12\u00A0months · paid off in month 10')).toBeTruthy();
  });

  it('a full term keeps the plain caption', async () => {
    await render(show({ ...base(), months: 12 }));
    expect(screen.getByText('a month for 12\u00A0months')).toBeTruthy();
  });

  it('the quick result is announced only after typing settles', async () => {
    jest.useFakeTimers();
    try {
      const first = base();
      const view = await render(show(first));
      const label = () => screen.getByLabelText(/From your cash alone/).props.accessibilityLabel as string;
      const before = label();
      await view.rerender(show({ ...first, dayOne: minorUnits(400_000), cashAfter: minorUnits(100) }));
      expect(label()).toBe(before);
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(label()).not.toBe(before);
      expect(screen.getByLabelText(/From your cash alone/).props.accessibilityLiveRegion).toBe('polite');
    } finally {
      jest.useRealTimers();
    }
  });
});
