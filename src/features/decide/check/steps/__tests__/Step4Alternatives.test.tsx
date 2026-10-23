import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { percent } from '@/engine/decide';
import type { AlternativeRow, Alternatives, SuppressionCode } from '@/engine/decide';
import { Step4Alternatives } from '../Step4Alternatives';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs } from '../../../snapshot/types';
import type { StepProps } from '../../stepTypes';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));

const loan: Partial<CheckInputs> = {
  advertised: 600_000,
  method: 'loan',
  loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
};

function props(over: Partial<CheckInputs> = {}, extra: Partial<StepProps> = {}): StepProps {
  return stepProps(buy({ ...loan, ...over }), extra);
}

/** The real computation with one row (and optionally the cheaper detail) replaced. */
function patchRow(p: StepProps, index: 0 | 1 | 2 | 3, patch: Partial<AlternativeRow>, alts: Partial<Alternatives> = {}): StepProps {
  const a = p.computation.alternatives!;
  const rows = a.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) as unknown as Alternatives['rows'];
  return { ...p, computation: { ...p.computation, alternatives: { ...a, ...alts, rows } } };
}

describe('Step4Alternatives', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows four rows in engine order with the three figures', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getByText('Four ways, same 12 months')).toBeTruthy();
    for (const name of ['As planned', 'Cheaper one', 'Wait and save', 'Not buying it']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.getAllByText('On the day').length).toBe(4);
    expect(screen.getAllByText('A month').length).toBe(4);
    expect(screen.getAllByText('Kept').length).toBe(5); // four columns and the header with its ⓘ
    // the month column carries cents, the day and kept columns do not
    expect(screen.getAllByLabelText('A month, $527.50').length).toBe(3);
    expect(screen.getByLabelText('Kept, $2215')).toBeTruthy();
  });

  it('as planned shows a dash in Kept and no reason line', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getAllByLabelText('Kept, —').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/short/)).toBeNull();
  });

  it('the cheaper descriptor says the deposit is scaled for a loan', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getByText('$3900 · deposit scaled to match')).toBeTruthy();
  });

  it('the cheaper descriptor says the instalments are scaled for an instalment plan', async () => {
    const p = props({ method: 'instalment', instalment: { amount: 55_000, count: 12, lateFee: null } });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText(/instalments scaled to match/)).toBeTruthy();
  });

  it('a cash check names the method in the cheaper descriptor', async () => {
    await wrap(<Step4Alternatives {...props({ method: 'cash', advertised: 150_000 })} />);
    expect(screen.getAllByText(/· Paid in full/).length).toBeGreaterThan(0);
  });

  describe.each<[SuppressionCode, number | null, RegExp]>([
    ['month_short', 5_000, /Month still \$50 short on this plan/],
    ['too_thin', 5_000, /Only \$50 a month left — too thin to count/],
    ['nothing_freed', null, /Nothing freed against buying as planned/],
    ['past_horizon', null, /Takes 2 months — past the 12-month horizon/],
    ['nothing_spare', null, /No cash above cushion, no monthly surplus/],
  ])('suppression %s', (code, amount, text) => {
    it('shows a dash in Kept and exactly one reason line', async () => {
      const p = patchRow(props(), 1, { suppression: { code, amount: amount as never }, projected: null, contributed: null, growth: null });
      await wrap(<Step4Alternatives {...p} />);
      expect(screen.getAllByText(text).length).toBe(1);
      expect(screen.getAllByLabelText('Kept, —').length).toBe(2); // as planned and the suppressed row
    });
  });

  it('a suppressed wait row uses the generic month-short wording', async () => {
    const p = patchRow(props(), 2, { suppression: { code: 'month_short', amount: 7_000 as never }, projected: null });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText('Month is $70 short — nothing spare')).toBeTruthy();
  });

  it('an out-of-range kept figure reads too large', async () => {
    const p = patchRow(props(), 1, { projected: null, growth: null, rangeCode: 'exceeds_range' });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText('Too large to project at this rate')).toBeTruthy();
    expect(screen.getAllByLabelText('Kept, —').length).toBe(2);
  });

  it('the trade line survives an out-of-range figure', async () => {
    const p = patchRow(props({ cheaperPrice: 390_000 }), 1, { projected: null, growth: null, rangeCode: 'exceeds_range' });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText(/too large to project at this rate/)).toBeTruthy();
    expect(screen.queryByText(/null|NaN/)).toBeNull();
  });

  it('the trade line is idle until the slider is used', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getByText('The trade appears as the slider moves.')).toBeTruthy();
  });

  it('the trade line states what is kept once a ratio is chosen', async () => {
    await wrap(<Step4Alternatives {...props({ cheaperPrice: 390_000 })} />);
    expect(screen.getByText(/leaves \$0 today and \$184.62 a month kept\. Kept up until month 12, that is \$2215 — \$2215 of your own money\.$/)).toBeTruthy();
  });

  it('the trade line adds growth only when a rate is set', async () => {
    const p = props({ cheaperPrice: 390_000, projectionRates: ['5'] });
    const grown = patchRow(p, 1, { projected: 230_000 as never, growth: 8_456 as never }, { projectionReturn: percent('5') });
    await wrap(<Step4Alternatives {...grown} />);
    expect(screen.getByText(/of your own money and \$85 it earned\.$/)).toBeTruthy();
  });

  it('a thin month reads the thin trade line', async () => {
    const p = patchRow(props({ cheaperPrice: 390_000 }), 1, {}, { cheaper: { ...props().computation.alternatives!.cheaper, keptMonthly: 0 as never } });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText(/lowers the payment from .* to .*, but the month still only leaves/)).toBeTruthy();
  });

  it('the slider writes the cheaper ratio', async () => {
    const p = props();
    await wrap(<Step4Alternatives {...p} />);
    const slider = screen.getByLabelText('Cheaper price');
    expect(slider.props.accessibilityValue.text).toBe('65 percent of $6000');
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(p.update).toHaveBeenCalledWith({ cheaperPrice: 396_000 });
  });

  it('shows the cheaper price and what is not spent', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    expect(screen.getByText('$3900')).toBeTruthy();
    expect(screen.getByText('$2100')).toBeTruthy();
    expect(screen.getByText('$184.62 a month, nothing on the day')).toBeTruthy();
  });

  it('Use the cheaper price reprices and keeps the loan deposit scaled', async () => {
    const p = props({ loan: { ...loan.loan!, deposit: 100_000 } });
    await wrap(<Step4Alternatives {...p} />);
    await fireEvent.press(screen.getByLabelText('Use the cheaper price'));
    expect(p.update).toHaveBeenCalledTimes(1);
    const patch = (p.update as jest.Mock).mock.calls[0][0];
    expect(patch.advertised).toBe(390_000);
    expect(patch.loan.deposit).toBe(65_000);
  });

  it('Wait and save chooses wait and jumps to step 5', async () => {
    const p = props();
    await wrap(<Step4Alternatives {...p} />);
    await fireEvent.press(screen.getByLabelText('Wait and save', { exact: true }));
    expect(p.update).toHaveBeenCalledWith({ outcome: 'wait' });
    expect(p.goToStep).toHaveBeenCalledWith(5);
  });

  it('+ Add a rate reveals the field and a valid rate is appended to the rate list', async () => {
    const p = props();
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getByText('Kept at 0% unless you add a rate')).toBeTruthy();
    await fireEvent.press(screen.getByText('+ Add a rate'));
    const field = screen.getByLabelText('Return, percent');
    await fireEvent.changeText(field, '5');
    await fireEvent(field, 'blur');
    expect(p.update).toHaveBeenCalledWith({ projectionRates: ['5'] });
  });

  it('WR-C04: a typed rate never blurred is committed when the step is left, once', async () => {
    const p = props();
    const view = await wrap(<Step4Alternatives {...p} />);
    await fireEvent.press(screen.getByText('+ Add a rate'));
    await fireEvent.changeText(screen.getByLabelText('Return, percent'), '6');
    expect(p.update).not.toHaveBeenCalled();
    await view.unmount();
    expect(p.update).toHaveBeenCalledTimes(1);
    expect(p.update).toHaveBeenCalledWith({ projectionRates: ['6'] });
  });

  it('a rate above 100% is refused with its hint', async () => {
    const p = props();
    await wrap(<Step4Alternatives {...p} />);
    await fireEvent.press(screen.getByText('+ Add a rate'));
    const field = screen.getByLabelText('Return, percent');
    await fireEvent.changeText(field, '150');
    expect(screen.getByText('Up to 100% a year')).toBeTruthy();
    await fireEvent(field, 'blur');
    expect(p.update).not.toHaveBeenCalled();
  });

  it('a set rate renames the header, shows the chip and removing it clears the first rate', async () => {
    const p = props({ projectionRates: ['5', '7'] });
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.getAllByText('Kept, at 5%').length).toBe(5);
    expect(screen.getByText('Kept, at 5% a year')).toBeTruthy();
    expect(screen.getByText('5% a year')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove the rate'));
    expect(p.update).toHaveBeenCalledWith({ projectionRates: ['7'] });
  });

  it('the rate chip draws the shared close glyph, never a literal ×', async () => {
    await wrap(<Step4Alternatives {...props({ projectionRates: ['5'] })} />);
    const chip = screen.getByLabelText('Remove the rate');
    expect(within(chip).getByTestId('rate-chip-remove', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('×')).toBeNull();
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it('+ Add a rate is hidden at three rates', async () => {
    await wrap(<Step4Alternatives {...props({ projectionRates: ['1', '2', '3'] })} />);
    expect(screen.queryByText('+ Add a rate')).toBeNull();
  });

  it('never says keeps earning and never draws a lock', async () => {
    const view = await wrap(<Step4Alternatives {...props()} />);
    expect(JSON.stringify(view.toJSON()).toLowerCase()).not.toContain('keeps earning');
  });

  it('renders nothing when there are no alternatives', async () => {
    const p = stepProps(buy({ advertised: null }));
    await wrap(<Step4Alternatives {...p} />);
    expect(screen.queryByText(/Four ways/)).toBeNull();
  });

  it('D-76 step 4 descriptors and reasons are not clamped', async () => {
    const p = patchRow(props(), 1, { suppression: { code: 'month_short', amount: 5_000 as never }, projected: null, contributed: null, growth: null });
    await wrap(<Step4Alternatives {...p} />, 1.6);
    expect(screen.getByText('$3900 · deposit scaled to match').props.numberOfLines).toBeUndefined();
    expect(screen.getByText(/Month still \$50 short on this plan/).props.numberOfLines).toBeUndefined();
  });

  describe('D-83 the exact cheaper price', () => {
    const big = { advertised: 200_000 };
    const field = () => screen.getByLabelText('Cheaper price, custom, amount');

    it('D-83 a typed cheaper price is applied exactly, never snapped', async () => {
      const p = props(big);
      await wrap(<Step4Alternatives {...p} />);
      await fireEvent.changeText(field(), '1234.56');
      expect(p.update).toHaveBeenLastCalledWith({ cheaperPrice: 123_456 });
    });

    it('D-83 the engine row follows the typed amount exactly', async () => {
      const p = props({ ...big, cheaperPrice: 123_456 });
      expect(p.computation.alternatives!.cheaper.ratioPercent).toBe(62);
      await wrap(<Step4Alternatives {...p} />);
      expect(field().props.value).toBe('1234.56');
      expect(screen.getByText('62% of $2000')).toBeTruthy();
    });

    it('D-83 the slider percent is display only', async () => {
      const p = props({ ...big, cheaperPrice: 100_000 });
      await wrap(<Step4Alternatives {...p} />);
      const slider = screen.getByLabelText('Cheaper price', { exact: true });
      expect(slider.props.accessibilityValue.text).toBe('50 percent of $2000');
      await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
      expect(p.update).toHaveBeenCalledWith({ cheaperPrice: 102_000 });
    });

    it('D-83 Use the cheaper price writes the exact amount', async () => {
      const p = props({ ...big, cheaperPrice: 123_456 });
      await wrap(<Step4Alternatives {...p} />);
      await fireEvent.press(screen.getByLabelText('Use the cheaper price'));
      const patch = (p.update as jest.Mock).mock.calls[0][0];
      expect(patch.advertised).toBe(123_456);
    });

    it('D-83 after Use the cheaper price the typed cheaper amount is reset to the default', async () => {
      const p = props({ ...big, cheaperPrice: 123_456 });
      await wrap(<Step4Alternatives {...p} />);
      await fireEvent.press(screen.getByLabelText('Use the cheaper price'));
      const patch = (p.update as jest.Mock).mock.calls[0][0];
      expect(patch).toHaveProperty('cheaperPrice', null);
    });

    it('D-71 a cheaper amount under ceil(30%) of the price is refused', async () => {
      const p = props(big);
      await wrap(<Step4Alternatives {...p} />);
      await fireEvent.changeText(field(), '599.99');
      expect(p.update).not.toHaveBeenCalled();
      expect(screen.getByText('From $600.00 to $2000.00')).toBeTruthy();
      await fireEvent.changeText(field(), '600');
      expect(p.update).toHaveBeenLastCalledWith({ cheaperPrice: 60_000 });
      expect(screen.queryByText('From $600.00 to $2000.00')).toBeNull();
    });

    it('D-71 an amount above the advertised price is refused', async () => {
      const p = props(big);
      await wrap(<Step4Alternatives {...p} />);
      await fireEvent.changeText(field(), '2000.01');
      expect(p.update).not.toHaveBeenCalled();
    });
  });

  it('D-70 the Kept header carries its ⓘ', async () => {
    await wrap(<Step4Alternatives {...props()} />);
    await fireEvent.press(screen.getByLabelText('About Kept'));
    expect(screen.getByText(/The money that stays yours on that route/)).toBeTruthy();
  });
});
