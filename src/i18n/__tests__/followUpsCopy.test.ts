import { i18n } from '../index';

describe('02.3 follow-ups copy', () => {
  const t = i18n.t.bind(i18n);

  it('pluralises the import overlap line', () => {
    expect(t('importCsv.mode.overlap', { count: 1 })).toBe('This statement overlaps 1 line you already have.');
    expect(t('importCsv.mode.overlap', { count: 24 })).toBe('This statement overlaps 24 lines you already have.');
  });

  it('renders counted labels', () => {
    expect(t('importCsv.missing.commit', { count: 3 })).toBe('Add 3 lines');
    expect(t('record.sheet.list.save', { count: 1 })).toBe('Save 1 entry');
    expect(t('record.sheet.draft.title', { count: 2 })).toBe('You have 2 unsaved entries');
    expect(t('undo.label.addedMany', { count: 4 })).toBe('Added 4 entries');
  });

  it('renders fixed strings with curly punctuation', () => {
    expect(t('auth.welcome.remove')).toBe('Not you? Remove');
    expect(t('importCsv.mode.reconcile')).toBe('Find what’s missing');
    expect(t('categories.rules.sheet.duplicate', { keyword: 'Tesco' })).toBe('There’s already a rule for “Tesco”.');
  });
});
