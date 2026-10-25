import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { hapticSelection } from '@/ui/haptics';
import { focusAccessibility } from '@/shell/a11yFocus';
import { Lock } from '../../check/steps/stepUi';
import { ref } from '../../copy/types';
import { InfoButton } from '../InfoButton';
import { InfoLabel } from '../InfoLabel';
import { InfoSheet } from '../InfoSheet';
import { useInfoSheet } from '../useInfoSheet';

jest.setTimeout(30000);
const LOCKED = 'locked content';
const FOLD = 'fold row';
const LABEL = 'Cushion label';

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={1}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

function Harness({ locked = false, dynamic }: { locked?: boolean; dynamic?: Parameters<typeof useInfoSheet>[1] }) {
  const info = useInfoSheet('cushionMonths', dynamic);
  return (
    <View>
      <Lock locked={locked}>
        <Text>{LOCKED}</Text>
      </Lock>
      {info.button()}
      <View accessible accessibilityActions={[info.aboutAction]} onAccessibilityAction={info.onAccessibilityAction}>
        <Text>{FOLD}</Text>
      </View>
      {info.sheet}
    </View>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('InfoButton', () => {
  it('D-70 the info button is About {term} with a 44 target', async () => {
    const { getByRole } = await wrap(<InfoButton term="Cushion" onPress={jest.fn()} />);
    const btn = getByRole('button', { name: 'About Cushion' });
    expect(btn.props.accessibilityHint).toBe('Opens an explanation');
    const slop = btn.props.hitSlop as number;
    expect(16 + slop * 2).toBeGreaterThanOrEqual(44);
  });

  it('D-70 the info button fires a selection haptic', async () => {
    const onPress = jest.fn();
    const { getByRole } = await wrap(<InfoButton term="Cushion" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'About Cushion' }));
    expect(hapticSelection).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('D-76 rule I: the ⓘ is the next sibling of its label', async () => {
    const { getByTestId, getByRole, getByText } = await wrap(
      <View testID="row-host">
        <InfoLabel term="Cushion" onInfo={jest.fn()} lineHeight={20}>
          <Text>{LABEL}</Text>
        </InfoLabel>
      </View>,
    );
    const label = getByText('Cushion label');
    // the label is not a Text run that contains the button
    expect(within(label).queryByRole('button')).toBeNull();
    const row = getByTestId('row-host').children[0] as unknown as { props: { style: unknown }; children: unknown[] };
    const rowStyle = StyleSheet.flatten(row.props.style as never) as Record<string, unknown>;
    expect(rowStyle.flexDirection).toBe('row');
    expect(rowStyle.alignItems).toBe('flex-start');
    expect(row.children).toHaveLength(2);
    const btn = getByRole('button', { name: 'About Cushion' });
    const wrapperStyle = StyleSheet.flatten(btn.parent!.props.style as never) as Record<string, unknown>;
    expect(wrapperStyle.marginLeft).toBe(8);
    expect(wrapperStyle.marginTop).toBe(2);
    expect(wrapperStyle.position).toBeUndefined();
  });
});

describe('InfoSheet', () => {
  it('D-70 the sheet shows the term, the body and what this changes', async () => {
    const onClose = jest.fn();
    const { getByText, getByRole } = await wrap(<InfoSheet visible infoKey="reserve" onClose={onClose} />);
    expect(getByRole('header')).toBeTruthy();
    expect(getByText('What this changes')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('D-70 the cushion explanation carries the user figures or the static sentence', async () => {
    const withLine = await wrap(
      <InfoSheet
        visible
        infoKey="cushionMonths"
        dynamic={{ cushionMonths: { months: 3, reason: ref('decide.depth.cushion.reason', { months: '3', because: 'steady income' }) } }}
        onClose={jest.fn()}
      />,
    );
    expect(withLine.getByText(/Your line is 3.months, 3 months, steady income\./)).toBeTruthy();
  });

  it('D-70 the cushion explanation shows only the static sentence without figures', async () => {
    const plain = await wrap(<InfoSheet visible infoKey="cushionMonths" onClose={jest.fn()} />);
    expect(plain.queryByText(/Your line is/)).toBeNull();
    expect(plain.queryByText(/\{\{/)).toBeNull();
  });
});

describe('useInfoSheet', () => {
  it('D-70 Close returns focus to the ⓘ', async () => {
    const { getByRole } = await wrap(<Harness />);
    fireEvent.press(getByRole('button', { name: 'About Cushion' }));
    await waitFor(() => expect(focusAccessibility).toHaveBeenCalled());
    (focusAccessibility as jest.Mock).mockClear();
    await act(async () => {
      fireEvent.press(getByRole('button', { name: 'Close' }));
    });
    expect(focusAccessibility).toHaveBeenCalledTimes(1);
    expect((focusAccessibility as jest.Mock).mock.calls[0][0]).toBeTruthy();
  });

  it('D-70 the ⓘ stays active on a decided check', async () => {
    const { getByRole, findByRole } = await wrap(<Harness locked />);
    const btn = getByRole('button', { name: 'About Cushion' });
    expect(btn.props.accessibilityState?.disabled).not.toBe(true);
    await act(async () => {
      fireEvent.press(btn);
    });
    // the sheet's own Close stays live inside the read-only scope too
    const close = await findByRole('button', { name: 'Close' });
    expect(close.props.accessibilityState?.disabled).toBe(false);
  });

  it('D-70 the about action opens the sheet', async () => {
    const { getByText, queryByText } = await wrap(<Harness />);
    expect(queryByText('What this changes')).toBeNull();
    fireEvent(getByText('fold row').parent!, 'accessibilityAction', { nativeEvent: { actionName: 'about' } });
    await waitFor(() => expect(getByText('What this changes')).toBeTruthy());
  });
});
