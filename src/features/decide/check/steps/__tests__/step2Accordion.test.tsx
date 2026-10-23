import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { MethodCard } from '../step2/MethodCard';
import { wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const NAME = 'Deposit and loan';
const SUMMARY = '$2,000 down · 36 months';
const BODY = 'Inputs live here';
const NEEDS_PRICE = { fields: ['price'], edit: true } as const;
const NEEDS_RATE = { fields: ['rate', 'months'], edit: false } as const;

function card(over: Partial<React.ComponentProps<typeof MethodCard>> = {}) {
  const props: React.ComponentProps<typeof MethodCard> = {
    name: NAME,
    infoKey: 'depositAndLoan',
    selected: false,
    open: false,
    needs: null,
    summary: SUMMARY,
    chips: [],
    onHeaderPress: jest.fn(),
    onEdit: jest.fn(),
    readOnly: false,
    children: <Text>{BODY}</Text>,
    ...over,
  };
  return props;
}

describe('MethodCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-79 a method card header is a radio with checked and expanded state', async () => {
    const p = card({ selected: true, open: true, needs: NEEDS_RATE });
    await wrap(<MethodCard {...p} />);
    const radio = screen.getByRole('radio');
    expect(radio.props.accessibilityState).toEqual({ checked: true, expanded: true, disabled: false });
    expect(radio.props.accessibilityLabel).toBe(`${NAME}, Selected, ${SUMMARY}, needs rate, months`);
    expect(radio.props.accessibilityHint).toBe('Selects this way to pay and shows its details');
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(screen.getByText('Needs: rate, months')).toBeTruthy();
    expect(screen.queryByText(SUMMARY)).toBeNull(); // hidden while open
    await fireEvent.press(radio);
    expect(p.onHeaderPress).toHaveBeenCalledTimes(1);
  });

  it('D-79 a folded card shows its summary, not its body, and is not selected', async () => {
    await wrap(<MethodCard {...card({ chips: ['Below the price'] })} />);
    expect(screen.getByRole('radio').props.accessibilityState).toEqual({ checked: false, expanded: false, disabled: false });
    expect(screen.getByRole('radio').props.accessibilityLabel).toBe(`${NAME}, Not selected, ${SUMMARY}`);
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    expect(screen.getByText('Below the price')).toBeTruthy();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('D-79 Needs price offers Edit to step 1', async () => {
    const p = card({ needs: NEEDS_PRICE, summary: null });
    await wrap(<MethodCard {...p} />);
    expect(screen.getByText('Needs: price')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(p.onEdit).toHaveBeenCalledTimes(1);
    expect(p.onHeaderPress).not.toHaveBeenCalled();
  });

  it('D-79 Needs rate has no Edit', async () => {
    await wrap(<MethodCard {...card({ needs: NEEDS_RATE })} />);
    expect(screen.queryByLabelText('Edit')).toBeNull();
  });

  it('D-79 read-only cards expand but the radio is disabled', async () => {
    const p = card({ selected: true, readOnly: true });
    await wrap(<MethodCard {...p} />);
    const radio = screen.getByRole('radio');
    expect(radio.props.accessibilityState).toEqual({ checked: true, expanded: false, disabled: true });
    expect(radio.props.accessibilityHint).toBe('Shows its details');
    await fireEvent.press(radio);
    expect(p.onHeaderPress).toHaveBeenCalledTimes(1); // still reads: the card opens and closes
  });

  it('D-79 a read-only card offers no Edit for a missing price', async () => {
    await wrap(<MethodCard {...card({ needs: NEEDS_PRICE, readOnly: true })} />);
    expect(screen.queryByLabelText('Edit')).toBeNull();
  });
});
