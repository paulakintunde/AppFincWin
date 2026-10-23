import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Step1Item } from '../Step1Item';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { InputLine } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));

const REPLACED: InputLine = { id: 'rp-1', name: 'Bus pass', amount: 12_000, note: '', counted: true, seriesId: null, category: null };

/** The nearest ancestor (host or composite) whose flattened style has the given key. */
function ancestorStyle(el: { parent: unknown }, key: string): Record<string, unknown> | null {
  let node = el as { parent: unknown; props?: { style?: unknown } } | null;
  while (node) {
    const style = StyleSheet.flatten(node.props?.style as never) as Record<string, unknown> | undefined;
    if (style && key in style) return style;
    node = node.parent as typeof node;
  }
  return null;
}

/** Presses the ⓘ named "About {term}", sees the sheet's own heading and Close, then closes it. */
async function opensSheetFor(term: string, index = 0) {
  const buttons = screen.getAllByRole('button', { name: `About ${term}` });
  await act(async () => {
    fireEvent.press(buttons[index]);
  });
  const close = await screen.findByRole('button', { name: 'Close' });
  expect(screen.getAllByText(term).length).toBeGreaterThanOrEqual(1);
  await act(async () => {
    fireEvent.press(close);
  });
}

async function step1(scale = 1, over: Parameters<typeof buy>[0] = {}) {
  const p = stepProps(buy(over));
  await wrap(<Step1Item {...p} recurringBills={[]} />, scale);
  return p;
}

describe('D-70 placement: step 1', () => {
  it('D-70 step 1 carries replaces and incomeChange', async () => {
    await step1(1, { replaces: [REPLACED], incomeChange: { direction: 'raises', amount: null, startDate: null, likelihood: 'likely' } });
    await opensSheetFor('Expenses it replaces');
    await opensSheetFor('A change to your income');
  });

  it('D-76 step 1 flex chips stack full width at fontScale 2', async () => {
    await step1(2);
    expect(ancestorStyle(screen.getByLabelText('A purchase'), 'width')).toMatchObject({ width: '100%' });
    expect(ancestorStyle(screen.getByLabelText('In a month'), 'width')).toMatchObject({ width: '100%' });
  });

  it('keeps the chips side by side at 1.0x', async () => {
    await step1(1);
    expect(ancestorStyle(screen.getByLabelText('A purchase'), 'flex')).toMatchObject({ flex: 1 });
  });
});
