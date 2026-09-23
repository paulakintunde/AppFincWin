import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme, type ThemeContextValue } from '../ThemeProvider';
import { THEME_CACHE_KEY } from '../themeCache';
import { FONT_PAIRINGS } from '../fonts';

let mountCount = 0;

function Consumer({ themeRef }: { themeRef: React.MutableRefObject<ThemeContextValue | null> }) {
  const theme = useTheme();

  useEffect(() => {
    themeRef.current = theme;
  });

  useEffect(() => {
    mountCount += 1;
  }, []);

  return (
    <>
      <Text testID="ready">{String(theme.ready)}</Text>
      <Text testID="accent">{theme.colors.accent}</Text>
      <Text testID="display">{theme.fonts.display}</Text>
    </>
  );
}

async function setup() {
  const themeRef: React.MutableRefObject<ThemeContextValue | null> = { current: null };
  const utils = await render(
    <ThemeProvider>
      <Consumer themeRef={themeRef} />
    </ThemeProvider>
  );
  await waitFor(() => expect(utils.getByTestId('ready').props.children).toBe('true'));
  return { themeRef, ...utils };
}

beforeEach(async () => {
  mountCount = 0;
  await AsyncStorage.clear();
});

describe('ThemeProvider live switching', () => {
  it('defaults to the green accent before any switch', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('accent').props.children).toBe('#1B4D3E');
  });

  it('re-renders the same mounted consumer live when the accent changes, with no remount', async () => {
    const { getByTestId, themeRef } = await setup();
    expect(mountCount).toBe(1);

    await act(() => {
      themeRef.current?.setAccent('navy');
    });

    expect(getByTestId('accent').props.children).toBe('#1F3A5F');
    expect(mountCount).toBe(1);
  });

  it('changes fonts.display to the pairing display face when the pairing changes', async () => {
    const { getByTestId, themeRef } = await setup();

    await act(() => {
      themeRef.current?.setPairing('grotesk');
    });

    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.grotesk.display);
    expect(mountCount).toBe(1);
  });

  it('persists the choice to AsyncStorage under fincwin:theme', async () => {
    const { themeRef } = await setup();

    await act(() => {
      themeRef.current?.setAccent('rust');
      themeRef.current?.setPairing('modern');
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(THEME_CACHE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? '{}')).toEqual({ accent: 'rust', pairing: 'modern' });
    });
  });
});

describe('ThemeProvider hydration (D-14)', () => {
  it('hydrates from the cache so the first ready render already shows the saved theme', async () => {
    await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'rust', pairing: 'modern' }));

    const { getByTestId } = await setup();

    expect(getByTestId('accent').props.children).toBe('#7A4B2A');
    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.modern.display);
  });

  it('falls back to green/bold on corrupt cache JSON', async () => {
    await AsyncStorage.setItem(THEME_CACHE_KEY, '{not valid json');

    const { getByTestId } = await setup();

    expect(getByTestId('accent').props.children).toBe('#1B4D3E');
    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.bold.display);
  });

  it('falls back to green/bold on unknown enum values', async () => {
    await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ accent: 'teal', pairing: 'comic-sans' }));

    const { getByTestId } = await setup();

    expect(getByTestId('accent').props.children).toBe('#1B4D3E');
    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.bold.display);
  });
});

describe('ThemeProvider.applyRemote', () => {
  it('updates the theme and the cache when applied remotely (used by 00-18 for the profile row)', async () => {
    const { getByTestId, themeRef } = await setup();

    await act(() => {
      themeRef.current?.applyRemote('slate', 'neutral');
    });

    expect(getByTestId('accent').props.children).toBe('#3E5C6B');
    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.neutral.display);

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(THEME_CACHE_KEY);
      expect(JSON.parse(raw ?? '{}')).toEqual({ accent: 'slate', pairing: 'neutral' });
    });
  });
});

describe('ThemeProvider.reset', () => {
  it('returns to the default accent and pairing', async () => {
    const { getByTestId, themeRef } = await setup();

    await act(() => {
      themeRef.current?.setAccent('navy');
    });
    expect(getByTestId('accent').props.children).toBe('#1F3A5F');

    await act(() => {
      themeRef.current?.reset();
    });
    expect(getByTestId('accent').props.children).toBe('#1B4D3E');
    expect(getByTestId('display').props.children).toBe(FONT_PAIRINGS.bold.display);
  });
});

describe('useTheme', () => {
  it('throws when used outside a ThemeProvider', async () => {
    function Bare() {
      useTheme();
      return null;
    }
    // Swallow the expected React error-boundary console noise for this one assertion.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Bare />)).rejects.toThrow('useTheme must be used within a ThemeProvider');
    spy.mockRestore();
  });
});
