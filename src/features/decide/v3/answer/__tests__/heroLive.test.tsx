/** Plan 05.3-25: the hero's live-region label settles after ~150 ms, and updates at once when the chip changes. */
import React from 'react';
import { act, screen } from '@testing-library/react-native';
import { AnswerHero } from '../AnswerHero';
import { NINE, ev, wrap } from './kit';

jest.setTimeout(60000);

jest.mock('@/ui/haptics', () => ({ hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ all: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));

const labelNow = (): string => String(screen.getByLabelText(/\./).props.accessibilityLabel);
const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

describe('hero live region', () => {
  it('same chip, new numbers: the visible text moves now, the label after the settle', async () => {
    const a = ev({ code: 'fits_month' });
    const b = { ...a, month: { ...a.month, monthLeft: 31000 } } as typeof a;
    const { rerender } = await wrap(<AnswerHero evaluation={a} />);
    await wait(250);
    expect(labelNow()).toMatch(/425 dollars/);
    await rerender(<AnswerHero evaluation={b} />);
    expect(screen.getByText(/about \$310/)).toBeTruthy();
    expect(labelNow()).toMatch(/425 dollars/);
    await wait(250);
    expect(labelNow()).toMatch(/310 dollars/);
    expect(labelNow()).not.toMatch(/425 dollars/);
  });

  it('a chip change updates the label at once', async () => {
    const { rerender } = await wrap(<AnswerHero evaluation={NINE[0]!.ev} />);
    await wait(250);
    await rerender(<AnswerHero evaluation={NINE[6]!.ev} />);
    expect(labelNow()).toMatch(/^Overspent each month\./);
  });
});
