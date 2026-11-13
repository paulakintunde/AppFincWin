import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { homeFigure, monthPicture, pastMonthBars, prepare, type MonthPicture } from '@/engine/decide/v3';
import { inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import { QUICK_LINE_KINDS } from '../../sheets/quickLineKinds';
import { wrap } from '@/test/stepProps';
import * as quickParse from '../../../quickParse';
import { DecideHome } from '../DecideHome';

jest.setTimeout(60000);

const mockStart = jest.fn();
const mockPush = jest.fn();
let mockPending = false;
let mockOnline = true;
let mockStatus: 'ready' | 'error' = 'ready';
let mockPicture: MonthPicture | null = null;
let mockBars: ReturnType<typeof pastMonthBars> = [];
let mockInputs: unknown = null;
let mockProgress = { items: [], doneCount: 0, next: 'pay', allDone: false, loading: false, currency: 'USD', today: '2026-10-03' };
let mockOpenRows: unknown[] = [];
let mockUserId: string | null = 'u1';
let mockFocused = true;
const mockHideFab = jest.fn();
const mockScrollTo = jest.fn();
let mockTabProps: Record<string, unknown> = {};

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: jest.fn() }), useLocalSearchParams: () => ({}), useIsFocused: () => mockFocused }));
jest.mock('@/shell/fab/FabProvider', () => ({ useHideFab: (...a: unknown[]) => mockHideFab(...a) }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = jest.requireActual('react');
  const { View, Text: RNText } = jest.requireActual('react-native');
  return {
    TabRootScreen: (p: { title: string; eyebrow?: string; trailing?: React.ReactNode; overlay?: React.ReactNode; children?: React.ReactNode; scrollHandle?: { current: unknown } }) => {
      mockTabProps = p as unknown as Record<string, unknown>;
      if (p.scrollHandle) p.scrollHandle.current = { scrollTo: mockScrollTo };
      return R.createElement(View, null, R.createElement(RNText, { testID: 'tab-title' }, p.eyebrow), R.createElement(RNText, null, p.title), p.trailing, p.children, p.overlay);
    },
  };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUserId, householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-10-03' }),
}));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: mockStatus, inputs: mockInputs, refetch: jest.fn() }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: mockOnline }) }));
jest.mock('../../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: mockPicture, bars: mockBars }) }));
jest.mock('../useNewCheck', () => ({
  ...jest.requireActual('../useNewCheck'),
  useNewCheck: () => ({ pending: mockPending, start: mockStart }),
}));
jest.mock('../useHomeCards', () => ({
  useOpenCheckRows: () => ({ rows: mockOpenRows, checks: [] }),
  useMoneyRules: () => ({ dsrLine: null, doc: { v: 1, rules: [] }, save: jest.fn() }),
  useRuleCrossings: () => () => [],
}));
jest.mock('../../past/data/usePastDecisions', () => ({
  usePastDecisions: () => ({ decisions: [{ id: 'd1' }, { id: 'd2' }], linesByCheck: new Map(), ctx: {} }),
  deltaFor: (d: { id: string }) => (d.id === 'd1' ? { kind: 'monthly', estimate: 100, actual: 120, diff: 20 } : null),
}));
jest.mock('@/features/decide/hints/decideHints', () => ({ loadSetupDoneSeen: async () => true, markSetupDoneSeen: async () => undefined }));
jest.mock('../../setup/useSetupProgress', () => ({ useSetupProgress: () => mockProgress }));
jest.mock('../SomethingChanged', () => ({ SomethingChanged: () => null }));
jest.mock('../RuleEditSheet', () => ({ RuleEditSheet: () => null }));
jest.mock('../AddRuleSheet', () => ({ AddRuleSheet: () => null }));
jest.mock('../OpenCheckSheet', () => ({ OpenCheckSheet: () => null }));
jest.mock('../../sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('../../sheets/InstallmentPlanSheet', () => {
  const R = jest.requireActual('react');
  const { Pressable, Text: RNText } = jest.requireActual('react-native');
  return {
    InstallmentPlanSheet: (p: { visible: boolean; onUse: (pay: unknown) => void }) =>
      p.visible
        ? R.createElement(Pressable, { testID: 'mock-plan-use', onPress: () => p.onUse({ mode: 'plan', months: 12, aprBp: 0, firstDate: null }) }, R.createElement(RNText, null, 'plan'))
        : null,
  };
});
jest.mock('../../../quickParse', () => {
  const actual = jest.requireActual('../../../quickParse');
  return { ...actual, parseQuick: jest.fn(actual.parseQuick) };
});
jest.mock('../../sheets/QuickEstimateSheet', () => {
  const R = jest.requireActual('react');
  const { Pressable, Text: RNText } = jest.requireActual('react-native');
  return {
    QuickEstimateSheet: (p: { visible: boolean; kind: string; onAdd: (l: unknown) => void }) =>
      p.visible
        ? R.createElement(
            Pressable,
            { testID: 'mock-quick-add', onPress: () => p.onAdd({ id: 'q1', kind: 'expense', name: 'Laptop insurance', amount: 1200, everyMonths: 1, date: null }) },
            R.createElement(RNText, null, `quick:${p.kind}`),
          )
        : null,
  };
});

