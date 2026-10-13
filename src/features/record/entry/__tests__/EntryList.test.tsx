import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { summarise, type ListItem } from '@/engine/entryList';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { EntryList } from '../EntryList';

jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const mockCaptured: { props: Record<string, any> } = { props: {} };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockCaptured.props = props;
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});

jest.setTimeout(30000);

const item = (id: string, over: Partial<ListItem> = {}): ListItem => ({
  id,
  type: 'out',
  amountMinor: 1000,
  currency: 'GBP',
  accountId: 'a1',
  localDate: '2026-10-12',
  name: `Item ${id}`,
  categoryId: 'c1',
  paymentType: null,
  status: 'paid',
  statusTouched: false,
  note: '',
  automatic: false,
  refund: false,
  repeat: { freq: 'never' },
  toAccountId: null,
  toCurrency: null,
  amountInMinor: null,
  ...over,
});

const fmt = (minor: number, currency: string) => {
  const sym = currency === 'GBP' ? '£' : '';
  return `${sym}${(minor / 100).toFixed(2)}`;
};

async function setup(items: ListItem[], over: Partial<React.ComponentProps<typeof EntryList>> = {}) {
  const onEdit = jest.fn();
  const onRemove = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <EntryList
        items={items}
        summary={summarise(items)}
        dropped={0}
        formatAmount={fmt}
        formatDate={(d) => (d === '2026-10-12' ? '12 Oct' : d)}
        accountName={(id) => (id === 'a1' ? 'Main' : 'Savings')}
        categoryLabel={() => 'Groceries'}
        onEdit={onEdit}
        onRemove={onRemove}
        {...over}
      />
    </ThemeProvider>,
  );
  return { ...utils, onEdit, onRemove };
}

describe('EntryList', () => {
  it('renders nothing when empty', async () => {
    const { toJSON } = await setup([]);
    expect(toJSON()).toBeNull();
  });

  it('summarises a single-direction list with its total', async () => {
    const { getByText } = await setup([
      item('1', { amountMinor: 1000 }),
      item('2', { amountMinor: 2500 }),
      item('3', { amountMinor: 10750 }),
    ]);
    expect(getByText('3 in list · £142.50')).toBeTruthy();
  });

  it('summarises a mixed list as out and in', async () => {
    const { getByText } = await setup([item('1'), item('2', { type: 'in', amountMinor: 500 })]);
    expect(getByText('2 in list · £10.00 out · £5.00 in')).toBeTruthy();
  });

  it('shows only a count for transfers', async () => {
    const { getByText } = await setup([
      item('1', { type: 'transfer', name: '', categoryId: null, toAccountId: 'a2', toCurrency: 'GBP', amountMinor: 500 }),
    ]);
    expect(getByText('1 in list')).toBeTruthy();
    expect(getByText('Main → Savings')).toBeTruthy();
    expect(getByText('Transfer · 12 Oct')).toBeTruthy();
    expect(getByText('↔ £5.00')).toBeTruthy();
  });

  it('shows an in row with a plus and the type, category and date', async () => {
    const { getByText } = await setup([item('1', { type: 'in', amountMinor: 500, name: 'Pay' })]);
    expect(getByText('+£5.00')).toBeTruthy();
    expect(getByText('Money in · Groceries · 12 Oct')).toBeTruthy();
  });

  it('shows the repeat line', async () => {
    const { getByText } = await setup([item('1', { repeat: { freq: 'monthly', end: { kind: 'count', count: 6 } } })]);
    expect(getByText('Repeats monthly, 6 times')).toBeTruthy();
  });

  it('presses a row to edit and removes through the swipe action', async () => {
    const { getByText, onEdit, onRemove } = await setup([item('1')]);
    await fireEvent.press(getByText('Item 1'));
    expect(onEdit).toHaveBeenCalledWith('1');
    const right = mockCaptured.props.renderRightActions();
    expect(JSON.stringify(right)).toContain('REMOVE');
    mockCaptured.props.onSwipeableOpen('left');
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('exposes Edit and Remove from list as accessibility actions', async () => {
    const { getByLabelText, onEdit, onRemove } = await setup([item('1')]);
    const el = getByLabelText('Money out, Item 1, £10.00, 12 Oct');
    expect(el.props.accessibilityActions).toEqual([
      { name: 'right', label: 'Remove from list' },
      { name: 'activate', label: 'Edit' },
    ]);
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onEdit).toHaveBeenCalledWith('1');
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'right' } });
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('reads the dropped note', async () => {
    const { getByText } = await setup([item('1')], { dropped: 2 });
    expect(getByText('2 entries were left out because their account is no longer available.')).toBeTruthy();
  });

  it('shows only the dropped note when the list is empty but entries were dropped', async () => {
    const { getByText, queryByText } = await setup([], { dropped: 1 });
    expect(getByText('1 entry was left out because its account is no longer available.')).toBeTruthy();
    expect(queryByText(/in list/)).toBeNull();
  });
});
