/**
 * Plan 05.2-22: text-fit for the shared income steps. A static guard (no line clamps, fixed text heights, absolute text
 * or negative margins in src/features/income) and a render matrix at 320 / 402 dp, text scale 1.0 / 2.0 using the R18
 * fit checks. Money in a sentence goes through the no-wrap helper, so a figure never breaks inside a digit group.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import en from '@/i18n/locales/en';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { IncomeProfileSteps, INCOME_STEPS, type IncomeStepKey } from '../IncomeProfileSteps';
import { ZERO_WIDTH_SPACE } from '@/features/decide/home/heroAmountText';
import type { SetupStepHandle } from '@/features/decide/setup/steps/types';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: jest.fn(() => null) }) }));
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: jest.fn() }),
  usePatchSeriesAttributes: () => ({ patch: jest.fn() }),
}));
jest.mock('@/data/mutations/dismissals', () => ({
  useAddDismissal: () => ({ dismiss: jest.fn(() => ({ id: 'd', stepId: 's' })) }),
  useRemoveDismissal: () => ({ restore: jest.fn(() => ({ stepId: 's' })) }),
}));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEditSeriesFrom: () => ({ editFrom: jest.fn() }) }));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({
    status: 'ready',
    evaluation: null,
    refetch: jest.fn(),
    inputs: {
      months: [1, 2, 3, 4, 5, 6].map((n) => ({
        month: `2026-0${n}`,
        full: true,
        mark: null,
        lines: [{ role: 'income', status: 'paid', countsAs: 'available', amount: n * 123_456_789 }],
      })),
    },
  }),
}));
let mockSeries: Record<string, unknown>[] = [];
let mockNotPay: { row: Record<string, unknown>; payer: string }[] = [];
jest.mock('../useIncomeContext', () => ({
  useIncomeContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    timeZone: 'UTC',
    today: '2026-10-15',
    settings: null,
    accounts: [{ id: 'a1', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null }],
    series: mockSeries,
    found: { payer: 'Acme Ltd', amount: 123_456_789_00, day: 25, currency: 'USD', key: 'acme' },
    notPay: mockNotPay,
  }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount(step: IncomeStepKey, scale: number) {
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={scale}>
          <IncomeProfileSteps ref={ref} step={step} mode="stepper" onReadyChange={() => undefined} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return ref;
}

describe('IncomeProfileSteps router', () => {
  it('renders each step and forwards the ref so save() reaches it', async () => {
    for (const step of INCOME_STEPS) {
      mockScale = 1;
      mockWidth = 402;
      const ref = await mount(step, 1);
      expect(typeof ref.current?.save).toBe('function');
      expect(ref.current!.save()).toEqual({ stepId: null });
      await cleanup();
    }
  });

  it('draws no navigation: no rail, no footer, no router calls', () => {
    const src = readdirSync(join(__dirname, '..'), { recursive: true }) as string[];
    const files = src.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts')).filter((f) => !f.includes('__tests__'));
    for (const f of files) {
      const text = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(text).not.toMatch(/useRouter|router\.(push|back)|expo-router/);
    }
  });
});

describe('income steps fit the R6 checks', () => {
  for (const m of MATRIX) {
    for (const step of INCOME_STEPS) {
      it(`${step} at ${matrixName(m)}`, async () => {
        mockWidth = m.width;
        mockScale = m.scale;
        await mount(step, m.scale);
        expectFits();
        await cleanup();
      });
    }
  }

  for (const m of MATRIX) {
    it(`method with the steady follow-up and other with two detail cards at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await mount('method', m.scale);
      await fireEvent.press(screen.getByRole('radio', { name: /^Pay myself a steady amount/ }));
      expect(screen.getByText(/Your last 6 months averaged/)).toBeTruthy();
      expectFits();
      await cleanup();
      await mount('other', m.scale);
      await fireEvent.press(screen.getByText('Dividends or investment income'));
      await fireEvent.press(screen.getByText('Other'));
      expectFits();
      await cleanup();
    });
  }

  for (const m of MATRIX) {
    it(`saved and paused income cards with the status link at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      const base = { currency: 'USD', freq: 'monthly', anchor_date: '2026-06-25', version: 1, deleted_at: null, counts_as: 'available' };
      mockSeries = [
        { ...base, id: 's1', name: 'Acme Ltd', amount: 123_456_789_00, income_kind: 'salary', end_date: null, end_reason: null },
        { ...base, id: 's2', name: 'Consulting for a very long named client', amount: 50000, income_kind: 'salary', end_date: '2026-09-30', end_reason: 'paused' },
        { ...base, id: 's3', name: 'Dividends', amount: 50000, income_kind: 'dividends', end_date: null, end_reason: null },
        { ...base, id: 's4', name: 'Rent received', amount: 90000, income_kind: 'rent', end_date: '2026-09-30', end_reason: 'paused' },
      ];
      try {
        await mount('pay', m.scale);
        expect(screen.getAllByText('Stopped or paused')).toHaveLength(2);
        expect(screen.getByText(/^Paused since/)).toBeTruthy();
        expectFits();
        await cleanup();
        await mount('other', m.scale);
        expect(screen.getAllByText('Stopped or paused')).toHaveLength(2);
        expectFits();
        await cleanup();
      } finally {
        mockSeries = [];
      }
    });
  }

  for (const m of MATRIX) {
    it(`Not my pay and a long not-pay line with Show again at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      const long = 'Refund - Online Store with a very long payer name that runs on'.slice(0, 60);
      mockNotPay = [{ row: { id: 'r1' }, payer: long }];
      try {
        await mount('pay', m.scale);
        expect(screen.getByRole('button', { name: 'Not my pay, Acme Ltd' })).toBeTruthy();
        expect(screen.getByRole('button', { name: `Show ${long} as pay again` })).toBeTruthy();
        expect(screen.getByText(`${long} isn’t counted as your pay.`)).toBeTruthy();
        expectFits();
        expectTargets('Not my pay, Acme Ltd', `Show ${long} as pay again`);
        await cleanup();
      } finally {
        mockNotPay = [];
      }
    });
  }

  it('the new pay-step copy has no advice wording', () => {
    const keys = [en.income.pay.notMine, en.income.pay.notMineA11y, en.income.pay.notMineLine, en.income.pay.showAgain, en.income.pay.showAgainA11y];
    for (const k of keys) expect(k).not.toMatch(/advice|recommend|you should/i);
  });

  it('the found-payer note keeps its amount on one run (no break inside a digit group)', async () => {
    mockWidth = 320;
    mockScale = 2;
    await mount('pay', 2);
    const note = screen.getByText(/We found Acme Ltd paying about/);
    const amount = /about (\S+) around/.exec(String(note.props.children))?.[1] ?? '';
    // any break opportunity is a zero-width space after a group separator, never a space inside the figure
    expect(amount.replace(new RegExp(ZERO_WIDTH_SPACE, 'g'), '')).toMatch(/^\S+$/);
    expect(amount.length).toBeGreaterThan(0);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('static text-fit guard', () => {
  const files = walk(join(__dirname, '..')).map((f) => ({ f, src: readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1') }));
  it('has no numberOfLines, no negative margins and no absolute text', () => {
    for (const { f, src } of files) {
      expect({ f, hit: /\bnumberOfLines\b/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /margin\w*:\s*-\d/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /position:\s*'absolute'/.test(src) }).toEqual({ f, hit: false });
    }
  });
  it('has no raw colours', () => {
    for (const { f, src } of files) expect({ f, hit: /#[0-9A-Fa-f]{3,8}\b/.test(src) }).toEqual({ f, hit: false });
  });
});