/** Pay 3,000 a month, rent 1,200 and everyday spending: three full months so the month picture has a usual and a low month. */
function engineFixture() {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: m === '2026-08' ? 200_000 : 100_000 }),
    ]),
  );
  const inputs = inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-10', amount: 120_000 }),
    ],
    balance: minorUnits(400_000),
    recordsAsOf: '2026-10-01',
  });
  const prepared = prepare(inputs);
  return { inputs, prepared };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockReset();
  mockPending = false;
  mockOnline = true;
  mockStatus = 'ready';
  mockOpenRows = [];
  mockUserId = 'u1';
  mockFocused = true;
  mockTabProps = {};
  mockProgress = { items: [], doneCount: 0, next: 'pay', allDone: false, loading: false, currency: 'USD', today: '2026-10-03' };
  const { inputs, prepared } = engineFixture();
  mockInputs = inputs;
  mockPicture = monthPicture(prepared);
  mockBars = pastMonthBars(prepared);
});

const type = async (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

describe('Check it (APP-09, D-02)', () => {
  it('is always on screen and disabled until there is an item and a price', async () => {
    await wrap(<DecideHome />);
    const pill = screen.getByLabelText('Check it');
    expect(pill.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('What it is comes first.')).toBeTruthy();
    await fireEvent.press(pill);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('is still there with setup open and the engine in error', async () => {
    mockStatus = 'error';
    await wrap(<DecideHome />);
    expect(screen.getByLabelText('Check it')).toBeTruthy();
    expect(screen.getByTestId('setup-banner-new')).toBeTruthy();
    expect(screen.getByTestId('answer-error')).toBeTruthy();
  });

  it('starts the check once an item and a price are there', async () => {
    await wrap(<DecideHome />);
    await type('What is it?', 'Laptop');
    await fireEvent.press(screen.getByText('Laptop $3,500'));
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0]![0]).toMatchObject({ text: 'Laptop', price: 350_000, when: 'today', payMode: 'once', purpose: null, quickLines: [] });
  });

  it('disables the button while the check is being created', async () => {
    mockPending = true;
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByText('Headphones $180'));
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
  });

  it('home words show the note and keep Check it disabled, with no check created', async () => {
    await wrap(<DecideHome />);
    await type('What is it?', 'a house in Leeds');
    expect(screen.getByTestId('check-home-note')).toBeTruthy();
    expect(screen.getByText('Home checks come later. Pick another kind for now.')).toBeTruthy();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('example chips fill the fields only', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByText('Used car $9,000'));
    expect(screen.getByLabelText('What is it?').props.value).toBe('Used car');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('06.1-47 (B-6): 20 quick keystrokes parse fewer than 20 times, and Check it gets the full live text', async () => {
    await wrap(<DecideHome />);
    const parseMock = quickParse.parseQuick as jest.Mock;
    parseMock.mockClear();
    const word = 'Noise cancelling hea'; // 20 characters
    expect(word).toHaveLength(20);
    await act(async () => {
      for (let i = 1; i <= word.length; i += 1) await fireEvent.changeText(screen.getByLabelText('What is it?'), word.slice(0, i));
    });
    expect(parseMock.mock.calls.length).toBeLessThan(20);
    // the preview settles on the last text, and the field itself shows it live
    expect(parseMock.mock.calls[parseMock.mock.calls.length - 1]![0]).toBe(word);
    expect(screen.getByLabelText('What is it?').props.value).toBe(word);
    await type('Price', '180');
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0]![0]).toMatchObject({ text: word });
  });

  it('shows Reads as chips for one field with a price after the words, and a tap applies them', async () => {
    await wrap(<DecideHome />);
    await type('What is it?', 'Laptop 3500');
    expect(screen.getByTestId('check-reads-as')).toBeTruthy();
    await fireEvent.press(screen.getByText('$3,500'));
    expect(screen.getByLabelText('What is it?').props.value).toBe('Laptop');
    expect(screen.queryByTestId('check-reads-as')).toBeNull();
  });

  it('When? is a radio group with Today, the next payday and Pick a date', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByTestId('when-today').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('when-payday')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('when-payday'));
    expect(screen.getByTestId('when-payday').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('when-date')).toBeTruthy();
  });

  it('06.1-56 (A-HOME-2, A-HOME-4): When? is one row of three chips with short dates, never a numeric date', async () => {
    await wrap(<DecideHome />);
    const row = screen.getByTestId('when-row');
    expect(row.props.style).toMatchObject({ flexDirection: 'row' });
    for (const id of ['when-today', 'when-payday', 'when-date']) expect(screen.getByTestId(id)).toBeTruthy();
    // 2026-10-03 is a Saturday: "Sat, Oct 3"; the payday reads month and day only
    expect(screen.getByTestId('when-today').props.accessibilityLabel).toBe('Today. Sat, Oct 3');
    const payday = String(screen.getByTestId('when-payday').props.accessibilityLabel);
    expect(payday).toMatch(/^[A-Z][a-z]{2} \d{1,2}\. Next payday$/);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/);
  });

  it('06.1-56 (UX-11, CB-1): keyboard taps pass through, and one press on Check it with the price focused starts the check', async () => {
    await wrap(<DecideHome />);
    expect(mockTabProps.keyboardShouldPersistTaps).toBe('handled');
    await type('What is it?', 'Headphones');
    const priceField = screen.getByLabelText('Price');
    await fireEvent(priceField, 'focus');
    await fireEvent.changeText(priceField, '180');
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('06.1-56 (A-HOME-3): hides the + Add button while the Decide tab is focused, and not when it is not', async () => {
    await wrap(<DecideHome />);
    expect(mockHideFab).toHaveBeenLastCalledWith('decide', true);
    mockFocused = false;
    mockHideFab.mockClear();
    await wrap(<DecideHome />);
    expect(mockHideFab).toHaveBeenLastCalledWith('decide', false);
  });

  it('06.1-56 (X-3, A-HOME-5): the title uses the display role; the price leads with the currency symbol and a short tax note', async () => {
    await wrap(<DecideHome />);
    expect(mockTabProps.titleRole).toBe('display');
    expect(screen.getByTestId('check-tax-note')).toHaveTextContent('Tax not included');
    expect(JSON.stringify(screen.toJSON())).toMatch(/"\$"/);
  });

  it('06.1-56 (DB-10, DS-21): an example fills the form, scrolls the card into view and keeps the in-flow header', async () => {
    await wrap(<DecideHome />);
    expect(mockTabProps.compactInFlow).toBe(true);
    await fireEvent(screen.getByTestId('check-card-slot'), 'layout', { nativeEvent: { layout: { x: 0, y: 200, width: 300, height: 400 } } });
    await fireEvent.press(screen.getByText('Used car $9,000'));
    expect(screen.getByLabelText('What is it?').props.value).toBe('Used car');
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo.mock.calls[0]![0]).toBe(192);
    expect(mockTabProps.compactInFlow).toBe(true);
    expect(screen.getByTestId('tab-title')).toBeTruthy();
  });
});

