import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { radii } from '@/theme/layout';
import { ToastView } from '../ToastView';

jest.setTimeout(20000);

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function renderToast(tone?: 'default' | 'warning') {
  return render(
    <ThemeProvider>
      <ToastView message="Over cap" onDismiss={jest.fn()} dismissLabel="Dismiss" tone={tone} />
    </ThemeProvider>
  );
}

describe('ToastView tone', () => {
  it('keeps the ink background by default', async () => {
    const screen = await renderToast();
    const bg = StyleSheet.flatten(screen.getByText('Over cap').parent!.props.style).backgroundColor;
    expect(bg).toBe(colors.ink);
  });

  it('uses the 18px toast radius', async () => {
    const screen = await renderToast();
    const style = StyleSheet.flatten(screen.getByText('Over cap').parent!.props.style);
    expect(style.borderRadius).toBe(radii.toast);
    expect(radii.toast).toBe(18);
  });

  it('warning uses warn1 with surface text at >= 4.5:1', async () => {
    const screen = await renderToast('warning');
    const text = screen.getByText('Over cap');
    expect(StyleSheet.flatten(screen.getByText('Over cap').parent!.props.style).backgroundColor).toBe(colors.warn1);
    expect(StyleSheet.flatten(text.props.style).color).toBe(colors.surface);
    expect(contrast(colors.surface, colors.warn1)).toBeGreaterThanOrEqual(4.5);
  });
});
