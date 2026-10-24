// 05-104 (D-91, D-92, R16.7, R16.8): the card check limit box, the fee and block notes, and the On a card explanation.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { buy, stepProps, wrap } from './helpers/stepProps';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs, SnapshotResult } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const box = (method: string) => screen.getByTestId(`method-${method}`);

function cardInputs(over: Partial<CheckInputs> = {}): CheckInputs {
  const base = buy({ method: 'card' });
  return { ...base, card: { ...base.card, accountId: 'acc-card', payoff: 'full' }, ...over };
}

function sourceWith(over: Record<string, unknown>): SnapshotResult {
  return { ...loggedSource(), ...over } as SnapshotResult;
}

async function renderStep(inputs: CheckInputs, source: SnapshotResult) {
  const p: Step2Props = { ...stepProps(inputs, {}, source), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
  await wrap(<Step2PriceAndPay {...p} />);
  return p;
}

describe('CardPanel check limit (D-91)', () => {
  it('D-91 a large purchase shows the check limit and the cash rest', async () => {
    await renderStep(cardInputs({ advertised: 15_000_000 }), sourceWith({ cardMaxPurchase: minorUnits(10_000_000) }));
    const card = within(box('card'));
    expect(card.getByText('Only $100000 of this goes on a card in checks. The other $50000 is counted as cash on the day.')).toBeTruthy();
    expect(card.getByText('This is a limit of these checks, not of your card issuer.')).toBeTruthy();
    expect(card.getByText('Part on the card')).toBeTruthy();
    expect(card.getByRole('button', { name: 'About Card limit in checks' })).toBeTruthy();
    expect(card.queryByText(/dealer card cap/)).toBeNull();
  });

  it('D-91 the cap shown is the converted limit, and the USD-home explanation names the US$ limit', async () => {
    await renderStep(cardInputs({ advertised: 15_000_000 }), sourceWith({ cardMaxPurchase: minorUnits(7_800_000) }));
    expect(screen.getByText(/Only \$78000 of this goes on a card/)).toBeTruthy();
    await fireEvent.press(within(box('card')).getByRole('button', { name: 'About Card limit in checks' }));
    expect((await screen.findAllByText(/Checks count at most \$100000 of a purchase on a card\. It is a limit of this app/)).length).toBeGreaterThan(0); // the fixture home is USD: the USD-home variant
    expect(screen.queryByText(/\{\{/)).toBeNull();
  });

  it('D-91 the dealer cap copy shows when it is lower', async () => {
    const inputs = cardInputs({ itemType: 'vehicle', itemTypeTouched: true, advertised: 6_000_000 });
    await renderStep(inputs, sourceWith({ cardMaxPurchase: minorUnits(10_000_000) }));
    const card = within(box('card'));
    expect(card.getByText('A dealer card cap of $50000 applies. The other $10000 is counted as cash on the day.')).toBeTruthy();
    expect(card.queryByText(/Only .* of this goes on a card in checks/)).toBeNull();
    expect(card.queryByText('This is a limit of these checks, not of your card issuer.')).toBeNull();
  });

  it('D-91 no stored USD rate shows Needs: USD rate and no cap figure', async () => {
    await renderStep(cardInputs({ advertised: 15_000_000 }), sourceWith({ cardMaxPurchase: null }));
    expect(within(box('card')).getByText('Needs: USD rate')).toBeTruthy();
    expect(screen.queryByText(/Only .* of this goes on a card/)).toBeNull();
  });

  it('D-91 a purchase under the limit shows no limit copy', async () => {
    await renderStep(cardInputs({ advertised: 150_000 }), sourceWith({ cardMaxPurchase: minorUnits(10_000_000) }));
    expect(screen.queryByText(/of this goes on a card in checks/)).toBeNull();
    expect(within(box('card')).getByText('A card is accepted here')).toBeTruthy();
  });
});

describe('CardPanel notes (D-92)', () => {
  it('D-92 the tax note depends on the region', async () => {
    const gb = await renderStep(cardInputs({ itemType: 'tax', itemTypeTouched: true }), sourceWith({ region: 'GB' }));
    expect(within(box('card')).getByText('HMRC has not taken personal credit cards since 2018.')).toBeTruthy();
    expect(within(box('card')).getByText('This cannot go on a card')).toBeTruthy();
    expect(gb.update).not.toHaveBeenCalled();
  });

  it('D-92 tax outside GB is permitted with the processing-fee note', async () => {
    await renderStep(cardInputs({ itemType: 'tax', itemTypeTouched: true }), sourceWith({ region: 'US' }));
    expect(within(box('card')).getByText('Card payments for tax go through a payment processor that charges a fee. Any fee goes in Card fees.')).toBeTruthy();
    expect(within(box('card')).getByText('A card is accepted here')).toBeTruthy();
  });

  it('D-92 tuition shows its fee note and never fills Card fees', async () => {
    const p = await renderStep(cardInputs({ itemType: 'tuition', itemTypeTouched: true }), sourceWith({}));
    expect(within(box('card')).getByText('Card payments for tuition often carry a processing fee. Any fee goes in Card fees.')).toBeTruthy();
    expect(p.update).not.toHaveBeenCalled();
    expect(p.inputs.card.fees).toBeNull();
  });

  it('D-92 property is blocked with no fee note', async () => {
    await renderStep(cardInputs({ itemType: 'property', itemTypeTouched: true }), sourceWith({}));
    expect(within(box('card')).getByText('This cannot go on a card')).toBeTruthy();
    expect(within(box('card')).queryByText(/Any fee goes in Card fees/)).toBeNull();
  });
});

describe('On a card explanation (R16.10)', () => {
  it('R16 the On a card explanation shows the converted cap, never a placeholder', async () => {
    await renderStep(cardInputs(), sourceWith({ cardMaxPurchase: minorUnits(7_800_000) }));
    await fireEvent.press(within(box('card')).getByRole('button', { name: 'About On a card' }));
    expect(await screen.findByText(/At most \$78000 goes on a card in checks\./)).toBeTruthy();
    expect(screen.queryByText(/\{\{/)).toBeNull();
  });

  it('R16 with no limit the fallback body shows without a placeholder', async () => {
    await renderStep(cardInputs(), sourceWith({ cardMaxPurchase: null }));
    await fireEvent.press(within(box('card')).getByRole('button', { name: 'About On a card' }));
    expect(await screen.findByText(/Interest is counted at the rate on the card record\./)).toBeTruthy();
    expect(screen.queryByText(/goes on a card in checks/)).toBeNull();
    expect(screen.queryByText(/\{\{/)).toBeNull();
  });
});