describe('06.1-56 (H-9): home starts fresh and routes the same way', () => {
  it('FQ3 / CC-1: after Check it opens a route the card is empty, and one more Check it makes no second create', async () => {
    mockStart.mockReturnValue('/decide/answer/new-id');
    await wrap(<DecideHome />);
    await type('What is it?', 'Headphones');
    await type('Price', '180');
    await fireEvent.press(screen.getByTestId('when-payday'));
    await fireEvent.press(screen.getByTestId('more-details-row'));
    await fireEvent.press(screen.getByText('Need'));
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('What is it?').props.value).toBe('');
    expect(screen.getByTestId('when-today').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByTestId('more-details-body')).toBeNull();
    expect(screen.getByText('How you pay, quick estimates · optional')).toBeTruthy();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    mockStart.mockReset();
  });

  it('a blocked or loading start keeps what was typed', async () => {
    mockStart.mockReturnValue('blocked');
    await wrap(<DecideHome />);
    await type('What is it?', 'Headphones');
    await type('Price', '180');
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(screen.getByLabelText('What is it?').props.value).toBe('Headphones');
    mockStart.mockReset();
  });

  it('CS-6: the collapsed More details row names the choices that are set', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByText('How you pay, quick estimates · optional')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('more-details-row'));
    await fireEvent.press(screen.getByTestId('pay-plan'));
    await fireEvent.press(screen.getByTestId('mock-plan-use'));
    await fireEvent.press(screen.getByText('Need'));
    await fireEvent.press(screen.getByTestId('quick-tile-expense'));
    await fireEvent.press(screen.getByTestId('mock-quick-add'));
    await fireEvent.press(screen.getByTestId('more-details-row'));
    expect(screen.getByText('Installments · Need · 1 quick estimate')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('more-details-row'));
    await fireEvent.press(screen.getByText('Want'));
    await fireEvent.press(screen.getByTestId('pay-once'));
    expect(screen.getByText('Want · 1 quick estimate')).toBeTruthy();
  });

  it('CN-6: Check it waits for the engine inputs and says the records are still loading', async () => {
    mockInputs = null;
    await wrap(<DecideHome />);
    await type('What is it?', 'Laptop');
    await type('Price', '1200');
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('Your records are still loading.');
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('More details (D02, D-12, D-21)', () => {
  it('expands in place with how you pay, Need or want, and quick estimates, and has no emergency question', async () => {
    await wrap(<DecideHome />);
    expect(screen.queryByTestId('more-details-body')).toBeNull();
    await fireEvent.press(screen.getByTestId('more-details-row'));
    expect(screen.getByTestId('more-details-row').props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText('How you pay')).toBeTruthy();
    expect(screen.getByText('Need or want?')).toBeTruthy();
    expect(screen.getByText('Quick estimates')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/emergency/i);
  });

  it('offers a quick-estimate tile for each QUICK_LINE_KINDS entry and no other', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByTestId('more-details-row'));
    for (const kind of QUICK_LINE_KINDS) expect(screen.getByTestId(`quick-tile-${kind}`)).toBeTruthy();
    expect(screen.getAllByTestId(/^quick-tile-/)).toHaveLength(QUICK_LINE_KINDS.length);
  });

  it('carries an added quick line, and Need or want, into the started check', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByTestId('more-details-row'));
    await fireEvent.press(screen.getByTestId('quick-tile-expense'));
    await fireEvent.press(screen.getByTestId('mock-quick-add'));
    expect(screen.getByTestId('quick-line-q1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Want'));
    await fireEvent.press(screen.getByText('Laptop $3,500'));
    await fireEvent.press(screen.getByLabelText('Check it'));
    const started = mockStart.mock.calls[0]![0];
    expect(started.purpose).toBe('want');
    expect(started.quickLines).toHaveLength(1);
    expect(started.quickLines[0]).toMatchObject({ id: 'q1', kind: 'expense' });
  });

  it('removing a quick line takes it off the check', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByTestId('more-details-row'));
    await fireEvent.press(screen.getByTestId('quick-tile-expense'));
    await fireEvent.press(screen.getByTestId('mock-quick-add'));
    await fireEvent.press(screen.getByTestId('quick-remove-q1'));
    expect(screen.queryByTestId('quick-line-q1')).toBeNull();
  });
});

