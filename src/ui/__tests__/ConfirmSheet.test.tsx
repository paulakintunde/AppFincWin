import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConfirmSheet } from '../ConfirmSheet';

jest.mock('../Sheet', () => {
  const R = require('react');
  const { Pressable: P, View } = require('react-native');
  return {
    Sheet: ({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) => (
      <View>
        <P accessibilityLabel="sheet-dismiss" onPress={onDismiss} />
        {children}
      </View>
    ),
  };
});

jest.setTimeout(20000);

async function setup(extra: { onDismiss?: () => void } = {}) {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <ConfirmSheet
        visible
        body="Body"
        cancelLabel="Discard"
        confirmLabel="Continue"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...extra}
      />
    </ThemeProvider>,
  );
  return { ...utils, onCancel, onConfirm };
}

describe('ConfirmSheet dismissal', () => {
  it('defaults a sheet dismissal to onCancel', async () => {
    const { getByLabelText, onCancel } = await setup();
    await fireEvent.press(getByLabelText('sheet-dismiss'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('routes a sheet dismissal to onDismiss and not onCancel when given', async () => {
    const onDismiss = jest.fn();
    const { getByLabelText, onCancel } = await setup({ onDismiss });
    await fireEvent.press(getByLabelText('sheet-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the Cancel button on onCancel', async () => {
    const onDismiss = jest.fn();
    const { getByText, onCancel } = await setup({ onDismiss });
    await fireEvent.press(getByText('Discard'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
