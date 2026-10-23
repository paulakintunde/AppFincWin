import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { MethodCard } from '../step2/MethodCard';
import { Step2PriceAndPay } from '../Step2PriceAndPay';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

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

// ── Task 2: the accordion on the whole step ──
const ABOUT = (term: string) => `About ${term}`;
const RADIO = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name},`) });
const BOX = (method: string) => screen.getByTestId(`method-${method}`);
const COMES_TO = 'What it comes to';
const LENDER = 'FincWin records and plans. It does not lend money, arrange credit or hold your funds.';

function Harness({ start, readOnly = false }: { start: CheckInputs; readOnly?: boolean }) {
  const [inputs, setInputs] = React.useState(start);
  const props = {
    ...stepProps(inputs, { update: (patch: Partial<CheckInputs>) => setInputs((i) => ({ ...i, ...patch })), readOnly }),
    onSaveCardRate: jest.fn(),
    onSaveCardTerms: jest.fn(),
  };
  return <Step2PriceAndPay {...props} />;
}
const harness = (over: Partial<CheckInputs> = {}, readOnly = false) => wrap(<Harness start={buy(over)} readOnly={readOnly} />);
const loaded = () => {
  const base = buy();
  return { loan: { ...base.loan, aprText: '8', termMonths: 24, deposit: 30_000 } };
};

describe('Step 2 accordion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-79 step 2 follows the R15.1 order', async () => {
    await harness({ method: 'cash' });
    const tree = JSON.stringify(screen.toJSON());
    const at = (text: string) => tree.indexOf(`"${text}"`);
    const order = [at('Price'), at('How you pay'), at('Paid in full'), at(LENDER), at('Costs that follow it')];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('D-79 opening a folded card selects that method and closes the open one', async () => {
    await harness({ method: 'cash', ...loaded() });
    expect(RADIO('Paid in full').props.accessibilityState).toMatchObject({ checked: true, expanded: true });
    expect(within(BOX('cash')).getByText(COMES_TO)).toBeTruthy();
    await fireEvent.press(RADIO('Deposit and loan'));
    expect(RADIO('Deposit and loan').props.accessibilityState).toMatchObject({ checked: true, expanded: true });
    expect(RADIO('Paid in full').props.accessibilityState).toMatchObject({ checked: false, expanded: false });
    expect(within(BOX('cash')).queryByText(COMES_TO)).toBeNull();
    expect(within(BOX('loan')).getAllByLabelText('Deposit').length).toBeGreaterThan(0);
  });

  it('D-79 tapping the open card folds it and keeps it selected', async () => {
    await harness({ method: 'cash', ...loaded() });
    await fireEvent.press(RADIO('Paid in full'));
    expect(RADIO('Paid in full').props.accessibilityState).toMatchObject({ checked: true, expanded: false });
    expect(screen.queryAllByText(COMES_TO)).toHaveLength(0);
    expect(within(BOX('cash')).getByText(/ on the day · leaves /)).toBeTruthy(); // the folded summary
  });

  it('D-79 the selected card is open on arrival', async () => {
    await harness({ method: 'loan', ...loaded() });
    expect(RADIO('Deposit and loan').props.accessibilityState).toMatchObject({ checked: true, expanded: true });
    expect(within(BOX('loan')).getByLabelText('Annual rate, percent')).toBeTruthy();
    expect(RADIO('On a card').props.accessibilityState).toMatchObject({ checked: false, expanded: false });
  });

  it('D-79 with no method selected every card is folded', async () => {
    await harness({ method: null });
    for (const name of ['Paid in full', 'Deposit and loan', 'Instalment plan', 'On a card']) {
      expect(RADIO(name).props.accessibilityState).toMatchObject({ checked: false, expanded: false });
    }
    expect(screen.queryAllByText(COMES_TO)).toHaveLength(0);
  });

  it('D-79 outputs sit in the What it comes to tile inside the card', async () => {
    await harness({ method: 'loan', ...loaded() });
    const loan = within(BOX('loan'));
    expect(loan.getByText(COMES_TO)).toBeTruthy();
    for (const caption of ['On the day', 'A month', 'Total paid']) expect(loan.getAllByLabelText(new RegExp(`^${caption},`)).length).toBeGreaterThan(0);
    expect(loan.getByText(/^At 24.months the payment is/)).toBeTruthy();
    // the inputs come first, then the tile
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Annual rate')).toBeLessThan(tree.indexOf(COMES_TO));
  });

  it('D-79 a read-only check opens a card to read but cannot change the method', async () => {
    const p = { ...stepProps(buy({ method: 'cash' }), { readOnly: true }), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
    await wrap(<Step2PriceAndPay {...p} />);
    await fireEvent.press(RADIO('Deposit and loan'));
    expect(RADIO('Deposit and loan').props.accessibilityState).toMatchObject({ checked: false, expanded: true, disabled: true });
    expect(RADIO('Deposit and loan').props.accessibilityHint).toBe('Shows its details');
    expect(p.update).not.toHaveBeenCalled();
  });

  it('D-79 Needs price on Paid in full routes to step 1', async () => {
    const p = { ...stepProps(buy({ method: 'cash', advertised: 0 })), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
    await wrap(<Step2PriceAndPay {...p} />);
    expect(within(BOX('cash')).getByText('Needs: price')).toBeTruthy();
    await fireEvent.press(within(BOX('cash')).getByLabelText('Edit'));
    expect(p.goToStep).toHaveBeenCalledWith(1);
  });

  it('D-84 the price card carries price, taxFees, tradeIn and finalPrice', async () => {
    const adjustments = [{ id: 'a1', name: 'Trade-in', amount: 10_000, note: '', counted: true, effect: 'takes_off' as const, onDay: false, taxPercentText: null }];
    await harness({ method: 'cash', adjustments });
    for (const term of ['Price', 'Tax and fees', 'Trade-in or discount', 'Final price']) {
      expect(screen.getAllByLabelText(ABOUT(term)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Tax, fees and trade-ins')).toBeTruthy();
    expect(screen.getByText('Trade-in or discount')).toBeTruthy();
    expect(screen.getByText('Final price')).toBeTruthy();
    expect(screen.getByText('1 of 1 lines counted')).toBeTruthy();
  });

  it('D-84 an investment names its amount and how it is put in', async () => {
    await harness({ kind: 'invest', method: 'lump' });
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('How you put it in')).toBeTruthy();
  });

  const TERMS: [string, Partial<CheckInputs>][] = [
    ['How you pay', { method: 'cash' }],
    ['Paid in full', { method: 'cash' }],
    ['Deposit and loan', { method: 'cash' }],
    ['Instalment plan', { method: 'cash' }],
    ['On a card', { method: 'cash' }],
    ['Lump sum', { kind: 'invest', method: 'lump' }],
    ['Monthly contribution', { kind: 'invest', method: 'lump' }],
    ['Deposit', { method: 'loan' }],
    ['Loan term', { method: 'loan' }],
    ['Annual rate (APR)', { method: 'loan' }],
    ['Secured', { method: 'loan' }],
    ['How it gets cleared', { method: 'card' }],
  ];
  it.each(TERMS)('D-84 step 2 carries About {term} for %s', async (term, over) => {
    await harness(over);
    expect(screen.getAllByLabelText(ABOUT(term)).length).toBeGreaterThan(0);
  });

  it('D-84 an About sheet opens on a decided check', async () => {
    await harness({ method: 'cash' }, true);
    await fireEvent.press(screen.getAllByLabelText(ABOUT('Paid in full'))[0]!);
    expect(await screen.findByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