describe('Your month (CO-D-57, UX-30, UX-29)', () => {
  it('leads with the month-picture figure, which is the home figure', async () => {
    const { prepared } = engineFixture();
    const home = Number(homeFigure(prepared));
    expect(Number(mockPicture!.monthEnd)).toBe(home);
    await wrap(<DecideHome />);
    const lead = screen.getByTestId('month-lead');
    const dollars = Math.round(Math.abs(home) / 100).toLocaleString('en-US');
    expect(lead.props.accessibilityLabel).toBe(`$${dollars} ${home < 0 ? 'short in' : 'left in'} October, after this month’s plans`);
  });

  it('shows Usual month and Low month, the Records row and the date of the records', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByText('Usual month')).toBeTruthy();
    await fireEvent.press(screen.getByText('Low month'));
    expect(screen.getByText('The lowest month in your records: what came in, less what went out.')).toBeTruthy();
    expect(screen.getByTestId('month-records')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('month-records'));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup/records');
  });

  it('steps back to an earlier month from the records', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByTestId('month-earlier'));
    expect(screen.getByTestId('month-lead').props.accessibilityLabel).toMatch(/September$/);
    expect(screen.queryByText('Usual month')).toBeNull();
  });

  it('a negative month grows down and says short in words', async () => {
    mockPicture = { ...mockPicture!, monthEnd: minorUnits(-12_000), usual: { comesIn: minorUnits(300_000), goesOut: minorUnits(312_000), left: minorUnits(-12_000) } };
    await wrap(<DecideHome />);
    expect(screen.getByTestId('month-lead').props.accessibilityLabel).toBe('$120 short in October, after this month’s plans');
    expect(screen.getByTestId('bar-down-SHORT')).toBeTruthy();
    expect(screen.getAllByText('SHORT').length).toBeGreaterThan(0);
  });
});

