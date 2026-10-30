/** 05.3-51 (F3): amounts in the worked-out lines never split from their sign or inside the number. */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { minorUnits } from '@/engine/money';
import { SixMonthBars, unbreakableAmount } from '../SixMonthBars';

jest.setTimeout(60000);

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/theme/FontScaleProvider', () => {
  const actual = jest.requireActual('@/theme/FontScaleProvider');
  return { ...actual, useFontScale: () => mockScale };
});

/** Like the shipped formatter: a zero-width space after each group separator once the amount is long. */
const zwspMoney = (minor: number): string => {
  const text = `$${(Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return text.replace(/,/g, ',​');
};
const NAMES: Record<string, string> = { '2026-08': 'August', '2026-09': 'September', '2026-10': 'October' };
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({
    money: (m: number) => zwspMoney(m),
    moneyA11y: (m: number) => `${(Math.abs(m) / 100).toFixed(2)} dollars`,
    month: (ym: string) => NAMES[ym] ?? ym,
  }),
}));

afterEach(() => {
  cleanup();
  mockScale = 1;
});

const mu = minorUnits;
const six = [
  { month: '2026-08', left: mu(120000), state: 'half' as const },
  { month: '2026-09', left: mu(-572840), state: 'normal' as const },
  { month: '2026-10', left: mu(15022828609), state: 'normal' as const },
];

/** Every Text string on screen that holds a "$" amount. */
function amountTexts(): string[] {
  return screen
    .getAllByText(/\$/, { includeHiddenElements: true })
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

function expectWhole(text: string): void {
  expect(text).not.toMatch(/[​‌]/);
  // no plain space or break chance between the sign and the figure, or inside the figure
  expect(text).not.toMatch(/−[ $]|− /);
  for (const m of text.match(/−?⁠?\$[\d,. ]+/g) ?? []) expect(m).not.toMatch(/ /);
}

describe('unbreakableAmount', () => {
  it('strips break hints, joins the minus and keeps the visible characters', () => {
    expect(unbreakableAmount(-486509, zwspMoney)).toBe('−⁠$4,865.09');
    expect(unbreakableAmount(15022828609, zwspMoney)).toBe('$150,228,286.09');
    expect(unbreakableAmount(150000, () => '1 500 €')).toBe('1 500 €');
  });
});

describe('SixMonthBars amount lines (F3)', () => {
  it('typical, largest and column figures stay whole at 1.0x', async () => {
    await wrap(<SixMonthBars six={six} typical={mu(-486509)} largest={{ month: '2026-10', amount: mu(15022828609) } as never} />);
    expect(screen.getByText('Typical month: the middle of these, −⁠$4,865.09.')).toBeTruthy();
    expect(screen.getByText('October’s $150,228,286.09 doesn’t move the middle.')).toBeTruthy();
    expect(screen.getByText('August is half-logged, so it’s left out.')).toBeTruthy();
    const texts = amountTexts();
    expect(texts.length).toBeGreaterThan(3);
    texts.forEach(expectWhole);
  });

  it('the per-month list at 2.0x keeps "September: −$5,728.40" whole', async () => {
    mockScale = 2;
    await wrap(<SixMonthBars six={six} typical={mu(-486509)} largest={null} />, 2);
    expect(screen.getByText('September: −⁠$5,728.40, normal')).toBeTruthy();
    expect(screen.getByText('October: $150,228,286.09, normal')).toBeTruthy();
    amountTexts().forEach(expectWhole);
  });

  it('the spoken group label reads plain words', async () => {
    await wrap(<SixMonthBars six={six} typical={null} largest={null} />);
    expect(screen.getByLabelText(/September: −5728\.40 dollars, normal/)).toBeTruthy();
  });
});
