import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { THEME_CACHE_KEY } from '@/theme/themeCache';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { FONT_PAIRINGS, type FontPairingKey } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import en from '@/i18n/locales/en';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { TODAY, loggedSource, month, noneSource, roughSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { homeCardModel } from '../homeCardModel';
import { HomeHero, HomeSummaryCard, heroAmountText, type HomeSummaryCardProps } from '../HomeSummaryCard';
import { heroOneLineMax } from '../heroAmountText';

jest.setTimeout(30000);

let mockDims = { width: 320, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockDims.width, height: 874, scale: 2, fontScale: mockDims.fontScale }),
}));
const mockNavigate = jest.fn();
const mockOpenNewCheck = jest.fn();
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() } }));
jest.mock('../checkHref', () => ({ openNewCheck: (...a: unknown[]) => mockOpenNewCheck(...a) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({ useOtherChecks: () => ({ otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

const months = (n: number, income = 500_000, spending = 300_000) =>
  ['2026-06', '2026-07', '2026-08', '2026-09'].slice(4 - n).map((m) => month(m, income, spending));

const roughSettings = {
  user_id: 'u1',
  currency: 'USD',
  rough_income: 400_000,
  rough_spending: 250_000,
  reserve: null,
  dsr_line: null,
  housing_line: null,
  unsecured_multiple: null,
  investing_floor: null,
  saving_floor: null,
  basis_override: null,
  version: 1,
  updated_at: '2026-10-15T00:00:00Z',
} as DecideSettingsRow;

const METRICS = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderHero(ui: React.ReactElement, pairing: FontPairingKey, scale: number) {
  // seed the theme cache so the provider hydrates this pairing (it reads AsyncStorage once on mount)
  await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'green', pairing }));
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  await waitFor(() => {
    const family = StyleSheet.flatten(screen.getByText(/\d/).props.style).fontFamily;
    expect(family).toBe(FONT_PAIRINGS[pairing].display);
  });
  return view;
}

describe('heroAmountText', () => {
  it('D-97 up to 10 characters is one line, unchanged', () => {
    expect(heroAmountText('$1,234,567')).toEqual({ text: '$1,234,567', fitOneLine: true });
    expect(heroAmountText('$420')).toEqual({ text: '$420', fitOneLine: true });
  });

  it('D-97 long amounts break only at group separators', () => {
    const { text, fitOneLine } = heroAmountText('$12,345,678');
    expect(fitOneLine).toBe(false);
    expect(text).toBe('$12,\u200B345,\u200B678');
    // removing the zero-width spaces gives back the formatted amount
    expect(text.replace(/\u200B/g, '')).toBe('$12,345,678');
    // never a break between two digits of one group
    expect(text).not.toMatch(/\d\u200B\d/);
  });

  it('D-97 the one-line limit follows the window width and text scale, never below 10', () => {
    expect(heroOneLineMax(320, 2.0)).toBe(10);
    expect(heroOneLineMax(320, 1.0)).toBeGreaterThanOrEqual(10);
    // Pixel 9 at 411 wide and 1.15x: "CA$5,876.23" stays whole on one line
    const pixel = heroOneLineMax(411, 1.15);
    expect(pixel).toBeGreaterThanOrEqual(12);
    expect(heroAmountText('CA$5,876.23', pixel)).toEqual({ text: 'CA$5,876.23', fitOneLine: true });
    // past the 1.3x cap the limit stops shrinking
    expect(heroOneLineMax(402, 3.0)).toBe(heroOneLineMax(402, 1.3));
    // a long amount on a narrow, large-text screen still breaks at separators
    expect(heroAmountText('$12,345,678.90', heroOneLineMax(320, 2.0)).fitOneLine).toBe(false);
  });

  it('D-97 long amounts break at other locales\' separators but not at a decimal point', () => {
    expect(heroAmountText('1.234.567,00 €').text).toBe('1.\u200B234.\u200B567,00 €');
    expect(heroAmountText('$1,234,567.89').text).toBe('$1,\u200B234,\u200B567.89');
    expect(heroAmountText('1\u202F234\u202F567 €').text).toBe('1\u202F\u200B234\u202F\u200B567 €');
  });
});

describe('HomeHero', () => {
  it('D-97 the hero amount stays whole on line 1 at 320 and 2.0x for each font pairing', async () => {
    for (const pairing of Object.keys(FONT_PAIRINGS) as FontPairingKey[]) {
      const { unmount } = await renderHero(<HomeHero amount="$1,234,567" word="free" short={false} />, pairing, 2);
      const amount = screen.getByText('$1,234,567');
      const style = StyleSheet.flatten(amount.props.style);
      expect(amount.props.numberOfLines).toBe(1);
      expect(amount.props.adjustsFontSizeToFit).toBe(true);
      expect(amount.props.minimumFontScale).toBe(0.75);
      expect(style.fontFamily).toBe(FONT_PAIRINGS[pairing].display);
      // 42 at the capped 1.3x tier (rule: display figures cap at 1.3x)
      expect(style.fontSize).toBeCloseTo(54.6, 1);
      // the words are a separate Text with no line limit, so they wrap under the amount
      const word = screen.getByText('free');
      expect(word).not.toBe(amount);
      expect(word.props.numberOfLines).toBeUndefined();
      expect(word.props.adjustsFontSizeToFit).toBeFalsy();
      // the row wraps, baseline-aligned
      const row = amount.parent!;
      const rowStyle = StyleSheet.flatten(row.props.style);
      expect(rowStyle).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' });
      unmount();
    }
  });

  it('D-97 an amount past the one-line limit drops the one-line rule and splits only at separators', async () => {
    await renderHero(<HomeHero amount="$12,345,678,901,234,567" word="free" short={false} />, 'bold', 1);
    const amount = screen.getByText('$12,\u200B345,\u200B678,\u200B901,\u200B234,\u200B567');
    expect(amount.props.numberOfLines).toBeUndefined();
  });

  it('D-97 short shows the absolute amount in the danger tint', async () => {
    await renderHero(<HomeHero amount="$420" word="overspent" short />, 'bold', 1);
    const amount = screen.getByText('$420');
    expect(StyleSheet.flatten(amount.props.style).color).toBe(colors.dangerTint2);
    // the words keep the surface colour: no other alarm styling
    expect(StyleSheet.flatten(screen.getByText('overspent').props.style).color).toBe(colors.surface);
    expect(screen.queryByText(/−|-/)).toBeNull();
  });
});

const SUB_END = 'after spending, debts and everything set aside';
const SUB = {
  worst: `in your worst month, ${SUB_END}`,
  average: `in your average month, ${SUB_END}`,
  tightest: `from your tightest figures, ${SUB_END}`,
  figures: `from the figures you gave, ${SUB_END}`,
  switched: `now from your logged months, ${SUB_END}`,
};

describe('HomeSummaryCard', () => {
  const props = (over: Partial<HomeSummaryCardProps> = {}): HomeSummaryCardProps => ({
    source: loggedSource({ months: months(4), basisOverride: 'worst' }),
    settings: null,
    status: 'ready',
    homeBasisSeen: true,
    currency: 'USD',
    today: TODAY,
    onOpenDetails: jest.fn(),
    onAddRough: jest.fn(),
    onRetry: jest.fn(),
    onRunFull: jest.fn(),
    ...over,
  });
  const usd = (minor: number) => `$${(minor / 100).toLocaleString('en-US')}`;

  async function renderCard(over: Partial<HomeSummaryCardProps> = {}) {
    await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'green', pairing: 'bold' }));
    const p = props(over);
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={1}>
            <HomeSummaryCard {...p} />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    return p;
  }
  const figures = (over: Partial<HomeSummaryCardProps> = {}) => {
    const p = props(over);
    const model = homeCardModel(p.source, p.settings, { status: p.status, homeBasisSeen: p.homeBasisSeen, today: TODAY });
    if (model.state !== 'figure') throw new Error('fixture is not a figure');
    return model;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDims = { width: 402, fontScale: 1 };
  });

  it('D-106 the card hero reads free with the amount absolute', async () => {
    const m = figures();
    await renderCard();
    expect(screen.getByText('Net free cash flow', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(usd(m.amount))).toBeTruthy();
    expect(screen.getByText('free')).toBeTruthy();
    expect(screen.queryByText('left')).toBeNull();
    expect(screen.getByText(SUB.worst)).toBeTruthy();
    expect(screen.getByText(`In ${usd(m.inAmount)} · Out ${usd(m.outAmount)}`)).toBeTruthy();
    expect(screen.getByLabelText('Quick check, something and a price')).toBeTruthy();
    expect(screen.getByText('Check it')).toBeTruthy();
    expect(screen.getByText('Full check ›')).toBeTruthy();
    expect(screen.getByText('Details ›')).toBeTruthy();
    // the dark card: ink, no shadow
    const style = StyleSheet.flatten(screen.getByTestId('home-summary-card').props.style);
    expect(style.backgroundColor).toBe(colors.ink);
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.elevation).toBeUndefined();
  });

  it('D-106 the quick-result summary line says free while a result is open', async () => {
    const m = figures();
    await renderCard();
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    await screen.findByText('Run the full check');
    expect(screen.getByText(`${usd(m.amount)} free · In ${usd(m.inAmount)} · Out ${usd(m.outAmount)}`)).toBeTruthy();
    expect(screen.queryByText(SUB.worst)).toBeNull();
    expect(screen.queryByText('free')).toBeNull();
    // Full check is hidden while a result shows: "Run the full check" carries the fields then
    expect(screen.queryByText('Full check ›')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Clear the quick check'));
    await screen.findByText('Full check ›');
    expect(screen.getByText(SUB.worst)).toBeTruthy();
  });

  it('D-106 an overspent hero is dangerTint2 with the word overspent and no minus', async () => {
    const source = loggedSource({ months: months(4, 300_000, 360_000), basisOverride: 'worst' });
    const m = figures({ source });
    expect(m.short).toBe(true);
    await renderCard({ source });
    expect(screen.getByText(usd(m.amount))).toBeTruthy();
    expect(screen.getByText('overspent')).toBeTruthy();
    expect(screen.queryByText(/−/)).toBeNull();
    expect(screen.getByLabelText(new RegExp(`overspent ${SUB.worst}`))).toBeTruthy();
  });

  it('D-97 the unavailable state shows no figure and one action', async () => {
    const p = await renderCard({ source: unconvertedSource() });
    expect(screen.getByText('Not worked out yet')).toBeTruthy();
    expect(screen.getByText('Lines in EUR are waiting for an exchange rate.')).toBeTruthy();
    expect(screen.queryByText('free')).toBeNull();
    expect(screen.queryByText(SUB.worst)).toBeNull();
    expect(screen.queryByText(/^\$/)).toBeNull();
    await fireEvent.press(screen.getByText('See lines waiting for a rate'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    expect(p.onAddRough).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    expect(await screen.findByText('Missing terms')).toBeTruthy();
  });

  it('D-95 a quick check on first run returns Missing terms', async () => {
    const p = await renderCard({ source: noneSource() });
    expect(screen.getByText('Net free cash flow', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Not worked out yet')).toBeTruthy();
    expect(screen.getByText('There is no full month or rough figure to work from.')).toBeTruthy();
    expect(screen.queryByText('Details ›')).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
    expect(p.onAddRough).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    // the quick form's own no-figures result (nothing to judge against); a missing rate gives Missing terms (next test)
    expect(await screen.findByText('There is nothing to judge this against yet.')).toBeTruthy();
  });

  it('R17.7 the card offers the summary group first', async () => {
    const p = await renderCard();
    // formatMoneyA11y speaks the amount by currency name, so the label is matched by its shape
    const group = screen.getByLabelText(/^Net free cash flow: .* free in your worst month, after spending, debts and everything set aside\. In .*, out .*\.$/);
    expect(group.props.accessibilityHint).toBe('Opens month details');
    await fireEvent.press(group);
    expect(p.onOpenDetails).toHaveBeenCalledTimes(1);
    // reading order: summary group, Details, the field, Full check
    const tree = JSON.stringify(screen.toJSON());
    const at = (needle: string) => tree.indexOf(needle);
    expect(at('Opens month details')).toBeGreaterThan(-1);
    expect(at('Opens month details')).toBeLessThan(at('"Month details"'));
    expect(at('"Month details"')).toBeLessThan(at('Quick check'));
    expect(at('Quick check')).toBeLessThan(at('"Full check"'));
    await fireEvent.press(screen.getByLabelText('Month details'));
    expect(p.onOpenDetails).toHaveBeenCalledTimes(2);
  });

  it('D-95 Full check starts a purchase check', async () => {
    await renderCard();
    await fireEvent.press(screen.getByLabelText('Full check'));
    expect(mockOpenNewCheck).toHaveBeenCalledWith('buy');
  });

  it('D-97 the tightest sub-line carries the info button', async () => {
    await renderCard({ source: loggedSource({ months: months(2) }) });
    expect(screen.getByText(SUB.tightest)).toBeTruthy();
    expect(screen.getByLabelText('About Your tightest figures')).toBeTruthy();
    // the eyebrow keeps its own, different, info button
    expect(screen.getByLabelText('About Net free cash flow')).toBeTruthy();
  });

  it('D-100 the eyebrow is constant and the basis sits in the sub-line', async () => {
    const cases: [string, Partial<HomeSummaryCardProps>][] = [
      [SUB.worst, {}],
      [SUB.average, { source: loggedSource({ months: months(4), basisOverride: 'average' }) }],
      [SUB.tightest, { source: loggedSource({ months: months(2) }) }],
      [SUB.figures, { source: roughSource() }],
      [SUB.switched, { homeBasisSeen: false, settings: roughSettings }],
    ];
    for (const [sub, over] of cases) {
      await renderCard(over);
      expect(screen.getByText('Net free cash flow', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText(sub)).toBeTruthy();
      expect(screen.queryByText(/^Your (worst|average|tightest) month$|^Your figures$/, { includeHiddenElements: true })).toBeNull();
      screen.unmount();
    }
  });

  it('D-100 every sub-line ends after spending, debts and everything set aside', () => {
    for (const sub of Object.values(SUB)) expect(sub.endsWith(SUB_END)).toBe(true);
    const hero = en.decide.home.hero;
    for (const key of ['subWorst', 'subAverage', 'subTightest', 'subFigures', 'subSwitched'] as const) {
      expect(hero[key].endsWith(SUB_END)).toBe(true);
    }
  });

  it('D-100 the summary group reads net free cash flow, the basis and in/out', async () => {
    const m = figures();
    await renderCard();
    // the sub-line wraps at words: no line limit
    expect(screen.getByText(SUB.worst).props.numberOfLines).toBeUndefined();
    const group = screen.getByLabelText(/^Net free cash flow: /);
    expect(group.props.accessibilityLabel).toContain(`free ${SUB.worst}. In `);
    expect(group.props.accessibilityLabel).toMatch(/, out .*\.$/);
    expect(m.inAmount - m.outAmount).toBe(m.short ? -m.amount : m.amount);
    // the eyebrow Text stays out of the accessibility tree: the group carries it
    const eyebrow = screen.getByText('Net free cash flow', { includeHiddenElements: true });
    expect(eyebrow.props.accessibilityElementsHidden).toBe(true);
    expect(eyebrow.props.importantForAccessibility).toBe('no');
  });

  it('D-106 the card screen-reader line says free / overspent', async () => {
    const source = loggedSource({ months: months(4, 300_000, 360_000), basisOverride: 'worst' });
    await renderCard({ source });
    expect(screen.getByLabelText(new RegExp(`^Net free cash flow: .* overspent ${SUB.worst}\\. In `))).toBeTruthy();
  });

  it('D-100 the eyebrow row at 320 and 2.0x has no overlap and 44 targets', async () => {
    mockDims = { width: 320, fontScale: 2 };
    await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'green', pairing: 'bold' }));
    const p = props();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={2}>
            <HomeSummaryCard {...p} />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const label = screen.getByText('Net free cash flow', { includeHiddenElements: true });
    // whole at word breaks: no line limit and no shrink, so it wraps between words and never mid-word
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.adjustsFontSizeToFit).toBeFalsy();
    expect(StyleSheet.flatten(label.props.style).textTransform).toBe('uppercase');
    // the info button is the next flex sibling of the label (rule I)
    const infoRow = label.parent!.parent!;
    expect(StyleSheet.flatten(infoRow.props.style)).toMatchObject({ flexDirection: 'row' });
    // the row wraps, so Details drops under the label and the info button rather than overlapping
    const left = infoRow.parent!;
    expect(StyleSheet.flatten(left.props.style)).toMatchObject({ flexShrink: 1 });
    expect(StyleSheet.flatten(left.parent!.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' });
    // 44 x 44 targets: Details by its box, the info button by its 16 glyph and 14 slop
    const details = StyleSheet.flatten(screen.getByLabelText('Month details').props.style);
    expect(details.minHeight).toBeGreaterThanOrEqual(44);
    expect(details.minWidth).toBeGreaterThanOrEqual(44);
    const info = screen.getByLabelText('About Net free cash flow');
    const infoStyle = StyleSheet.flatten(info.props.style);
    expect(infoStyle.width + 2 * info.props.hitSlop).toBeGreaterThanOrEqual(44);
    expect(infoStyle.height + 2 * info.props.hitSlop).toBeGreaterThanOrEqual(44);
    expect(infoStyle.position).toBeUndefined();
  });

  it('D-97 loading is a busy skeleton with no figure', async () => {
    await renderCard({ status: 'loading', source: null });
    expect(screen.getByLabelText('Loading your figures').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.queryByText('free')).toBeNull();
  });

  it('D-97 a failed load shows the dark error with Try again', async () => {
    const p = await renderCard({ status: 'error', source: null });
    expect(screen.getByText('Your figures didn’t load')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Full check ›')).toBeNull();
  });
});

describe('HomeSummaryCard Judge-on (D-107)', () => {
  const base = (over: Partial<HomeSummaryCardProps> = {}): HomeSummaryCardProps => ({
    source: loggedSource({ months: months(4), basisOverride: 'month' }),
    settings: null,
    status: 'ready',
    homeBasisSeen: true,
    judgeOn: 'month',
    onChooseJudgeOn: jest.fn(),
    currency: 'USD',
    today: TODAY,
    onOpenDetails: jest.fn(),
    onAddRough: jest.fn(),
    onRetry: jest.fn(),
    onRunFull: jest.fn(),
    ...over,
  });
  const fallbackSource = () => ({
    ...loggedSource({ months: months(4), basisOverride: 'worst' }),
    monthFallback: { currencies: ['EUR', 'GBP'] },
  });
  const WAITING = 'This month is waiting for a EUR, GBP rate';

  async function renderIt(over: Partial<HomeSummaryCardProps> = {}, scale = 1) {
    await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'green', pairing: 'bold' }));
    const p = base(over);
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={scale}>
            <HomeSummaryCard {...p} />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    return p;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockDims = { width: 402, fontScale: 1 };
  });

  it('D-107 the card top row shows This month with a dropdown arrow', async () => {
    await renderIt();
    expect(screen.getByText('This month ▾')).toBeTruthy();
    expect(screen.getByLabelText('Judged on This month. Opens the choices.').props.accessibilityRole).toBe('button');
  });

  it('D-107 the dropdown opens the three choices with the current one checked', async () => {
    await renderIt({ judgeOn: 'average' });
    await fireEvent.press(screen.getByText('Average month ▾'));
    expect(await screen.findByText('Judge on')).toBeTruthy();
    expect(screen.getByLabelText('This month').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText('Worst month').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText('Average month').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('D-107 choosing Worst calls choose and closes', async () => {
    const p = await renderIt();
    await fireEvent.press(screen.getByText('This month ▾'));
    await fireEvent.press(await screen.findByLabelText('Worst month'));
    expect(p.onChooseJudgeOn).toHaveBeenCalledWith('worst');
    await waitFor(() => expect(screen.queryByText('Judge on')).toBeNull());
  });

  it('D-107 the button reads This month under a rate fallback while the sub-line names Worst', async () => {
    await renderIt({ source: fallbackSource() });
    expect(screen.getByText('This month ▾')).toBeTruthy();
    expect(screen.getByText(SUB.worst)).toBeTruthy();
  });

  it('D-107 the waiting-for-a-rate line shows under the sub-line and hides with a quick result', async () => {
    await renderIt({ source: fallbackSource() });
    expect(screen.getByText(WAITING)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    await screen.findByText('Run the full check');
    // the hero block (and so the card's own line) is replaced; the quick result carries the note itself
    expect(screen.getAllByText(WAITING)).toHaveLength(1);
  });

  it('D-107 under 3 full months the button is a plain This month label', async () => {
    await renderIt({ source: loggedSource({ months: months(2) }) });
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.queryByText('This month ▾')).toBeNull();
    expect(screen.queryByLabelText(/Opens the choices/)).toBeNull();
  });

  it('D-107 nothing shows until the choice has been read', async () => {
    await renderIt({ judgeOn: null });
    expect(screen.getByLabelText('Loading your figures')).toBeTruthy();
    expect(screen.queryByText(/This month/)).toBeNull();
  });

  it('D-107 the button and sheet rows are 44 high with radio roles', async () => {
    await renderIt();
    const pill = StyleSheet.flatten(screen.getByLabelText('Judged on This month. Opens the choices.').props.style);
    expect(pill.minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(screen.getByText('This month ▾'));
    for (const name of ['This month', 'Worst month', 'Average month']) {
      const row = await screen.findByLabelText(name);
      expect(row.props.accessibilityRole).toBe('radio');
      expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('D-107 the sheet names the missing rate under a fallback', async () => {
    await renderIt({ source: fallbackSource() });
    await fireEvent.press(screen.getByText('This month ▾'));
    expect(await screen.findByText('This month is waiting for a EUR, GBP rate, so it shows the worst month.')).toBeTruthy();
  });

  it('D-107 the top row wraps at 320 wide and 2.0x without hiding Details', async () => {
    mockDims = { width: 320, fontScale: 2 };
    await renderIt({}, 2);
    const details = screen.getByLabelText('Month details');
    expect(StyleSheet.flatten(details.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const row = screen.getByText('Net free cash flow', { includeHiddenElements: true }).parent!.parent!.parent!.parent!;
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(screen.getByText('This month ▾')).toBeTruthy();
    expect(screen.getByText('Details ›')).toBeTruthy();
  });

  it('D-107 TalkBack reading order: summary, judge-on button, Details, field', async () => {
    await renderIt();
    const tree = JSON.stringify(screen.toJSON());
    const at = (needle: string) => tree.indexOf(needle);
    expect(at('Opens month details')).toBeGreaterThan(-1);
    expect(at('Opens month details')).toBeLessThan(at('Opens the choices'));
    expect(at('Opens the choices')).toBeLessThan(at('"Month details"'));
    expect(at('"Month details"')).toBeLessThan(at('Quick check'));
  });
});

