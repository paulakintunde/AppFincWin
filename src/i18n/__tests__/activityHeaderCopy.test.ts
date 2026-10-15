import { i18n } from '@/i18n';
import en from '@/i18n/locales/en';

function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).flatMap(leaves);
  }
  return [];
}

describe('Activity header copy contract (03.1)', () => {
  it('composes the summary caption from the Home wording', () => {
    expect(
      i18n.t('activity.summary.caption', {
        caption: i18n.t('home.month.caption'),
        entries: i18n.t('activity.months.entries', { count: 48 }),
      }),
    ).toBe('left after everything · 48 entries');
  });

  it('formats the narrowed and plain entry counts', () => {
    expect(i18n.t('activity.summary.entriesOf', { shown: 12, count: 48 })).toBe('12 of 48 entries');
    expect(i18n.t('activity.summary.entriesOf', { shown: 1, count: 1 })).toBe('1 of 1 entry');
    expect(i18n.t('activity.months.entries', { count: 48 })).toBe('48 entries');
  });

  it('formats filter, display and chip strings', () => {
    expect(i18n.t('activity.filter.iconActiveA11y', { count: 2 })).toBe('Filter, 2 active');
    expect(i18n.t('activity.filter.clearAll')).toBe('Clear all');
    expect(i18n.t('activity.display.chip', { view: 'By day', sort: 'Newest' })).toBe('By day · Newest');
    expect(i18n.t('activity.display.triggerA11y', { view: 'By day', sort: 'Newest' })).toBe(
      'By day · Newest, display options',
    );
    expect(i18n.t('activity.display.triggerA11yCalendar')).toBe('Calendar, display options');
    expect(i18n.t('activity.filterChip.openA11y', { label: 'Groceries' })).toBe(
      'Filter: Groceries. Opens filters.',
    );
    expect(i18n.t('activity.filterChip.removeA11y', { label: 'Groceries' })).toBe(
      'Remove filter Groceries',
    );
    expect(i18n.t('activity.filterChip.more', { label: 'Cash', count: 2 })).toBe('Cash +2');
  });

  it('formats search, title, month and menu strings', () => {
    expect(i18n.t('activity.searchIcon')).toBe('Search');
    expect(i18n.t('activity.search.cancel')).toBe('Cancel');
    expect(i18n.t('activity.search.cancelA11y')).toBe('Cancel search');
    expect(i18n.t('activity.compactTitle', { month: 'Oct' })).toBe('Activity · Oct');
    expect(i18n.t('activity.monthSwitcher.nameA11y', { month: 'October 2026' })).toBe(
      'October 2026, choose month',
    );
    expect(i18n.t('activity.more.select')).toBe('Select entries');
    expect(i18n.t('activity.more.cloneSub')).toBe('Lines that aren’t repeating');
    expect(i18n.t('activity.summary.stillToCome', { amount: '£612.00' })).toBe('£612.00 still to come');
  });

  it('keeps the declarative voice', () => {
    const a = en.activity as unknown as Record<string, unknown>;
    const all = [a.summary, a.display, a.filterChip, a.search, a.compactTitle, a.searchIcon].flatMap(leaves);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) expect(s).not.toMatch(/advice|recommend|you should/i);
  });
});
