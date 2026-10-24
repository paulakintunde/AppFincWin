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
import { TODAY, loggedSource, month, noneSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { homeCardModel } from '../homeCardModel';
import { HomeHero, HomeSummaryCard, heroAmountText, type HomeSummaryCardProps } from '../HomeSummaryCard';

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

  it('D-97 long amounts break at other locales\' separators but not at a decimal point', () => {
    expect(heroAmountText('1.234.567,00 €').text).toBe('1.\u200B234.\u200B567,00 €');
    expect(heroAmountText('$1,234,567.89').text).toBe('$1,\u200B234,\u200B567.89');
    expect(heroAmountText('1\u202F234\u202F567 €').text).toBe('1\u202F\u200B234\u202F\u200B567 €');
  });
});

describe('HomeHero', () => {
  it('D-97 the hero amount stays whole on line 1 at 320 and 2.0x for each font pairing', async () => {
    for (const pairing of Object.keys(FONT_PAIRINGS) as FontPairingKey[]) {
      const { unmount } = await renderHero(<HomeHero amount="$1,234,567" word="left" short={false} />, pairing, 2);
      const amount = screen.getByText('$1,234,567');
      const style = StyleSheet.flatten(amount.props.style);
      expect(amount.props.numberOfLines).toBe(1);
      expect(amount.props.adjustsFontSizeToFit).toBe(true);
      expect(amount.props.minimumFontScale).toBe(0.75);
      expect(style.fontFamily).toBe(FONT_PAIRINGS[pairing].display);
      // 42 at the capped 1.3x tier (rule: display figures cap at 1.3x)
      expect(style.fontSize).toBeCloseTo(54.6, 1);
      // the words are a separate Text with no line limit, so they wrap under the amount
      const word = screen.getByText('left');
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

  it('D-97 an amount past 10 characters drops the one-line rule and splits only at separators', async () => {
    await renderHero(<HomeHero amount="$12,345,678" word="left" short={false} />, 'bold', 1);
    const amount = screen.getByText('$12,\u200B345,\u200B678');
    expect(amount.props.numberOfLines).toBeUndefined();
  });

  it('D-97 short shows the absolute amount in the danger tint', async () => {
    await renderHero(<HomeHero amount="$420" word="short" short />, 'bold', 1);
    const amount = screen.getByText('$420');
    expect(StyleSheet.flatten(amount.props.style).color).toBe(colors.dangerTint2);
    // the words keep the surface colour: no other alarm styling
    expect(StyleSheet.flatten(screen.getByText('short').props.style).color).toBe(colors.surface);
    expect(screen.queryByText(/−|-/)).toBeNull();
  });
});

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
    const model = homeCardModel(p.source, p.settings, { status: p.status, homeBasisSeen: p.homeBasisSeen });
    if (model.state !== 'figure') throw new Error('fixture is not a figure');
    return model;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDims = { width: 402, fontScale: 1 };
  });

  it('D-95 the card reads label, hero, In and Out, then the quick check', async () => {
    const m = figures();
    await renderCard();
    expect(screen.getByText('Your worst month', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(usd(m.amount))).toBeTruthy();
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('after spending, debts and saving')).toBeTruthy();
    expect(screen.getByText(`In ${usd(m.inAmount)} · Out ${usd(m.outAmount)}`)).toBeTruthy();
    expect(screen.getByLabelText('Quick check')).toBeTruthy();
    expect(screen.getByText('Check it')).toBeTruthy();
    expect(screen.getByText('Full check ›')).toBeTruthy();
    expect(screen.getByText('Details ›')).toBeTruthy();
    // the dark card: ink, no shadow
    const style = StyleSheet.flatten(screen.getByTestId('home-summary-card').props.style);
    expect(style.backgroundColor).toBe(colors.ink);
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.elevation).toBeUndefined();
  });

  it('D-97 the hero shrinks while a result is open', async () => {
    const m = figures();
    await renderCard();
    await fireEvent.changeText(screen.getByLabelText('Quick check'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    await screen.findByText('Run the full check');
    expect(screen.getByText(`${usd(m.amount)} left · In ${usd(m.inAmount)} · Out ${usd(m.outAmount)}`)).toBeTruthy();
    expect(screen.queryByText('after spending, debts and saving')).toBeNull();
    expect(screen.queryByText('left')).toBeNull();
    // Full check is hidden while a result shows: "Run the full check" carries the fields then
    expect(screen.queryByText('Full check ›')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Clear the quick check'));
    await screen.findByText('Full check ›');
    expect(screen.getByText('after spending, debts and saving')).toBeTruthy();
  });

  it('D-97 the short month says short in words and shows the absolute amount', async () => {
    const source = loggedSource({ months: months(4, 300_000, 360_000), basisOverride: 'worst' });
    const m = figures({ source });
    expect(m.short).toBe(true);
    await renderCard({ source });
    expect(screen.getByText(usd(m.amount))).toBeTruthy();
    expect(screen.getByText('short')).toBeTruthy();
    expect(screen.getByLabelText(/short after spending, debts and saving/)).toBeTruthy();
  });

  it('D-97 the unavailable state shows no figure and one action', async () => {
    const p = await renderCard({ source: unconvertedSource() });
    expect(screen.getByText('Not worked out yet')).toBeTruthy();
    expect(screen.getByText('Lines in EUR are waiting for an exchange rate.')).toBeTruthy();
    expect(screen.queryByText('left')).toBeNull();
    expect(screen.queryByText('after spending, debts and saving')).toBeNull();
    expect(screen.queryByText(/^\$/)).toBeNull();
    await fireEvent.press(screen.getByText('See lines waiting for a rate'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    expect(p.onAddRough).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Quick check'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    expect(await screen.findByText('Missing terms')).toBeTruthy();
  });

  it('D-95 a quick check on first run returns Missing terms', async () => {
    const p = await renderCard({ source: noneSource() });
    expect(screen.getByText('Your figures', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Not worked out yet')).toBeTruthy();
    expect(screen.getByText('There is no full month or rough figure to work from.')).toBeTruthy();
    expect(screen.queryByText('Details ›')).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
    expect(p.onAddRough).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Quick check'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    // the quick form's own no-figures result (nothing to judge against); a missing rate gives Missing terms (next test)
    expect(await screen.findByText('There is nothing to judge this against yet.')).toBeTruthy();
  });

  it('R17.7 the card offers the summary group first', async () => {
    const p = await renderCard();
    // formatMoneyA11y speaks the amount by currency name, so the label is matched by its shape
    const group = screen.getByLabelText(/^Your worst month: .* left after spending, debts and saving\. In .*, out .*\.$/);
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

  it('D-97 the tightest label carries the info button', async () => {
    await renderCard({ source: loggedSource({ months: months(2) }) });
    expect(screen.getByText('Your tightest figures', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('About Your tightest figures')).toBeTruthy();
  });

  it('D-97 loading is a busy skeleton with no figure', async () => {
    await renderCard({ status: 'loading', source: null });
    expect(screen.getByLabelText('Loading your figures').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.queryByText('left')).toBeNull();
  });

  it('D-97 a failed load shows the dark error with Try again', async () => {
    const p = await renderCard({ status: 'error', source: null });
    expect(screen.getByText('Your figures didn’t load')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Full check ›')).toBeNull();
  });
});
