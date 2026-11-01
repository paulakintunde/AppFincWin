/** Plan 05.3-25: NoticeTiles picks the D-46 / D-48 variants, writes months and money, resolves ids to names, keeps engine order. */
import React from 'react';
import { screen } from '@testing-library/react-native';
import type { Notice } from '@/engine/decide/v3';
import { NoticeTiles } from '../NoticeTiles';
import { wrap } from './kit';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [{ id: 'cat-1', name: 'Groceries', builtin_key: null }] }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [{ id: 'ser-1', name: 'Car insurance' }] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));

const n = (code: Notice['code'], values: Notice['values']): Notice => ({ code, values });

function allText(): string {
  return screen
    .getAllByText(/./, { includeHiddenElements: true })
    .map((t) => String(t.props.children))
    .join(' | ');
}

describe('NoticeTiles', () => {
  it('renders nothing for no notices', async () => {
    await wrap(<NoticeTiles notices={[]} />);
    expect(screen.toJSON()).toBeTruthy();
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('envelope_location_assumed with count 1 reads the singular form; 3 reads the plural', async () => {
    await wrap(<NoticeTiles notices={[n('envelope_location_assumed', { count: 1 })]} />);
    expect(screen.getByText('1 envelope isn’t linked to an account yet, so its money is kept out of spare money.')).toBeTruthy();
    await wrap(<NoticeTiles notices={[n('envelope_location_assumed', { count: 3 })]} />);
    expect(screen.getByText(/^3 envelopes aren’t linked/)).toBeTruthy();
  });

  it('income_volatile with one lean month of -870 reads "overspent" with no minus sign and no "May to May"', async () => {
    await wrap(
      <NoticeTiles
        notices={[
          n('income_volatile', { payment: 20000, periods: 12, monthly: 20000, months: 12, leanFrom: '2026-05', leanTo: '2026-05', leanLeft: -87000 }),
        ]}
      />,
    );
    const text = allText();
    expect(text).toContain('your leanest month, May, is about $870 overspent.');
    expect(text).not.toMatch(/-\$/);
    expect(text).not.toMatch(/May to May/);
    expect(text).not.toMatch(/\{\{/);
  });

  it('income_volatile across two lean months with money left reads "to" and "leave about"', async () => {
    await wrap(
      <NoticeTiles
        notices={[n('income_volatile', { payment: 20000, periods: 12, monthly: 20000, months: 12, leanFrom: '2026-05', leanTo: '2026-06', leanLeft: 15000 })]}
      />,
    );
    expect(allText()).toContain('your leanest months, May to June, leave about $150.');
  });

  it('month_heading_short with a category id shows the category name, never the id', async () => {
    await wrap(
      <NoticeTiles notices={[n('month_heading_short', { month: '2026-10', short: 12000, categoryId: 'cat-1', largest: 8000 })]} />,
    );
    const text = allText();
    expect(text).toContain('October is heading about $120 overspent, mostly Groceries ($80).');
    expect(text).not.toContain('cat-1');
  });

  it('month_heading_short without a largest line reads the plain form', async () => {
    await wrap(<NoticeTiles notices={[n('month_heading_short', { month: '2026-10', short: 12000 })]} />);
    expect(allText()).toContain('October is heading about $120 overspent.');
  });

  it('yearly_bill_choice_needed resolves the series id to its name', async () => {
    await wrap(<NoticeTiles notices={[n('yearly_bill_choice_needed', { seriesId: 'ser-1' })]} />);
    expect(allText()).toContain('Car insurance');
    expect(allText()).not.toContain('ser-1');
  });

  it('keeps the engine order and adds nothing', async () => {
    await wrap(
      <NoticeTiles
        notices={[n('emergency_not_set', {}), n('unspent_stale', { days: 40 }), n('from_your_figures', {})]}
      />,
    );
    const texts = screen.getAllByText(/./, { includeHiddenElements: true }).map((t) => String(t.props.children));
    expect(texts).toEqual([
      'An emergency fund goal isn’t set yet.',
      'Your unspent money was confirmed 40 days ago.',
      'Worked out from the figures you gave.',
    ]);
  });

  // 05.3-121 (UAT gap 38): six lightly logged months showed six tiles on the device; they read as one tile now.
  it('merges six under-logged months into one tile, months in month order', async () => {
    const months = ['2025-11', '2025-12', '2026-01', '2026-04', '2026-05', '2026-10'];
    await wrap(<NoticeTiles notices={months.map((month) => n('month_looks_under_logged', { month }))} />);
    const sentence = 'November, December, January, April, May and October look lightly logged, so their figures could be low.';
    const texts = screen.getAllByText(/./, { includeHiddenElements: true }).map((t) => String(t.props.children));
    expect(texts).toEqual([sentence]);
    expect(screen.getByLabelText(sentence)).toBeTruthy();
  });

  it('two under-logged months read "A and B"', async () => {
    await wrap(
      <NoticeTiles notices={[n('month_looks_under_logged', { month: '2025-12' }), n('month_looks_under_logged', { month: '2025-11' })]} />,
    );
    expect(allText()).toBe('November and December look lightly logged, so their figures could be low.');
  });

  it('one under-logged month keeps today’s text', async () => {
    await wrap(<NoticeTiles notices={[n('month_looks_under_logged', { month: '2026-10' })]} />);
    expect(allText()).toBe('October looks lightly logged, so its figures could be low.');
    expect(screen.getByLabelText('October looks lightly logged, so its figures could be low.')).toBeTruthy();
  });

  it('the merged tile takes the first one’s place; other notices keep their own tiles and order', async () => {
    await wrap(
      <NoticeTiles
        notices={[
          n('emergency_not_set', {}),
          n('month_looks_under_logged', { month: '2026-01' }),
          n('unspent_stale', { days: 40 }),
          n('month_looks_under_logged', { month: '2025-12' }),
        ]}
      />,
    );
    const texts = screen.getAllByText(/./, { includeHiddenElements: true }).map((t) => String(t.props.children));
    expect(texts).toEqual([
      'An emergency fund goal isn’t set yet.',
      'December and January look lightly logged, so their figures could be low.',
      'Your unspent money was confirmed 40 days ago.',
    ]);
  });

  it('writes a due date for a pay that has not arrived', async () => {
    await wrap(<NoticeTiles notices={[n('pay_not_seen', { amount: 250000, date: '2026-10-28' })]} />);
    const text = allText();
    expect(text).toContain('$2,500');
    expect(text).not.toMatch(/2026-10-28/);
  });
});
