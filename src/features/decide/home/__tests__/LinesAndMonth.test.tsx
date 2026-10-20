import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow, DecideSettingsPatch } from '@/db/decideSettings';
import { minorUnits } from '@/engine/money';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY, loggedSource, month, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { LinesCard } from '../LinesCard';
import { DSR_LINE_RE } from '../LimitEditorSheet';
import { OpenChecksCard } from '../OpenChecksCard';
import { RoughFiguresSheet } from '../RoughFiguresSheet';
import { YourMonthCard } from '../YourMonthCard';

jest.setTimeout(30000);

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
  return <YourMonthCard source={source} settings={settings} userId="u1" whole={whole} onEditRough={onEditRough} />;
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

describe('YourMonthCard', () => {
  it('shows the logged figures, the steadiness chip and the steady basis line', async () => {
    await wrap(card(loggedSource()));
    expect(screen.getByText('Your month')).toBeTruthy();
    expect(screen.getByText('Steady')).toBeTruthy();
    expect(screen.getByLabelText('Comes in, $5000')).toBeTruthy();
    expect(screen.getByLabelText('Goes out, $3000')).toBeTruthy();
    expect(screen.getByLabelText('Left, $1800')).toBeTruthy(); // 5000 - 3000 - 200 debt minimum
    expect(screen.getByText('4 months of income within 0% of each other. The average is safe to plan on.')).toBeTruthy();
    expect(screen.getByLabelText('Worst · $5000')).toBeTruthy();
    expect(screen.getByLabelText('Average · $5000')).toBeTruthy();
  });

  it('shows a negative Left with the minus sign', async () => {
    const source = loggedSource({ months: monthsOf([['2026-06', 300_000, 500_000], ['2026-07', 300_000, 500_000], ['2026-08', 300_000, 500_000], ['2026-09', 300_000, 500_000]]) });
    await wrap(card(source));
    expect(screen.getByLabelText(/^Left, -\$/)).toBeTruthy();
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
    expect(screen.getByText('From the figures you gave')).toBeTruthy();
    expect(screen.getByLabelText('Comes in, $4000')).toBeTruthy();
    expect(screen.getByLabelText('Goes out, $2500')).toBeTruthy();
    expect(screen.getByLabelText('Left, $1500')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Edit rough figures'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with both ways in when there is nothing to judge against', async () => {
    const onEdit = jest.fn();
    await wrap(card(noneSource(), null, onEdit));
    expect(screen.getByText('Nothing to judge against yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add rough figures'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Import a statement'));
    expect(mockPush).toHaveBeenCalledWith('/import');
  });

  it('switches from the rough figures to the logged months the moment a full month exists', async () => {
    const view = await wrap(card(roughSource()));
    expect(screen.getByText('From the figures you gave')).toBeTruthy();
    await view.rerender(card(loggedSource()));
    expect(screen.queryByText('From the figures you gave')).toBeNull();
    expect(screen.queryByLabelText('Edit rough figures')).toBeNull();
    expect(screen.getByText('Steady')).toBeTruthy();
  });

  it('renders nothing while the figures have not loaded', async () => {
    await wrap(card(null));
    expect(screen.queryByTestId('your-month-card')).toBeNull();
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

  it('renders nothing while closed', async () => {
    await wrap(<RoughFiguresSheet visible={false} userId="u1" currency="USD" settings={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Rough figures')).toBeNull();
  });
});

describe('LinesCard', () => {
  const lines = (settings: DecideSettingsRow | null = null, source = loggedSource()) => (
    <LinesCard source={source} settings={settings} userId="u1" currency="USD" whole={whole} />
  );

  it('shows the engine defaults with a default tag on every blank line', async () => {
    await wrap(lines());
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
    await wrap(lines(settingsRow({ reserve: 250_000, dsr_line: '30', unsecured_multiple: 6 })));
    expect(screen.getByText('$2500')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('6 ×')).toBeTruthy();
    expect(screen.getAllByText('default')).toHaveLength(2);
    expect(screen.queryByText(/^default · /)).toBeNull();
  });

  it('saves a cash line as one column plus the currency', async () => {
    await wrap(lines());
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.getByText(/You hold \$12000 across 1 accounts today\./)).toBeTruthy();
    await typeMoney('Cash never below', '3000');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ reserve: 300_000, currency: 'USD' });
  });

  it('saves a zero floor as zero (an integer, not blank)', async () => {
    await wrap(lines());
    await fireEvent.press(screen.getByTestId('line-row-investing'));
    await typeMoney('Investing at least', '0');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ investing_floor: 0, currency: 'USD' });
  });

  it('Use the default blanks the line', async () => {
    await wrap(lines(settingsRow({ saving_floor: 50_000 })));
    await fireEvent.press(screen.getByTestId('line-row-saving'));
    await fireEvent.press(screen.getByLabelText('Use the default'));
    expect(mockUpdate).toHaveBeenCalledWith({ saving_floor: null, currency: 'USD' });
  });

  it('saves the unsecured multiple as an integer', async () => {
    await wrap(lines());
    await fireEvent.press(screen.getByTestId('line-row-unsecured'));
    await fireEvent.changeText(fieldOf('Unsecured debt at most'), '8');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockUpdate).toHaveBeenCalledWith({ unsecured_multiple: 8, currency: 'USD' });
  });

  it('dsr line matches the stored grammar before queuing', async () => {
    expect(DSR_LINE_RE.test('36')).toBe(true);
    expect(DSR_LINE_RE.test('36.5')).toBe(true);
    expect(DSR_LINE_RE.test('36.12345')).toBe(false);
    expect(DSR_LINE_RE.test('1000')).toBe(false);
    await wrap(lines());
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
    expect(mockUpdate).toHaveBeenCalledWith({ dsr_line: '36.5', currency: 'USD' });
    expect(typeof mockUpdate.mock.calls[0]![0].dsr_line).toBe('string');
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
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    await typeMoney('Cash never below', '20000'); // above the $12000 held
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.getByText('$20000')).toBeTruthy();
  });
});
