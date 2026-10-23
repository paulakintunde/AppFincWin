import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AddChangeRow } from '../AddChangeRow';

jest.setTimeout(30000);

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

async function draw(showAdd: boolean, showInvest: boolean) {
  return await render(
    <ThemeProvider>
      <AddChangeRow showAdd={showAdd} showInvest={showInvest} onAdd={jest.fn()} onInvest={jest.fn()} />
    </ThemeProvider>
  );
}

describe('AddChangeRow', () => {
  it('stacks the two items whenever both show, so neither label wraps beside the other', async () => {
    await draw(true, true);
    const row = screen.getByTestId('add-change-row').parent as unknown as { props: { style?: unknown } };
    expect(flat(row).flexDirection).toBe('column');
  });

  it('keeps one item on a row by itself', async () => {
    await draw(true, false);
    const row = screen.getByTestId('add-change-row').parent as unknown as { props: { style?: unknown } };
    expect(flat(row).flexDirection).toBe('row');
    expect(screen.queryByTestId('check-investment-link')).toBeNull();
  });

  it('renders nothing when neither shows', async () => {
    await draw(false, false);
    expect(screen.queryByTestId('add-change-row')).toBeNull();
  });
});
