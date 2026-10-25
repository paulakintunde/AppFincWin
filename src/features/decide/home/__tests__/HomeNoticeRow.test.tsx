import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { HomeNoticeRow } from '../HomeNoticeRow';
import type { NoticeRowModel } from '../homeProblems';

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describe('HomeNoticeRow', () => {
  it('renders nothing when the model is hidden', async () => {
    await wrap(<HomeNoticeRow model={{ visible: false }} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-notice-row')).toBeNull();
  });

  it('D-96 the notice row is quiet and never red', async () => {
    const onPress = jest.fn();
    const model: NoticeRowModel = { visible: true, text: { kind: 'items', count: 2 }, dot: true };
    await wrap(<HomeNoticeRow model={model} onPress={onPress} />);
    const row = screen.getByRole('button', { name: /2 items need a look/ });
    expect(row.props.accessibilityHint).toBe('Opens the list');
    const style = flat('home-notice-row');
    expect(style.minHeight).toBe(44);
    expect(style.backgroundColor).toBeUndefined();
    const dot = flat('home-notice-dot');
    expect(dot.width).toBe(8);
    expect(dot.backgroundColor).toBe('#8A5A1B'); // warn1, never the danger red
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('D-96 one item reads in the singular', async () => {
    await wrap(<HomeNoticeRow model={{ visible: true, text: { kind: 'items', count: 1 }, dot: true }} onPress={jest.fn()} />);
    expect(screen.getByText(/^1.item needs a look$/)).toBeTruthy();
  });

  it('D-96 slow saves show without the dot', async () => {
    await wrap(<HomeNoticeRow model={{ visible: true, text: { kind: 'sync', label: { key: 'sync.saving' } }, dot: false }} onPress={jest.fn()} />);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.queryByTestId('home-notice-dot')).toBeNull();
  });

  it('D-96 waiting writes read from the sync copy and offline shows the dot', async () => {
    const { rerender } = await wrap(
      <HomeNoticeRow model={{ visible: true, text: { kind: 'sync', label: { key: 'sync.waiting', count: 3 } }, dot: false }} onPress={jest.fn()} />
    );
    expect(screen.getByText(/^3.changes waiting$/)).toBeTruthy();
    await rerender(<HomeNoticeRow model={{ visible: true, text: { kind: 'sync', label: { key: 'sync.offlineWaiting', count: 2 } }, dot: true }} onPress={jest.fn()} />);
    expect(screen.getByText(/^Offline · 2.changes waiting$/)).toBeTruthy();
    expect(screen.getByTestId('home-notice-dot')).toBeTruthy();
  });
});
