// 06.2-05 (D-12..D-14, T-06.2-05-01): one status map; a badge pairs colour, shape and word, and reads in greyscale.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { i18n } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { stateColors } from '@/theme/tokens';
import { step } from '@/theme/layout';
import { ICONS } from '@/ui/icons/iconData';
import { MATRIX, expectFits, matrixName } from '@/test/textFitMatrix';
import { STATUS, type StatusKey } from '../statusMap';
import { StatusBadge } from '../StatusBadge';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
beforeEach(() => {
  mockWidth = 402;
});

const hidden = { includeHiddenElements: true };
const keys = Object.keys(STATUS) as StatusKey[];
const withTone = (tone: string) => keys.filter((k) => STATUS[k].tone === tone).sort();

function wrap(ui: React.ReactElement, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('STATUS map (D-12)', () => {
  it('has exactly the shared statuses', () => {
    expect([...keys].sort()).toEqual(
      [
        'paid', 'received', 'due', 'dueSoon', 'overdue', 'overCap', 'pending', 'onTrack', 'behind', 'reached', 'draft',
        'notYet', 'safetyNet', 'fits', 'tight', 'short', 'up', 'down', 'cleared',
      ].sort(),
    );
  });

  it('every entry has a known tone, a real icon and a word that resolves', () => {
    for (const k of keys) {
      const def = STATUS[k];
      expect(['fits', 'tight', 'short', 'notYet', 'net', 'neutral']).toContain(def.tone);
      expect(ICONS[def.icon]).toBeDefined();
      expect(i18n.exists(def.wordKey)).toBe(true);
    }
  });

  it('D-14: red only for over cap, overdue and short; amber only for due soon, behind and tight', () => {
    expect(withTone('short')).toEqual(['overCap', 'overdue', 'short']);
    expect(withTone('tight')).toEqual(['behind', 'dueSoon', 'tight']);
  });

  it('slate clock for due, pending and not yet; up and down are neutral arrows', () => {
    expect(withTone('notYet')).toEqual(['due', 'notYet', 'pending']);
    for (const k of ['due', 'pending', 'notYet'] as const) expect(STATUS[k].icon).toBe('stateDue');
    expect(STATUS.up).toMatchObject({ tone: 'neutral', icon: 'stateUp' });
    expect(STATUS.down).toMatchObject({ tone: 'neutral', icon: 'stateDown' });
    expect(STATUS.draft.icon).toBe('firstEntry');
  });

  it('reads distinctly in greyscale: no two entries share icon, tone and word', () => {
    const seen = new Set<string>();
    for (const k of keys) {
      const def = STATUS[k];
      const word = i18n.t(def.wordKey, { percent: 5, amount: '$1', date: 'May 1' });
      const sig = `${def.icon}|${def.tone}|${word}`;
      expect(seen.has(sig)).toBe(false);
      seen.add(sig);
    }
    // the words themselves are all different too
    const words = keys.map((k) => i18n.t(STATUS[k].wordKey, { percent: 5 }));
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('StatusBadge', () => {
  it('draws a 24-tall pill with a 16 icon, a hair gap and the word in the tone colour on its tint', async () => {
    await wrap(<StatusBadge status="overCap" />);
    const badge = screen.getByLabelText('Over cap');
    const s = StyleSheet.flatten(badge.props.style);
    expect(s).toMatchObject({ minHeight: 24, gap: step.hair, paddingHorizontal: step.tight, backgroundColor: stateColors.short.tint });
    expect(s).not.toHaveProperty('height');
    const glyph = screen.getByTestId('glyph-stateOverCap', hidden);
    expect(glyph.props).toMatchObject({ width: 16, height: 16 });
    const text = screen.getByText('Over cap', hidden);
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ color: stateColors.short.color });
    expect(StyleSheet.flatten(text.props.style)).not.toHaveProperty('height');
  });

  it('neutral uses fill1 and inkDim', async () => {
    await wrap(<StatusBadge status="draft" />);
    const badge = screen.getByLabelText('Draft');
    expect(StyleSheet.flatten(badge.props.style).backgroundColor).toBe(colors.fill1);
    expect(StyleSheet.flatten(screen.getByText('Draft', hidden).props.style).color).toBe(colors.inkDim);
  });

  it('is one accessible text element: the word is spoken and the icon is hidden', async () => {
    await wrap(<StatusBadge status="safetyNet" />);
    const badge = screen.getByLabelText('Safety net locked');
    expect(badge.props).toMatchObject({ accessible: true, accessibilityRole: 'text' });
    expect(screen.queryByTestId('glyph-stateSafetyNet')).toBeNull();
    expect(screen.getByTestId('glyph-stateSafetyNet', hidden).props.accessible).toBe(false);
  });

  it('takes a label and an accessibilityLabel override', async () => {
    await wrap(<StatusBadge status="overCap" label="$40 over cap" accessibilityLabel="Groceries, $40 over cap" />);
    expect(screen.getByLabelText('Groceries, $40 over cap')).toBeTruthy();
    expect(screen.getByText('$40 over cap', hidden)).toBeTruthy();
  });

  it('fills params for up and down', async () => {
    await wrap(<StatusBadge status="up" params={{ percent: 12 }} />);
    expect(screen.getByLabelText('up 12%')).toBeTruthy();
    expect(screen.getByTestId('glyph-stateUp', hidden)).toBeTruthy();
  });

  it.each(MATRIX)('fits with the longest word at %o', async (m) => {
    mockWidth = m.width;
    await wrap(<StatusBadge status="safetyNet" />, m.scale);
    expect(screen.getByLabelText('Safety net locked')).toBeTruthy();
    expectFits();
    expect(matrixName(m)).toMatch(/wide/);
  });
});
