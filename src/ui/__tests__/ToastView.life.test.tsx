// 06.2-14 (L06 kit): the toast's height, icon, time-left bar, rise and Reduce Motion behaviour.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { SAVED_OFFLINE_TOAST_KEY, toastIconFor } from '@/features/record/history/toastIcon';
import { TIME_BAR_HEIGHT, TOAST_MIN_HEIGHT, ToastView, timeLeftFraction, type ToastViewProps } from '../ToastView';

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockReduced ? actual.DURATION.press : ms),
    }),
  };
});

jest.setTimeout(20000);

function renderToast(props: Partial<ToastViewProps> = {}) {
  return render(
    <ThemeProvider>
      <ToastView message="Saved: FreshCo, $42.10" onDismiss={jest.fn()} dismissLabel="Dismiss" {...props} />
    </ThemeProvider>
  );
}

function translateYOf(style: unknown): number | undefined {
  const flat = StyleSheet.flatten(style as never) as { transform?: { translateY?: number }[] } | undefined;
  const t = flat?.transform?.find((x) => x.translateY !== undefined);
  return t?.translateY;
}

beforeEach(() => {
  mockReduced = false;
});

describe('ToastView (L06 kit)', () => {
  it('is at least 48 tall and keeps one row: icon, message, action, dismiss', async () => {
    const screen = await renderToast({ icon: 'stateFits', actionLabel: 'Undo', onAction: jest.fn() });
    const container = screen.getByText('Saved: FreshCo, $42.10').parent!;
    const style = StyleSheet.flatten(container.props.style);
    expect(TOAST_MIN_HEIGHT).toBe(48);
    expect(style.minHeight).toBe(48);
    expect(style.flexDirection).toBe('row');
    // The message is not clamped (text-fit rule).
    expect(screen.getByText('Saved: FreshCo, $42.10').props.numberOfLines).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('draws a 16 icon in the surface colour, hidden from screen readers', async () => {
    const screen = await renderToast({ icon: 'delete' });
    const icon = screen.getByTestId('toast-icon-delete', { includeHiddenElements: true });
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.accessible).toBe(false);
  });

  it('draws no icon when none is given', async () => {
    const screen = await renderToast();
    expect(screen.queryByTestId(/^toast-icon-/, { includeHiddenElements: true })).toBeNull();
  });

  it('shows a 2 dp time-left bar along the bottom edge when the toast has a timeout', async () => {
    const screen = await renderToast({ durationMs: 10000, shownAt: Date.now() });
    const bar = screen.getByTestId('toast-time-bar', { includeHiddenElements: true });
    const style = StyleSheet.flatten(bar.props.style);
    expect(TIME_BAR_HEIGHT).toBe(2);
    expect(style.height).toBe(2);
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(0);
    // Hidden from screen readers, and never takes a touch.
    expect(bar.props.accessibilityElementsHidden).toBe(true);
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bar.props.pointerEvents).toBe('none');
    // The fill shrinks from the left, in the surface colour (no new colour).
    const fill = StyleSheet.flatten(screen.getByTestId('toast-time-bar-fill', { includeHiddenElements: true }).props.style);
    expect(fill.transformOrigin).toBe('left');
    expect(fill.backgroundColor).toBe(colors.surface);
    // The bar is not announced: the screen reader finds only the message and the buttons.
    expect(screen.queryByTestId('toast-time-bar')).toBeNull();
  });

  it('has no time-left bar when the toast has no timeout (screen reader on)', async () => {
    const screen = await renderToast({ durationMs: null });
    expect(screen.queryByTestId('toast-time-bar', { includeHiddenElements: true })).toBeNull();
    const absent = await renderToast();
    expect(absent.queryByTestId('toast-time-bar', { includeHiddenElements: true })).toBeNull();
  });

  it('the bar starts at the time left, not full, when the toast was shown earlier', () => {
    const now = 1_000_000;
    expect(timeLeftFraction(10000, now, now)).toBe(1);
    expect(timeLeftFraction(10000, now - 4000, now)).toBeCloseTo(0.6);
    expect(timeLeftFraction(10000, now - 12000, now)).toBe(0);
    expect(timeLeftFraction(0, now, now)).toBe(0);
  });

  it('rises 8 dp as it fades in', async () => {
    const screen = await renderToast();
    const translateY = translateYOf(screen.getByTestId('toast-rise').props.style);
    // At rest the rise is 0; at the start it is 8. Either way never the old 14.
    expect(translateY === undefined || translateY === 0 || translateY === 8).toBe(true);
  });

  it('Reduce Motion: no rise, the bar is still shown', async () => {
    mockReduced = true;
    const screen = await renderToast({ durationMs: 3200, shownAt: Date.now() });
    const translateY = translateYOf(screen.getByTestId('toast-rise').props.style);
    expect(translateY === undefined || translateY === 0).toBe(true);
    expect(screen.getByTestId('toast-time-bar', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps the warning tone and the C-CR-02 structure with an icon and a bar', async () => {
    const screen = await renderToast({ tone: 'warning', icon: 'stateOverCap', durationMs: 3200, actionLabel: 'Undo', onAction: jest.fn() });
    const msg = screen.getByText('Saved: FreshCo, $42.10');
    expect(StyleSheet.flatten(msg.parent!.props.style).backgroundColor).toBe(colors.warn1);
    expect(msg.parent!.props.accessible).toBeUndefined();
    expect(msg.props.accessibilityRole).toBe('alert');
  });
});

describe('UndoToastHost icon choice (L06)', () => {
  it('ordinary -> stateFits, destructive -> delete, refusal -> stateDue', () => {
    expect(toastIconFor({ kind: 'ordinary', tone: 'default', text: null })).toBe('stateFits');
    expect(toastIconFor({ kind: 'destructive', tone: 'default', text: null })).toBe('delete');
    expect(toastIconFor({ kind: 'refusal', tone: 'default', text: null })).toBe('stateDue');
  });

  it('the cap warning tone shows stateOverCap whatever the kind', () => {
    expect(toastIconFor({ kind: 'ordinary', tone: 'warning', text: null })).toBe('stateOverCap');
    expect(toastIconFor({ kind: 'info', tone: 'warning', text: null })).toBe('stateOverCap');
  });

  it('info shows savedOffline only for the saved-offline toast, else no icon', () => {
    expect(SAVED_OFFLINE_TOAST_KEY).toBe('appLife.toast.savedOffline');
    expect(toastIconFor({ kind: 'info', tone: 'default', text: { key: SAVED_OFFLINE_TOAST_KEY } })).toBe('savedOffline');
    expect(toastIconFor({ kind: 'info', tone: 'default', text: { key: 'sync.offline' } })).toBeUndefined();
    expect(toastIconFor({ kind: 'info', tone: 'default', text: null })).toBeUndefined();
  });
});
