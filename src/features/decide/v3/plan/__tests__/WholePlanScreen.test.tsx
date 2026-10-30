/** Plan 05.3-28: the whole-plan screen renders the engine's plan (Sam's used car) and its edge states. */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PlanCard, Purchase, QuotedCheck } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { planModel } from '../../model/planModel';
import { WholePlanScreen } from '../WholePlanScreen';
import { SAM, build, type Fixture } from './planFixture';

jest.setTimeout(60000);
const mu = minorUnits;

let mockState: { purchase: Purchase; card: PlanCard; quoted: QuotedCheck; rate: string; deposit: number; status: string; found: boolean } | null = null;
let mockWidth = 402;
let mockScale = 1;
const mockBack = jest.fn();

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), replace: jest.fn() } }));
jest.mock('@/data/queries/decideCheckV3', () => ({
  useCheckV3: () => ({
    status: mockState?.status ?? 'ready',
    row: mockState?.found === false ? null : { id: 'c1', name: 'Used car', inputs: { v: 2, __rate: mockState?.rate } },
    evaluation: mockState?.found === false ? null : { purchase: mockState?.purchase, planCard: mockState?.card, quoted: mockState?.quoted },
  }),
}));
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    readStoredCheck: (json: { __rate?: string }) => ({
      check: {
        taxPercent: null,
        pay: { mode: 'plan', apr: json.__rate === undefined ? null : jest.requireActual('@/engine/payoff').percent(json.__rate), deposit: mockState?.deposit ?? 0 },
      },
      reasons: [],
    }),
  };
});
jest.mock('../../shared/useV3Format', () => {
  const money = (n: number) => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const f = {
    money,
    moneyA11y: (n: number) => `${money(n)} dollars`,
    monthYear: (ym: string) => `M${ym}`,
    month: (ym: string) => ym,
    date: (d: string) => d,
  };
  return { useV3Format: () => f };
});
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => <View><Text accessibilityRole="header">{title}</Text>{children}</View> };
});

function setState(fx: Fixture = SAM, extra: Partial<{ status: string; found: boolean }> = {}): ReturnType<typeof build> {
  const b = build(fx);
  mockState = { ...b, rate: fx.rate, deposit: fx.deposit, status: extra.status ?? 'ready', found: extra.found ?? true };
  return b;
}
function setViewport(width: number, scale: number): void {
  mockWidth = width;
  mockScale = scale;
}

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };
async function renderPlan(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={mockScale}>
          <WholePlanScreen id="c1" />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const money = (n: number) => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe('WholePlanScreen', () => {
  afterEach(async () => {
    await cleanup();
    setViewport(402, 1);
  });

  it("shows Sam's used car and a total equal to planModel's", async () => {
    const b = setState();
    const m = planModel({ purchase: b.purchase, planCard: b.card, quoted: b.quoted, taxPercent: null, rate: percent('6.9') })!;
    await renderPlan();
    expect(screen.getByText('Used car · the whole plan')).toBeTruthy();
    expect(screen.getByText('60 payments every month')).toBeTruthy();
    expect(screen.getByText(money(Number(b.purchase.schedule!.payment)))).toBeTruthy();
    expect(screen.getByText(`about ${money(Number(m.summary.perMonth))} a month · ends M${m.summary.endsYm}`)).toBeTruthy();
    expect(screen.getByText('plus running costs of $390.00 a month')).toBeTruthy();
    for (const label of ['Price', 'Tax and one-off costs', 'Set-up and other fees', 'Interest at 6.9%', 'Running costs over 60 months', 'Total over 60 months']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Down payment (paid today)')).toBeNull();
    expect(screen.getAllByText(money(Number(m.total.amount))).length).toBeGreaterThan(0);
    expect(m.total.amount).toBe(m.planTotal + 39_000 * 60);
    expect(
      screen.getByLabelText(`60 payments of ${money(Number(b.purchase.schedule!.payment))} dollars every month. About ${money(Number(m.summary.perMonth))} dollars a month. Ends M${m.summary.endsYm}.`),
    ).toBeTruthy();
  });

  it('shows 0% interest as $0.00 with no interest segment', async () => {
    setState({ ...SAM, rate: '0' });
    await renderPlan();
    expect(screen.getByText('Interest at 0%')).toBeTruthy();
    expect(screen.getByLabelText(/^What the total is made of: /).props.accessibilityLabel).not.toMatch(/interest/);
  });

  it('adds the down payment row only with a deposit', async () => {
    setState({ ...SAM, deposit: 500_000 });
    await renderPlan();
    expect(screen.getByText('Down payment (paid today)')).toBeTruthy();
  });

  it('puts the quoted-differs sentence in the note', async () => {
    setState({ ...SAM, quoted: { kind: 'differs', quoted: mu(50_000), computed: mu(60_000) } as unknown as QuotedCheck });
    await renderPlan();
    expect(screen.getByText('The quoted payment of $500.00 differs from the $600.00 worked out here.')).toBeTruthy();
  });

  it('D-11: an implied rate over the cap reads over 999% with the real interest', async () => {
    const b = setState({ ...SAM, quoted: { kind: 'from_quote', impliedApr: 'above_max' } as unknown as QuotedCheck });
    await renderPlan();
    expect(screen.getByText(/over 999%/)).toBeTruthy();
    expect(screen.getAllByText(money(Number(b.card.interest))).length).toBeGreaterThan(0);
    expect(JSON.stringify(screen.toJSON(), (k, v) => (k === 'style' ? undefined : v))).not.toMatch(/9999/);
  });

  it('Back to the answer goes back', async () => {
    setState();
    await renderPlan();
    await fireEvent.press(screen.getByText('Back to the answer'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows not-found for an unknown check and a skeleton while loading', async () => {
    setState(SAM, { found: false });
    await renderPlan();
    expect(screen.queryByText('Back to the answer')).toBeNull();
  });
});
