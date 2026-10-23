import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { colors } from '@/theme/tokens';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { hapticLight } from '@/ui/haptics';
import { DeletableRow } from '../DeletableRow';

jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const mockSwipe: { props: Record<string, any>; close: jest.Mock } = { props: {}, close: jest.fn() };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockSwipe.props = props;
      R.useImperativeHandle(ref, () => ({ close: mockSwipe.close }));
      return <View>{props.children}</View>;
    }),
  };
});

// Stands in for the sheet: a dismiss control covers the backdrop, drag and Android back (all call onDismiss).
jest.mock('@/ui/Sheet', () => {
  const { Pressable, View } = require('react-native');
  return {
    Sheet: ({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: React.ReactNode }) =>
      visible ? (
        <View>
          <Pressable accessibilityLabel="sheet-dismiss" onPress={onDismiss} />
          {children}
        </View>
      ) : null,
  };
});

jest.setTimeout(20000);

async function setup(extra: { disabled?: boolean } = {}) {
  const onOpen = jest.fn();
  const onDelete = jest.fn();
  const onEdit = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <DeletableRow
        name="Sofa"
        onOpen={onOpen}
        menu={[{ key: 'edit', label: 'Edit it', onSelect: onEdit }]}
        confirm={{ title: 'Delete this check', body: 'It goes from the list.' }}
        onDelete={onDelete}
        {...extra}
      >
        <Text>{'Row body'}</Text>
      </DeletableRow>
    </ThemeProvider>,
  );
  return { ...utils, onOpen, onDelete, onEdit };
}

// RNGH reports 'left' when the right-hand (revealed by a left swipe) actions open.
async function fullSwipe() {
  await act(async () => {
    mockSwipe.props.onSwipeableOpen('left');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeletableRow', () => {
  it('D-73 a full swipe opens the confirm and never deletes', async () => {
    const { getByText, queryByText, onDelete } = await setup();
    expect(queryByText('Delete this check')).toBeNull();
    await fullSwipe();
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(mockSwipe.close).toHaveBeenCalledTimes(1);
    expect(getByText('Delete this check')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('D-73 the ⋯ menu lists the row options and Delete in danger', async () => {
    const { getByLabelText, getByText, onEdit, queryByText } = await setup();
    await fireEvent.press(getByLabelText('More for Sofa'));
    expect(getByText('Sofa')).toBeTruthy();
    expect(StyleSheet.flatten(getByText('Delete').props.style).color).toBe(colors.danger);
    await fireEvent.press(getByLabelText('Edit it'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(queryByText('Delete this check')).toBeNull();
  });

  it('D-73 the ⋯ Delete opens the confirm', async () => {
    const { getByLabelText, getByText, onDelete } = await setup();
    await fireEvent.press(getByLabelText('More for Sofa'));
    await fireEvent.press(getByLabelText('Delete'));
    expect(getByText('Delete this check')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('D-73 Keep it, back and the backdrop keep the row', async () => {
    const { getByText, getByLabelText, queryByText, onDelete } = await setup();
    await fullSwipe();
    await fireEvent.press(getByText('Keep it'));
    expect(queryByText('Delete this check')).toBeNull();
    await fullSwipe();
    await fireEvent.press(getByLabelText('sheet-dismiss'));
    expect(queryByText('Delete this check')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('D-73 Delete confirms once', async () => {
    const { getByText, queryByText, onDelete } = await setup();
    await fullSwipe();
    await fireEvent.press(getByText('Delete', { exact: true }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(queryByText('Delete this check')).toBeNull();
  });

  it('D-73 the ⋯ is labelled More for {name}', async () => {
    const { getByLabelText } = await setup();
    const trigger = getByLabelText('More for Sofa');
    const style = StyleSheet.flatten(trigger.props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
  });

  it('the swipe action is Delete in danger, with no left action, and the row opens on press', async () => {
    const { getByText, onOpen } = await setup();
    expect(mockSwipe.props.renderLeftActions).toBeUndefined();
    expect(mockSwipe.props.renderRightActions).toBeDefined();
    await fireEvent.press(getByText('Row body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('disabled hides the ⋯ and disables the swipe', async () => {
    const { queryByLabelText } = await setup({ disabled: true });
    expect(queryByLabelText('More for Sofa')).toBeNull();
    expect(mockSwipe.props.enabled).toBe(false);
  });
});
