// 06-27 (audit D1): the value sits between the two buttons and has room, in both layouts.
import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { Stepper } from '../Stepper';

const props = { value: 50, step: 10, onChange: jest.fn(), valueText: '$50', accessibilityLabel: 'Extra each month, 50 dollars', decrementLabel: 'Less', incrementLabel: 'More' };

describe('Stepper value (D1)', () => {
  it('the group and the buttons row stretch so the value gets width', async () => {
    await wrap(<Stepper {...props} />);
    const group = screen.getByTestId('grow-stepper');
    expect(StyleSheet.flatten(group.props.style).alignSelf).toBe('stretch');
    const row = screen.getByTestId('grow-stepper-minus').parent;
    expect(StyleSheet.flatten(row?.props.style).alignSelf).toBe('stretch');
  });

  it('shows the value between minus and plus', async () => {
    await wrap(<Stepper {...props} />);
    const kids = screen.getByTestId('grow-stepper-minus').parent?.children ?? [];
    expect(kids).toHaveLength(3);
    expect(screen.getByText('$50')).toBeTruthy();
  });
});
