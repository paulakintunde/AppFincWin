import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SetupRail } from '../SetupRail';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => (mockReduced ? 0 : ms), easing: undefined }),
}));

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;
const fills = () => [1, 2, 3, 4, 5].filter((n) => screen.queryByTestId(`rail-fill-${n}`, { includeHiddenElements: true }) !== null);
const fill = (n: number) => screen.getByTestId(`rail-fill-${n}`, { includeHiddenElements: true });

describe('SetupRail (05.2-50 F-15)', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  it('fills up to the current section', async () => {
    await render(wrap(<SetupRail current="regular" />));
    expect(fills()).toEqual([1, 2]);
  });

  it('fills all five on the Summary', async () => {
    await render(wrap(<SetupRail current={null} complete />));
    expect(fills()).toEqual([1, 2, 3, 4, 5]);
  });

  it('fills nothing on Welcome', async () => {
    await render(wrap(<SetupRail current={null} />));
    expect(fills()).toEqual([]);
  });

  it('animated fills carry entering; reduced motion and animated={false} do not', async () => {
    const { rerender } = await render(wrap(<SetupRail current="income" />));
    expect(fill(1).props.entering).toBeDefined();
    mockReduced = true;
    await rerender(wrap(<SetupRail current="income" />));
    expect(fill(1).props.entering).toBeUndefined();
    mockReduced = false;
    await rerender(wrap(<SetupRail current="income" animated={false} />));
    expect(fill(1).props.entering).toBeUndefined();
  });

  it('stays hidden from assistive tech and can be hidden outright', async () => {
    const { rerender } = await render(wrap(<SetupRail current="income" />));
    expect(screen.getByTestId('setup-rail', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    await rerender(wrap(<SetupRail current="income" hidden />));
    expect(screen.queryByTestId('setup-rail', { includeHiddenElements: true })).toBeNull();
  });
});
