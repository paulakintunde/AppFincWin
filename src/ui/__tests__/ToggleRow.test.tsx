import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToggleRow } from '../ToggleRow';

jest.setTimeout(20000);

async function setup(value: boolean, disabled = false) {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <ToggleRow label="Repeat" value={value} onChange={onChange} disabled={disabled} />
    </ThemeProvider>,
  );
  return { ...utils, onChange };
}

describe('ToggleRow', () => {
  it('is a switch with checked state', async () => {
    const { getByRole } = await setup(true);
    const sw = getByRole('switch');
    expect(sw.props.accessibilityState.checked).toBe(true);
  });

  it('press calls onChange with the negated value', async () => {
    const { getByRole, onChange } = await setup(false);
    await fireEvent.press(getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled ignores presses', async () => {
    const { getByRole, onChange } = await setup(false, true);
    await fireEvent.press(getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
