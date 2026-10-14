import { i18n } from '@/i18n';
import en from '@/i18n/locales/en';

function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).flatMap(leaves);
  }
  return [];
}

describe('Phase 3 copy contract', () => {
  it('formats the tab accessibility label', () => {
    expect(i18n.t('shell.tab.a11y', { label: 'Decide', position: 3, total: 5 })).toBe(
      'Decide, tab, 3 of 5'
    );
  });

  it('has the five tab labels and Profile', () => {
    expect(
      ['home', 'activity', 'decide', 'grow', 'insights'].map((k) =>
        i18n.t(`shell.tab.${k}` as 'shell.tab.home')
      )
    ).toEqual(['Home', 'Activity', 'Decide', 'Grow', 'Insights']);
    expect(i18n.t('shell.profile')).toBe('Profile');
  });

  it('has the FAB and quick-add copy', () => {
    expect(i18n.t('shell.fab.add')).toBe('Add');
    expect(i18n.t('shell.fab.addA11y')).toBe('Add a transaction');
    expect(i18n.t('shell.quick.title')).toBe('Quick add');
    expect(i18n.t('shell.quick.addExpense')).toBe('Add expense');
    expect(i18n.t('shell.quick.addIncome')).toBe('Add income');
    expect(i18n.t('shell.quick.transfer')).toBe('Transfer');
    expect(i18n.t('shell.quick.newCheck')).toBe('New check');
    expect(i18n.t('shell.quick.importStatement')).toBe('Import statement');
  });

  it('has the discard dialog copy', () => {
    expect(i18n.t('sheet.discard.title')).toBe('Discard changes?');
    expect(i18n.t('sheet.discard.body')).toBe('Changes on this sheet haven’t been saved.');
    expect(i18n.t('sheet.discard.keep')).toBe('Keep editing');
    expect(i18n.t('sheet.discard.confirm')).toBe('Discard');
  });

  it('has the refresh toasts', () => {
    expect(i18n.t('refresh.updated')).toBe('Prices and balances up to date');
    expect(i18n.t('refresh.nothingNew')).toBe('Up to date — nothing new to pull');
  });

  it('has the Home copy', () => {
    expect(i18n.t('home.title')).toBe('Overview');
    expect(i18n.t('home.upcoming.empty', { month: 'Sep' })).toBe('Nothing outstanding in Sep.');
    expect(i18n.t('home.upcoming.payA11y', { name: 'Rent' })).toBe('Pay Rent, mark as paid');
    expect(i18n.t('home.upcoming.pay')).toBe('Pay');
    expect(i18n.t('home.month.heading')).toBe('This month');
    expect(i18n.t('home.upcoming.heading')).toBe('Coming up');
    expect(i18n.t('home.accounts.heading')).toBe('Accounts');
  });

  it('has the gap-closure copy', () => {
    expect(i18n.t('home.upcoming.projected')).toBe('Expected');
    expect(i18n.t('home.upcoming.projected')).toBe(i18n.t('record.recurring.projected'));
    expect(i18n.t('home.month.emptyPast', { month: 'September' })).toBe(
      'Nothing recorded in September.'
    );
    expect(i18n.t('home.state.monthError')).toBe('This month couldn’t load. Pull down to try again.');
    expect(i18n.t('home.state.monthOffline')).toBe(
      'You’re offline, and this month hasn’t loaded on this device yet.'
    );
    expect(i18n.t('home.state.upcomingError')).toBe('Bills due couldn’t load.');
    expect(i18n.t('home.state.upcomingOffline')).toBe('Bills due will show once this month loads.');
    expect(i18n.t('accounts.compact.overdrawn')).toBe('Overdrawn');
    expect(i18n.t('accounts.compact.overLimit')).toBe('Over limit');
    expect(i18n.t('activity.unpaidBanner.text')).toBe('Showing unpaid bills');
    expect(i18n.t('activity.unpaidBanner.clear')).toBe('Clear');
    expect(i18n.t('activity.unpaidBanner.clearA11y')).toBe('Clear the unpaid filter');
    expect(
      i18n.t('activity.projection.a11y', { name: 'Rent', amount: '£900.00', date: '1 Nov 2026' })
    ).toBe('Rent, £900.00, expected 1 Nov 2026');
  });

  it('drops the unused keys', () => {
    for (const key of [
      'shell.fab.newCheck',
      'shell.fab.newCheckA11y',
      'shell.title.decide',
      'shell.title.grow',
      'shell.title.insights',
    ]) {
      expect(i18n.exists(key)).toBe(false);
    }
  });

  it('never uses advice wording', () => {
    const all = [
      en.shell,
      en.sheet,
      en.refresh,
      en.home,
      en.activity.unpaidBanner,
      en.activity.projection,
      en.accounts.compact,
    ].flatMap(leaves);
    expect(all.length).toBeGreaterThan(40);
    for (const value of all) {
      expect(value).not.toMatch(/advice|recommend|you should/i);
    }
  });
});
