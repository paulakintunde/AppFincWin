import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
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

  it('rises in inside a toast-rise wrapper with the specced padding and gap', async () => {
    const screen = await renderToast();
    expect(screen.getByTestId('toast-rise')).toBeTruthy();
    const style = StyleSheet.flatten(screen.getByText('Over cap').parent!.props.style);
    expect(style.paddingVertical).toBe(13);
    expect(style.paddingHorizontal).toBe(18);
    expect(style.gap).toBe(14);
  });

  it('Undo reaches 44px through hitSlop, not its own box, and the controls stay separate buttons', async () => {
    const screen = await render(
      <ThemeProvider>
        <ToastView message="Gone" actionLabel="Undo" onAction={jest.fn()} onDismiss={jest.fn()} dismissLabel="Dismiss" />
      </ThemeProvider>
    );
    const undo = screen.getByRole('button', { name: 'Undo' });
    const flat = StyleSheet.flatten(undo.props.style) ?? {};
    expect(flat.minWidth).toBeUndefined();
    expect(flat.minHeight).toBeUndefined();
    expect(undo.props.hitSlop).toEqual({ top: 12, bottom: 12, left: 8, right: 8 });
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    const msg = screen.getByText('Gone');
    expect(msg.props.accessibilityRole).toBe('alert');
    expect(msg.props.accessibilityLiveRegion).toBe('polite');
  });

  it('DB-12: Dismiss is a 48 x 48 dp target that keeps the 12 dp glyph and the toast size', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <ToastView message="Gone" actionLabel="Undo" onAction={jest.fn()} onDismiss={onDismiss} dismissLabel="Dismiss" />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button', { name: 'Dismiss' });
    const s = StyleSheet.flatten(btn.props.style);
    const slop = (btn.props.hitSlop ?? {}) as { top?: number; bottom?: number; left?: number; right?: number };
    const w = (s.width as number) + (slop.left ?? 0) + (slop.right ?? 0);
    const h = (s.height as number) + (slop.top ?? 0) + (slop.bottom ?? 0);
    expect(w).toBeGreaterThanOrEqual(48);
    expect(h).toBeGreaterThanOrEqual(48);
    // The box takes no more room in the row than the glyph did: footprint 12 x 12.
    const glyph = 12;
    expect((s.width as number) + (s.marginLeft as number) + (s.marginRight as number)).toBe(glyph);
    expect((s.height as number) + 2 * (s.marginVertical as number)).toBe(glyph);
    // The glyph sits where it sat: the box's left reach is undone by its left padding.
    expect(s.paddingLeft).toBe(-(s.marginLeft as number));
    // It never reaches past the 14 dp gap into Undo's own box.
    expect(-(s.marginLeft as number)).toBeLessThanOrEqual(14);
    await fireEvent.press(btn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
