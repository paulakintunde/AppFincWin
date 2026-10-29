// C-WR-06: an undo step's label is stored as a key plus params (data/ never formats copy).
// Rows with no name (Phase 1 rows, transfers, some imports) carry `{}`, and i18next leaves
// "{{name}}" in the output verbatim when the param is missing. undoLabelText must pick the
// nameless variant instead, and map the engine's `n` onto i18next's plural `count`.
import en from '../locales/en';
import { i18n } from '../index';
import { undoLabelText } from '../undoLabel';

const render = (labelKey: string, params: { n?: number; name?: string }): string => {
  const text = undoLabelText(labelKey, params);
  // The key is built at runtime, so it is outside the typed catalogue union (same as ToastText).
  return i18n.t(text.key as never, text.params) as string;
};

describe('undoLabelText (C-WR-06)', () => {
  it('uses the named template when the step carries a name', () => {
    expect(render('deleted', { name: 'Rent' })).toBe('Deleted · Rent');
    expect(render('markedPaid', { name: 'Netflix' })).toBe('Marked paid · Netflix');
  });

  it('never renders a raw placeholder for a nameless row', () => {
    expect(render('deleted', {})).toBe('Deleted');
    expect(render('markedPaid', {})).toBe('Marked paid');
    expect(render('skipped', {})).toBe('Skipped');
    expect(render('edited', { name: '' })).toBe('Edited');
  });

  it('maps n onto the plural count', () => {
    expect(render('imported', { n: 1 })).toBe('Imported 1 line');
    expect(render('imported', { n: 38 })).toBe('Imported 38 lines');
    expect(render('deletedMany', { n: 3 })).toBe('3 deleted');
  });

  it('every name-bearing label has a nameless variant, and no rendered label keeps a placeholder', () => {
    const labels = en.undo.label as Record<string, string>;
    for (const [key, template] of Object.entries(labels)) {
      if (!template.includes('{{name}}')) continue;
      expect((en.undo.labelUnnamed as Record<string, string>)[key]).toBeDefined();
      expect(render(key, {})).not.toMatch(/\{\{|\}\}/);
    }
  });
});

describe('05.2 undo labels (N-01)', () => {
  const keys = ['setupStepSaved','setupReset','incomeSetupSaved','unspentConfirmed','unspentCleared','emergencySaved','emergencyRemoved','accountUseSaved','paymentMarkedRegular','paymentDismissed','paymentRestored','savingRaised','incomeTypeSaved','incomeTagged','refundLinked','refundUnlinked','answerSaved','answerRemoved','refineSnoozed'];

  it('reads as a sentence-case label on its own', () => {
    expect(render('paymentDismissed', { name: 'Bookshop' })).toBe('Marked not regular · Bookshop');
    expect(render('paymentMarkedRegular', { name: 'Bookshop' })).toBe('Marked regular · Bookshop');
    expect(render('paymentRestored', { name: 'Bookshop' })).toBe('Not regular cleared · Bookshop');
    expect(render('paymentDismissed', {})).toBe('Marked not regular');
    expect(render('setupStepSaved', {})).toBe('Setup answer saved');
  });

  it('composes after "Undone · " with and without a name, with no raw placeholder', () => {
    for (const key of keys) {
      for (const params of [{ name: 'Bookshop' }, {}]) {
        const label = render(key, params);
        expect(label).toMatch(/^[A-Z]/);
        const text = i18n.t('undo.reverted', { label }) as string;
        expect(text).toBe('Undone · ' + label);
        expect(text).not.toMatch(/\{\{|\}\}/);
      }
    }
  });
});