describe('the rest of the home', () => {
  it('shows the header, the Past decisions pill with its count, and the footer legal line', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByText('DECIDE')).toBeTruthy();
    expect(screen.getByText('Can I afford it?')).toBeTruthy();
    expect(screen.getByLabelText('Past decisions, 1 to look back on')).toBeTruthy();
    expect(screen.getByTestId('home-footer-legal')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('past-pill'));
    expect(mockPush).toHaveBeenCalledWith('/decide/past');
  });

  it('mounts the money rules card and omits Open checks when there are none', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByTestId('money-rules-card')).toBeTruthy();
    expect(screen.queryByText('Open checks')).toBeNull();
    await fireEvent.press(screen.getByTestId('money-rules-net'));
    expect(mockPush).toHaveBeenCalledWith('/decide/safety-net');
  });

  it('shows the offline card above the check card when offline', async () => {
    mockOnline = false;
    await wrap(<DecideHome />);
    expect(screen.getByTestId('answer-offline')).toBeTruthy();
  });

  it('has no Investment link (D-13)', async () => {
    await wrap(<DecideHome />);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\+ Investment/);
  });

  it('starting setup opens the first open item', async () => {
    await wrap(<DecideHome />);
    await fireEvent.press(screen.getByLabelText("Start setup"));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup/pay');
  });
});

describe('06.1-52 (C-18): Check it names what is missing', () => {
  it('no words: what it is; words, no price: a price; a price that did not read: says so; a 0 price: above zero', async () => {
    await wrap(<DecideHome />);
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('What it is comes first.');
    await type('What is it?', 'Laptop');
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('A price comes first.');
    await type('Price', 'abc');
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('That price didn’t read as an amount.');
    await type('Price', '0');
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('A price above zero is needed.');
    await type('Price', '$1,200');
    expect(screen.queryByTestId('check-it-hint')).toBeNull();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText('What it is and a price come first')).toBeNull();
  });

  it('a tap before the records load says they are still loading', async () => {
    mockStart.mockReturnValueOnce('loading');
    mockUserId = null;
    await wrap(<DecideHome />);
    await type('What is it?', 'Laptop');
    await type('Price', '1200');
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('check-it-hint')).toHaveTextContent('Your records are still loading.');
  });
});
