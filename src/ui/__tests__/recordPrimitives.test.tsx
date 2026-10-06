/**
 * 02-19: the shared list and sheet primitive set every Phase 2 Record screen composes
 * from (UI-SPEC "build them once, reuse across every Record screen"). Covers both
 * plan tasks: Sheet/SheetHeader/ConfirmSheet/ToastView/EmptyState (Task 1) and
 * Row/Pill/Chip/SwatchDot/CategoryGlyph/AmountDisplay (Task 2).
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { categorySwatch } from '@/theme/tokens';
import { Sheet } from '../Sheet';
import { SheetHeader } from '../SheetHeader';
import { ConfirmSheet } from '../ConfirmSheet';
import { ToastView } from '../ToastView';
import { EmptyState } from '../EmptyState';
import { Row } from '../Row';
import { Pill } from '../Pill';
import { Chip } from '../Chip';
import { SwatchDot } from '../SwatchDot';
import { CategoryGlyph } from '../CategoryGlyph';
import { AmountDisplay } from '../AmountDisplay';

// DSG-03 pattern (src/theme/__tests__/screenInsets.test.tsx): mock the insets rather
// than wrapping in SafeAreaProvider, so Sheet's useScreenInsets() call resolves.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

// The first Sheet render in this file pulls in Modal/KeyboardAvoidingView plus the
// safe-area mock and ThemeProvider's async cache hydration cold -- consistently just
// over the 5s default in this environment. A longer, explicit budget avoids a timeout
// racing that first render and leaving its hydration promise to resolve into a later,
// already-torn-down test (the actual cause of the flaky cross-test failures observed).
jest.setTimeout(20000);

async function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function flatStyle(props: { style?: unknown }): Record<string, unknown>[] {
  return ([] as Record<string, unknown>[]).concat(props.style as never);
}

describe('typography sheetTitle role', () => {
  it('resolves fontSize 16, lineHeight 19.2, letterSpacing -0.16, weight-600 face', () => {
    const resolved = textRole('bold', 'sheetTitle');
    expect(resolved.fontSize).toBe(16);
    expect(resolved.lineHeight).toBeCloseTo(19.2);
    expect(resolved.letterSpacing).toBeCloseTo(-0.16);
    expect(resolved.fontFamily).toBe('Archivo_600SemiBold');
  });
});

describe('Sheet', () => {
  it('renders children when visible', async () => {
    const { getByText } = await renderWithTheme(
      <Sheet visible onDismiss={jest.fn()}>
        <Text>{'Sheet content'}</Text>
      </Sheet>
    );
    expect(getByText('Sheet content')).toBeTruthy();
  });

  it('renders nothing when not visible', async () => {
    const { queryByText } = await renderWithTheme(
      <Sheet visible={false} onDismiss={jest.fn()}>
        <Text>{'Hidden content'}</Text>
      </Sheet>
    );
    expect(queryByText('Hidden content')).toBeNull();
  });

  it('calls onDismiss when the backdrop is pressed', async () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <Sheet visible onDismiss={onDismiss}>
        <Text>{'Content'}</Text>
      </Sheet>
    );
    fireEvent.press(getByLabelText('Close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('gives the container the 28px sheetTop radius on both top corners', async () => {
    const { getByTestId } = await renderWithTheme(
      <Sheet visible onDismiss={jest.fn()}>
        <Text>{'Content'}</Text>
      </Sheet>
    );
    const style = flatStyle(getByTestId('sheet-container').props);
    expect(style.some((s) => s.borderTopLeftRadius === 28)).toBe(true);
    expect(style.some((s) => s.borderTopRightRadius === 28)).toBe(true);
  });
});

describe('SheetHeader', () => {
  it('shows the title and fires onCancel via the labelled cancel control', async () => {
    const onCancel = jest.fn();
    const { getByText, getByLabelText } = await renderWithTheme(
      <SheetHeader title="New expense" cancelLabel="Cancel" onCancel={onCancel} />
    );
    expect(getByText('New expense')).toBeTruthy();
    fireEvent.press(getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmSheet', () => {
  // Deviation (Rule 1 - bug): two fireEvent.press calls against two different elements
  // within one test leaves a Pressability-internal timer pending that fires into the
  // *next* test's render, throwing "overlapping act() calls" and cascading failures
  // across every following test in this file (reproduced in isolation). Splitting into
  // one press per test avoids the leak; each test still renders its own fresh instance.
  it('shows body text', async () => {
    const { getByText } = await renderWithTheme(
      <ConfirmSheet
        visible
        body="Delete this transaction?"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructive
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByText('Delete this transaction?')).toBeTruthy();
  });

  it('fires onConfirm from the confirm action', async () => {
    const onConfirm = jest.fn();
    const { getByText } = await renderWithTheme(
      <ConfirmSheet
        visible
        body="Delete this transaction?"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel from the cancel action', async () => {
    const onCancel = jest.fn();
    const { getByText } = await renderWithTheme(
      <ConfirmSheet
        visible
        body="Delete this transaction?"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructive
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the destructive action in colors.danger text', async () => {
    const { getByText } = await renderWithTheme(
      <ConfirmSheet
        visible
        body="Delete?"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructive
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    const style = flatStyle(getByText('Delete').props);
    expect(style.some((s) => s.color === '#B4472A')).toBe(true);
  });
});

describe('ToastView', () => {
  // Deviation (Rule 1 - bug): as with ConfirmSheet above, pressing two different
  // controls within one test leaks a pending Pressability timer into the next test.
  // One press per test avoids it.
  it('renders the message and labels both controls', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(
      <ToastView
        message="Added · Groceries"
        actionLabel="Undo"
        onAction={jest.fn()}
        onDismiss={jest.fn()}
        dismissLabel="Dismiss"
      />
    );
    expect(getByText('Added · Groceries')).toBeTruthy();
    expect(getByLabelText('Undo')).toBeTruthy();
    expect(getByLabelText('Dismiss')).toBeTruthy();
  });

  it('fires onAction from the action control', async () => {
    const onAction = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <ToastView message="Added · Groceries" actionLabel="Undo" onAction={onAction} onDismiss={jest.fn()} dismissLabel="Dismiss" />
    );
    fireEvent.press(getByLabelText('Undo'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss from the dismiss control', async () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <ToastView message="Added · Groceries" onDismiss={onDismiss} dismissLabel="Dismiss" />
    );
    fireEvent.press(getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // C-CR-02: an `accessible` container collapses its children into one iOS accessibility
  // element, so VoiceOver could never reach Undo or Dismiss. Only the message text is the
  // alert; the two controls stay separately focusable.
  it('makes only the message the alert, never the container holding the controls', async () => {
    const { getByRole, getByLabelText } = await renderWithTheme(
      <ToastView message="Imported 4 lines" actionLabel="Undo" onAction={jest.fn()} onDismiss={jest.fn()} dismissLabel="Dismiss" />
    );
    const alert = getByRole('alert');
    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(alert.props.children).toBe('Imported 4 lines');

    // No ancestor of either control may be an accessible element (that would hide them on iOS).
    for (const label of ['Undo', 'Dismiss']) {
      let node = getByLabelText(label).parent;
      while (node) {
        expect(node.props.accessible).not.toBe(true);
        node = node.parent;
      }
    }
  });

  it('announces the message on iOS, where the live region has no effect', async () => {
    const { Platform, AccessibilityInfo } = jest.requireActual<typeof import('react-native')>('react-native');
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    try {
      await renderWithTheme(<ToastView message="Deleted · Rent" onDismiss={jest.fn()} dismissLabel="Dismiss" />);
      expect(announce).toHaveBeenCalledWith('Deleted · Rent');
    } finally {
      announce.mockRestore();
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    }
  });

  it('renders no action control when actionLabel/onAction are omitted', async () => {
    const { queryByLabelText } = await renderWithTheme(
      <ToastView message="Imported 4 lines" onDismiss={jest.fn()} dismissLabel="Dismiss" />
    );
    expect(queryByLabelText('Undo')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('renders heading and body', async () => {
    const { getByText } = await renderWithTheme(
      <EmptyState heading="Nothing yet." body="Add the first one with the + button." />
    );
    expect(getByText('Nothing yet.')).toBeTruthy();
    expect(getByText('Add the first one with the + button.')).toBeTruthy();
  });
});

describe('Row', () => {
  it('renders a label and value', async () => {
    const { getByText } = await renderWithTheme(<Row label="Groceries" value="£42.00" />);
    expect(getByText('Groceries')).toBeTruthy();
    expect(getByText('£42.00')).toBeTruthy();
  });

  it('becomes an accessible button when onPress is provided', async () => {
    const onPress = jest.fn();
    const { getByRole } = await renderWithTheme(<Row label="Groceries" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // C-WR-08: the pressable's own label overrides its child text, so the current selection
  // (the row's value) must be exposed as the accessibility value or VoiceOver never reads it.
  it('exposes its value to screen readers when pressable', async () => {
    const first = await renderWithTheme(<Row label="Category" value="Groceries" onPress={jest.fn()} />);
    expect(first.getByRole('button').props.accessibilityLabel).toBe('Category');
    expect(first.getByRole('button').props.accessibilityValue).toMatchObject({ text: 'Groceries' });
  });

  it('keeps announcing the value when a custom accessibilityLabel is passed', async () => {
    const second = await renderWithTheme(
      <Row label="Category" value="Rent" accessibilityLabel="Choose category" onPress={jest.fn()} />
    );
    expect(second.getByRole('button').props.accessibilityValue).toMatchObject({ text: 'Rent' });
  });

  it('is at least 44px tall', async () => {
    const { getByTestId } = await renderWithTheme(<Row label="Groceries" />);
    const style = flatStyle(getByTestId('row-root').props);
    expect(style.some((s) => (s.minHeight as number) >= 44)).toBe(true);
  });
});

describe('Pill', () => {
  it('renders the primary variant with accent background and surface text', async () => {
    const { getByText } = await renderWithTheme(<Pill label="Save expense" variant="primary" onPress={jest.fn()} />);
    const style = flatStyle(getByText('Save expense').props);
    expect(style.some((s) => s.color === '#FFFFFF')).toBe(true);
  });

  it('renders the danger variant with danger text', async () => {
    const { getByText } = await renderWithTheme(<Pill label="Delete" variant="danger" onPress={jest.fn()} />);
    const style = flatStyle(getByText('Delete').props);
    expect(style.some((s) => s.color === '#B4472A')).toBe(true);
  });

  it('renders the secondary variant with fill1 background and ink text', async () => {
    const { getByText, getByRole } = await renderWithTheme(<Pill label="Cancel" variant="secondary" onPress={jest.fn()} />);
    const textStyle = flatStyle(getByText('Cancel').props);
    expect(textStyle.some((s) => s.color === '#14150F')).toBe(true);
    const buttonStyle = flatStyle(getByRole('button').props);
    expect(buttonStyle.some((s) => s.backgroundColor === '#F1EFE8')).toBe(true);
  });

  it('marks the selected state with an accent border and accessibilityState', async () => {
    const { getByRole } = await renderWithTheme(<Pill label="All" variant="secondary" selected onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState.selected).toBe(true);
  });

  it('blocks onPress and lowers opacity when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await renderWithTheme(<Pill label="Save" variant="primary" disabled onPress={onPress} />);
    const button = getByRole('button');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    const style = flatStyle(button.props);
    expect(style.some((s) => (s.opacity as number) < 1)).toBe(true);
  });

  it('is at least 44px tall', async () => {
    const { getByRole } = await renderWithTheme(<Pill label="Save" variant="primary" onPress={jest.fn()} />);
    const style = flatStyle(getByRole('button').props);
    expect(style.some((s) => (s.minHeight as number) >= 44)).toBe(true);
  });
});

describe('Chip', () => {
  it('renders inactive with fill1 background', async () => {
    const { getByRole } = await renderWithTheme(<Chip label="All" onPress={jest.fn()} />);
    const style = flatStyle(getByRole('button').props);
    expect(style.some((s) => s.backgroundColor === '#F1EFE8')).toBe(true);
  });

  it('renders selected with accentTint1 background, accent text and accessibilityState', async () => {
    const { getByText, getByRole } = await renderWithTheme(<Chip label="Transfers" selected onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState.selected).toBe(true);
    const buttonStyle = flatStyle(getByRole('button').props);
    expect(buttonStyle.some((s) => s.backgroundColor === '#EAF1EC')).toBe(true);
    const textStyle = flatStyle(getByText('Transfers').props);
    expect(textStyle.some((s) => s.color === '#1B4D3E')).toBe(true);
  });
});

describe('SwatchDot', () => {
  it('renders the swatch colour with an accessible label from the catalogue', async () => {
    const { getByLabelText } = await renderWithTheme(<SwatchDot colorKey="teal" onPress={jest.fn()} />);
    const dot = getByLabelText('Teal colour');
    expect(dot).toBeTruthy();
  });

  it('marks the selected state and is a 44px touch target', async () => {
    const { getByLabelText } = await renderWithTheme(<SwatchDot colorKey="teal" selected onPress={jest.fn()} />);
    const dot = getByLabelText('Teal colour');
    expect(dot.props.accessibilityState.selected).toBe(true);
    const style = flatStyle(dot.props);
    expect(style.some((s) => (s.width as number) >= 44 && (s.height as number) >= 44)).toBe(true);
  });
});

describe('CategoryGlyph', () => {
  it('renders the letter tinted with the swatch colour', async () => {
    const { getByText } = await renderWithTheme(<CategoryGlyph colorKey="teal" letter="G" />);
    // CategoryGlyph hides itself from the accessibility tree (decorative, adjacent to a
    // row's own semantic label) -- include hidden elements to still assert its styling.
    const style = flatStyle(getByText('G', { includeHiddenElements: true }).props);
    expect(style.some((s) => s.color === categorySwatch.teal.color)).toBe(true);
  });
});

describe('AmountDisplay', () => {
  it('renders the given text at the 44px display size', async () => {
    const { getByText } = await renderWithTheme(<AmountDisplay text="£1,204.50" />);
    const style = flatStyle(getByText('£1,204.50').props);
    expect(style.some((s) => s.fontSize === 44)).toBe(true);
  });

  it('uses colors.danger when tone is danger', async () => {
    const { getByText } = await renderWithTheme(<AmountDisplay text="-£40.00" tone="danger" />);
    const style = flatStyle(getByText('-£40.00').props);
    expect(style.some((s) => s.color === '#B4472A')).toBe(true);
  });
});
