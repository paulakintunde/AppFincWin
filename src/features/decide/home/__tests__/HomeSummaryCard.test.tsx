import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { THEME_CACHE_KEY } from '@/theme/themeCache';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { FONT_PAIRINGS, type FontPairingKey } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { HomeHero, heroAmountText } from '../HomeSummaryCard';

jest.setTimeout(30000);

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
