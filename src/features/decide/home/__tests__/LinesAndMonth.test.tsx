import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow, DecideSettingsPatch } from '@/db/decideSettings';
import { minorUnits } from '@/engine/money';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY, loggedSource, month, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { LinesCard } from '../LinesCard';
import { DSR_LINE_RE, LimitEditorSheet } from '../LimitEditorSheet';
import { OpenChecksCard } from '../OpenChecksCard';
import { RoughFiguresSheet } from '../RoughFiguresSheet';
import { MonthDetailsBody } from '../YourMonthCard';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));

const mockUpdate = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockOnUpdate: ((patch: DecideSettingsPatch) => void) | null = null;
jest.mock('@/data/mutations/decideSettings', () => ({
  useUpdateDecideSettings: () => ({
    update: (patch: DecideSettingsPatch) => {
      mockUpdate(patch);
      mockOnUpdate?.(patch);
    },
  }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({ useAbandonCheck: () => ({ abandon: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 402;
  mockOnUpdate = null;
});

const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n / 100))}`;

function settingsRow(over: Partial<DecideSettingsRow> = {}): DecideSettingsRow {
  return {
    user_id: 'u1',
    currency: 'USD',
    rough_income: null,
    rough_spending: null,
    reserve: null,
    dsr_line: null,
    housing_line: null,
    unsecured_multiple: null,
    investing_floor: null,
    saving_floor: null,
    basis_override: null,
    version: 1,
    updated_at: '2026-10-15T00:00:00Z',
    ...over,
  };
}

const monthsOf = (rows: [string, number, number][]) => rows.map(([m, i, o]) => month(m, i, o));

function card(source: ReturnType<typeof loggedSource> | null, settings: DecideSettingsRow | null = null, onEditRough = jest.fn()) {
  return <MonthDetailsBody source={source} settings={settings} userId="u1" whole={whole} today={TODAY} onEditRough={onEditRough} dark />;
}

/** The sheet and its field share a name, so pick the editable one. */
function fieldOf(label: string) {
  const field = screen.getAllByLabelText(label).find((node) => node.props.editable !== undefined);
  if (!field) throw new Error(`No field labelled ${label}`);
  return field;
}

async function typeMoney(label: string, text: string) {
  const field = fieldOf(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

describe('MonthDetailsBody (dark, as on the home card before R17)', () => {
  it('shows the logged figures, the steadiness chip and the steady basis line', async () => {
    await wrap(card(loggedSource()));
    expect(screen.getByText('Steady')).toBeTruthy();
    expect(screen.getByLabelText('Money in, $5000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $3000')).toBeTruthy();
    expect(screen.getByLabelText('Debt payments, $200')).toBeTruthy();
    expect(screen.getByLabelText('Net free cash flow, $1800')).toBeTruthy(); // 5000 - 3000 - 200 debt minimum
    expect(screen.getByText('4 months of income within 0% of each other, so the check uses the average.')).toBeTruthy();
    expect(screen.getByLabelText('Worst · $5000')).toBeTruthy();
    expect(screen.getByLabelText('Average · $5000')).toBeTruthy();
  });

  it('shows a negative Left with the minus sign', async () => {
    const source = loggedSource({ months: monthsOf([['2026-06', 300_000, 500_000], ['2026-07', 300_000, 500_000], ['2026-08', 300_000, 500_000], ['2026-09', 300_000, 500_000]]) });
    await wrap(card(source));
    expect(screen.getByLabelText(/^Net free cash flow, short by \$/)).toBeTruthy();
  });

  it('says the range when income is not steady and writes the basis choice', async () => {
    const source = loggedSource({ months: monthsOf([['2026-06', 500_000, 300_000], ['2026-07', 900_000, 300_000], ['2026-08', 100_000, 300_000], ['2026-09', 700_000, 300_000]]) });
    await wrap(card(source));
    expect(screen.getByText(/4 months ranging \$1000 to \$9000\./)).toBeTruthy();
    expect(screen.getByLabelText('Worst · $1000').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Average · $5500'));
    expect(mockUpdate).toHaveBeenCalledWith({ basis_override: 'average' });
    mockUpdate.mockClear();
    await fireEvent.press(screen.getByLabelText('Worst · $1000')); // already selected
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('under three full months shows the fixed line and no basis control', async () => {
    const source = loggedSource({ months: monthsOf([['2026-08', 500_000, 300_000], ['2026-09', 500_000, 300_000]]) });
    await wrap(card(source));
    expect(screen.getByText('Fewer than 3 full months so far, so this uses your lowest month for money in and your highest for spending.')).toBeTruthy();
    expect(screen.getByText('Not enough history yet')).toBeTruthy();
    expect(screen.queryByLabelText('Judge on')).toBeNull();
  });

  it('a history with no money in says so', async () => {
    const source = loggedSource({ months: monthsOf([['2026-07', 0, 300_000], ['2026-08', 0, 300_000], ['2026-09', 0, 300_000]]) });
    await wrap(card(source));
    expect(screen.getByText('No money in is logged in these 3 months, so every check is judged on that.')).toBeTruthy();
    expect(screen.queryByText(/ranging/)).toBeNull();
    expect(screen.getByText('Volatile')).toBeTruthy();
  });

  it('the Activity pill switches to the Activity tab', async () => {
    await wrap(card(loggedSource()));
    await fireEvent.press(screen.getByLabelText('Activity'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
  });

  it('shows the rough figures with Edit before a full month exists', async () => {
    const onEdit = jest.fn();
    await wrap(card(roughSource(600_000, 400_000, 250_000), null, onEdit));
    expect(screen.getByLabelText('Money in, $4000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $2500')).toBeTruthy();
    expect(screen.getByLabelText('Net free cash flow, $1500')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Edit rough figures'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('switches from the rough figures to the logged months the moment a full month exists', async () => {
    const view = await wrap(card(roughSource()));
    expect(screen.getByLabelText('Edit rough figures')).toBeTruthy();
    await view.rerender(card(loggedSource()));
    expect(screen.queryByLabelText('Edit rough figures')).toBeNull();
    expect(screen.getByText('Steady')).toBeTruthy();
  });
});

describe('RoughFiguresSheet', () => {
  const sheet = (settings: DecideSettingsRow | null = null, onClose = jest.fn()) => (
    <RoughFiguresSheet visible userId="u1" currency="USD" settings={settings} onClose={onClose} />
  );

  it('saves both figures as integer minor units and stamps the currency', async () => {
    const onClose = jest.fn();
    await wrap(sheet(null, onClose));
    const save = () => screen.getByLabelText('Save figures');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await typeMoney('Money in each month', '4200');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await typeMoney('Money out each month', '2650.50');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());
    expect(mockUpdate).toHaveBeenCalledWith({ rough_income: 420_000, rough_spending: 265_050, currency: 'USD' });
    expect(mockUpdate.mock.calls[0]![0]).not.toHaveProperty('seeded');
    expect(onClose).toHaveBeenCalled();
  });

  it('starts from the stored figures and Cancel writes nothing', async () => {
    const onClose = jest.fn();
    await wrap(sheet(settingsRow({ rough_income: 400_000, rough_spending: 250_000 }), onClose));
    expect(fieldOf('Money in each month').props.value).toContain('4000');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('CR-B01: rough figures typed in a new currency clear the limits stored in the old one', async () => {
    await wrap(sheet(settingsRow({ currency: 'EUR', reserve: 500_000, saving_floor: 10_000 })));
    await typeMoney('Money in each month', '4200');
    await typeMoney('Money out each month', '2000');
    await fireEvent.press(screen.getByLabelText('Save figures'));
    expect(mockUpdate).toHaveBeenCalledWith({
      reserve: null,
      investing_floor: null,
      saving_floor: null,
      rough_income: 420_000,
      rough_spending: 200_000,
      currency: 'USD',
    });
  });

  it('IN-B08: no current income can be saved as zero; zero spending cannot', async () => {
    await wrap(sheet(null));
    const save = () => screen.getByLabelText('Save figures');
    await typeMoney('Money in each month', '0');
    await typeMoney('Money out each month', '0');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await typeMoney('Money out each month', '1800');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());
    expect(mockUpdate).toHaveBeenCalledWith({ rough_income: 0, rough_spending: 180_000, currency: 'USD' });
  });

  it('renders nothing while closed', async () => {
    await wrap(<RoughFiguresSheet visible={false} userId="u1" currency="USD" settings={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Rough figures')).toBeNull();
  });
});

/** D-78: the Lines fold is closed by default, so the editor tests open it first. */
async function wrapOpen(ui: React.ReactElement) {
  await wrap(ui);
  await fireEvent.press(screen.getByText('Lines you will not cross'));
}

describe('LinesCard', () => {
  const lines = (settings: DecideSettingsRow | null = null, source = loggedSource()) => (
    <LinesCard source={source} settings={settings} userId="u1" currency="USD" whole={whole} />
  );

  it('shows the engine defaults with a default tag on every blank line', async () => {
    await wrapOpen(lines());
    expect(screen.getByText('Lines you will not cross')).toBeTruthy();
    for (const name of ['Cash never below', 'Debt payments at most', 'Unsecured debt at most', 'Investing at least', 'Saving at least']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getAllByText('default')).toHaveLength(4);
    expect(screen.getByText('default · 3 months')).toBeTruthy();
    expect(screen.getByText('36%')).toBeTruthy();
    expect(screen.getByText('12 ×')).toBeTruthy();
  });

  it('shows the user value without a tag where a line is set', async () => {
    await wrapOpen(lines(settingsRow({ reserve: 250_000, dsr_line: '30', unsecured_multiple: 6 })));
    expect(screen.getByText('$2500')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('6 ×')).toBeTruthy();
    expect(screen.getAllByText('default')).toHaveLength(2);
    expect(screen.queryByText(/^default · /)).toBeNull();
  });

  it('saves a cash line as one column plus the currency', async () => {
    await wrapOpen(lines());
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.getByText(/You hold \$12000 across 1 accounts today\./)).toBeTruthy();
    await typeMoney('Cash never below', '3000');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ reserve: 300_000, currency: 'USD' });
  });

  it('saves a zero floor as zero (an integer, not blank)', async () => {
    await wrapOpen(lines());
    await fireEvent.press(screen.getByTestId('line-row-investing'));
    await typeMoney('Investing at least', '0');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ investing_floor: 0, currency: 'USD' });
  });

  it('Use the default blanks the line', async () => {
    await wrapOpen(lines(settingsRow({ saving_floor: 50_000 })));
    await fireEvent.press(screen.getByTestId('line-row-saving'));
    await fireEvent.press(screen.getByLabelText('Use the default'));
    expect(mockUpdate).toHaveBeenCalledWith({ saving_floor: null });
  });

  it('CR-B01: a non-money limit never restamps the currency of money stored in another one', async () => {
    await wrapOpen(lines(settingsRow({ currency: 'EUR', reserve: 500_000, investing_floor: 20_000 })));
    await fireEvent.press(screen.getByTestId('line-row-unsecured'));
    await fireEvent.changeText(fieldOf('Unsecured debt at most'), '8');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ unsecured_multiple: 8 });
  });

  it('CR-B01: a money limit typed in a new currency clears the money stored in the old one', async () => {
    await wrapOpen(lines(settingsRow({ currency: 'EUR', reserve: 500_000, investing_floor: 20_000, rough_income: 1, rough_spending: 1 })));
    await fireEvent.press(screen.getByTestId('line-row-saving'));
    await typeMoney('Saving at least', '100');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({
      reserve: null,
      investing_floor: null,
      saving_floor: 10_000,
      rough_income: null,
      rough_spending: null,
      currency: 'USD',
    });
  });

  it('saves the unsecured multiple as an integer', async () => {
    await wrapOpen(lines());
    await fireEvent.press(screen.getByTestId('line-row-unsecured'));
    await fireEvent.changeText(fieldOf('Unsecured debt at most'), '8');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ unsecured_multiple: 8 });
  });

  it('dsr line matches the stored grammar before queuing', async () => {
    expect(DSR_LINE_RE.test('36')).toBe(true);
    expect(DSR_LINE_RE.test('36.5')).toBe(true);
    expect(DSR_LINE_RE.test('36.12345')).toBe(false);
    expect(DSR_LINE_RE.test('1000')).toBe(false);
    await wrapOpen(lines());
    await fireEvent.press(screen.getByTestId('line-row-dsr'));
    const field = fieldOf('Debt payments at most');
    const save = () => screen.getByLabelText('Save limit');
    for (const refused of ['36.12345', '1000', '36.']) {
      await fireEvent.changeText(field, refused);
      // The typing grammar may drop a refused edit; either way the button is disabled and nothing is queued.
      expect(save().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(save());
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '36.5');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ dsr_line: '36.5' });
    expect(typeof mockUpdate.mock.calls[0]![0].dsr_line).toBe('string');
  });

  it('D-103 the housing limit validates 0 to 100 and writes housing_line', async () => {
    await wrap(
      <LimitEditorSheet limit="housing" userId="u1" currency="USD" settings={settingsRow()} source={loggedSource()} whole={whole} onClose={jest.fn()} />
    );
    const field = fieldOf('Housing costs at most');
    const save = () => screen.getByLabelText('Save limit');
    for (const refused of ['100.5', '101', '36.12345']) {
      await fireEvent.changeText(field, refused);
      expect(save().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(save());
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '100');
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.changeText(field, '28.5');
    await fireEvent.press(save());
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ housing_line: '28.5' });
  });

  it('D-103 Use the default clears housing_line', async () => {
    await wrap(
      <LimitEditorSheet limit="housing" userId="u1" currency="USD" settings={settingsRow({ housing_line: '30' })} source={loggedSource()} whole={whole} onClose={jest.fn()} />
    );
    await fireEvent.press(screen.getByLabelText('Use the default'));
    expect(mockUpdate).toHaveBeenCalledWith({ housing_line: null });
  });

  it('D-103 the Lines card still renders five rows', async () => {
    await wrapOpen(lines(settingsRow({ housing_line: '30' })));
    expect(screen.getAllByTestId(/^line-row-/)).toHaveLength(5);
    expect(screen.queryByTestId('line-row-housing')).toBeNull();
  });

  it('a limit save recomputes an open check in the same render cycle (shared cache)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const KEY = ['test-decide-settings'];
    const inputs = { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash' as const };
    const row = {
      id: 'a', household_id: 'h1', created_by: 'u1', kind: 'buy', name: 'Laptop', inputs: inputs as unknown as Record<string, unknown>,
      status: 'open', furthest_step: 1, last_seen_state: null, last_seen_basis: null, reopened_from: null, decided_at: null,
      verdict_at_decision: null, estimate_day_one: null, estimate_monthly: null, wait_monthly: null, ready_by: null, broke_line: false,
      cooling_off_at: null, estimate_monthly_payment: null, estimate_running: null, is_sample: false, deleted_at: null, version: 1,
      updated_by: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    } as DecideCheckRow;
    mockOnUpdate = (patch) => qc.setQueryData<DecideSettingsRow>(KEY, (old) => ({ ...(old as DecideSettingsRow), ...patch }) as DecideSettingsRow);

    function Harness() {
      const { data } = useQuery({ queryKey: KEY, queryFn: () => settingsRow(), initialData: settingsRow(), staleTime: Infinity });
      const s = data as DecideSettingsRow;
      const source = loggedSource({
        limits: {
          reserve: s.reserve === null ? null : minorUnits(s.reserve),
          dsrLine: null,
          housingLine: null,
          unsecuredIncomeMultiple: null,
          investingFloor: null,
          savingFloor: null,
          spareFloor: null,
        },
      });
      return (
        <>
          <OpenChecksCard source={source} checks={[row]} today={TODAY} whole={whole} currency="USD" />
          <LinesCard source={source} settings={s} userId="u1" currency="USD" whole={whole} />
        </>
      );
    }
    await wrap(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    );
    expect(screen.getByText('It fits')).toBeTruthy();
    await fireEvent.press(screen.getByText('Lines you will not cross'));
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    await typeMoney('Cash never below', '20000'); // above the $12000 held
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.getByText('$20000')).toBeTruthy();
  });
});

describe('Lines fold and Your month (05-71)', () => {
  const linesUi = (settings: DecideSettingsRow | null = null) => (
    <LinesCard source={loggedSource()} settings={settings} userId="u1" currency="USD" whole={whole} />
  );

  it('D-78 Lines is one fold row with the set-by-you preview', async () => {
    await wrap(linesUi());
    expect(screen.getByLabelText('Lines you will not cross, All at their defaults').props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByTestId('line-row-reserve')).toBeNull();
    await screen.unmount();
    await wrap(linesUi(settingsRow({ reserve: 250_000, dsr_line: '30' })));
    expect(screen.getByLabelText('Lines you will not cross, 2 of 5 set by you')).toBeTruthy();
  });

  it('D-78 opening the Lines fold shows five rows, each with its ⓘ', async () => {
    await wrap(linesUi());
    await fireEvent.press(screen.getByText('Lines you will not cross'));
    for (const key of ['reserve', 'dsr', 'unsecured', 'investing', 'saving']) {
      expect(screen.getByTestId(`line-row-${key}`)).toBeTruthy();
    }
    expect(screen.getByLabelText('About Cash never below')).toBeTruthy();
    expect(screen.getByLabelText('About Debt payments at most')).toBeTruthy();
    expect(screen.getByLabelText('About Unsecured debt at most')).toBeTruthy();
    expect(screen.getByLabelText('About Investing at least')).toBeTruthy();
    expect(screen.getByLabelText('About Saving at least')).toBeTruthy();
  });

  it('D-70 the limit editor title carries its line ⓘ', async () => {
    await wrap(linesUi());
    await fireEvent.press(screen.getByText('Lines you will not cross'));
    await fireEvent.press(screen.getByTestId('line-row-dsr'));
    // one in the row and one in the editor title
    expect(screen.getAllByLabelText('About Debt payments at most').length).toBe(2);
  });

  it('D-70 the basis control carries basisMonth', async () => {
    await wrap(card(loggedSource()));
    expect(screen.getByLabelText('About Average or worst month')).toBeTruthy();
  });

  it('D-76 Your month stacks below 360 wide', async () => {
    await wrap(card(loggedSource()));
    // R18.1: the breakdown rows wrap their label and value, so they stack on their own at any width
    expect(screen.getByLabelText('Money in, $5000').props.style).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(screen.queryAllByTestId('radio-dot', { includeHiddenElements: true }).length).toBe(0);
    await screen.unmount();
    mockWidth = 320;
    await wrap(card(loggedSource()));
    // the Worst / Average control becomes a radio list with a dot in each row
    expect(screen.getAllByTestId('radio-dot', { includeHiddenElements: true }).length).toBe(2);
    expect(screen.getByLabelText('Average · $5000').props.accessibilityState.checked).toBe(true);
  });

  it('D-76 Seg: a Worst / Average label past 16 characters stacks the control at 402 and 1.0x', async () => {
    const long = (n: number) => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const source = loggedSource({ months: monthsOf([['2026-06', 715_666, 300_000], ['2026-07', 715_666, 300_000], ['2026-08', 715_666, 300_000], ['2026-09', 715_666, 300_000]]) });
    await wrap(<MonthDetailsBody source={source} settings={null} userId="u1" whole={long} today={TODAY} onEditRough={jest.fn()} dark />);
    expect(screen.getByLabelText('Average · $7,156.66').props.accessibilityState.checked).toBe(true);
    expect(screen.getAllByTestId('radio-dot', { includeHiddenElements: true }).length).toBe(2);
  });

  it('D-76 Seg: short labels keep the side-by-side segments at 402 and 1.0x', async () => {
    await wrap(card(loggedSource()));
    expect(screen.queryAllByTestId('radio-dot', { includeHiddenElements: true }).length).toBe(0);
  });
});
