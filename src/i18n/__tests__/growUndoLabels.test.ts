/**
 * 06-09 Task 3: the Grow undo vocabulary is registered once, resolves in plain English with and without a name,
 * and stays free of advice wording (T-06-09-03, T-06-09-04).
 */
import { UNDO_LABEL_KEYS } from '../../engine/undo/types';
import en from '../locales/en';
import { undoLabelText } from '../undoLabel';

const GROW_UNDO_KEYS: Record<string, { named: string; unnamed?: string }> = {
  goalMade: { named: 'Goal made · {{name}}', unnamed: 'Goal made' },
  goalPlanChanged: { named: 'Goal plan changed · {{name}}', unnamed: 'Goal plan changed' },
  goalEdited: { named: 'Goal edited · {{name}}', unnamed: 'Goal edited' },
  goalRemoved: { named: 'Goal removed · {{name}}', unnamed: 'Goal removed' },
  goalMoneyMoved: { named: 'Money moved · {{name}}', unnamed: 'Money moved' },
  goalContributionConfirmed: { named: 'Monthly amount confirmed · {{name}}', unnamed: 'Monthly amount confirmed' },
  safetyNetChanged: { named: 'Safety net changed · {{name}}', unnamed: 'Safety net changed' },
  safetyNetSizeSaved: { named: 'Safety net size saved' },
  safetyNetConfirmed: { named: 'Safety net confirmed' },
  debtPlanSaved: { named: 'Payoff plan saved · {{name}}', unnamed: 'Payoff plan saved' },
  debtSaleRecorded: { named: 'Sale recorded · {{name}}', unnamed: 'Sale recorded' },
  holdingAdded: { named: 'Holding added · {{name}}', unnamed: 'Holding added' },
  holdingEdited: { named: 'Holding edited · {{name}}', unnamed: 'Holding edited' },
  holdingRemoved: { named: 'Holding removed · {{name}}', unnamed: 'Holding removed' },
  holdingEntryAdded: { named: 'Entry added · {{name}}', unnamed: 'Entry added' },
  holdingEntryEdited: { named: 'Entry edited · {{name}}', unnamed: 'Entry edited' },
  holdingEntryRemoved: { named: 'Entry removed · {{name}}', unnamed: 'Entry removed' },
  holdingValueUpdated: { named: 'Value updated · {{name}}', unnamed: 'Value updated' },
  accountRateSaved: { named: 'Interest rate saved · {{name}}', unnamed: 'Interest rate saved' },
  debtRemoved: { named: 'Debt removed · {{name}}', unnamed: 'Debt removed' },
  debtOneOffRecorded: { named: 'One-off payment · {{name}}', unnamed: 'One-off payment recorded' },
};

const BANNED = /\b(advice|advise|recommend\w*|should|best|better|optimal)\b/i;
const label = en.undo.label as Readonly<Record<string, string>>;
const labelUnnamed = en.undo.labelUnnamed as Readonly<Record<string, string>>;

describe('Grow undo labels', () => {
  it('registers exactly 21 Grow keys', () => {
    expect(Object.keys(GROW_UNDO_KEYS)).toHaveLength(21);
  });

  it.each(Object.entries(GROW_UNDO_KEYS))('%s is registered once with exact English', (key, texts) => {
    expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
    expect(label[key]).toBe(texts.named);
    expect(key).toMatch(/^[a-zA-Z]{1,40}$/);
    if (texts.named.includes('{{name}}')) {
      expect(undoLabelText(key, {}).key).toBe(`undo.labelUnnamed.${key}`);
      expect(labelUnnamed[key]).toBe(texts.unnamed);
      expect(undoLabelText(key, { name: 'Trip' }).key).toBe(`undo.label.${key}`);
    } else {
      expect(undoLabelText(key, {}).key).toBe(`undo.label.${key}`);
      expect(labelUnnamed[key]).toBeUndefined();
    }
  });

  it.each(Object.entries(GROW_UNDO_KEYS))('%s holds no advice wording or literal money', (key, texts) => {
    for (const text of [texts.named, texts.unnamed ?? '']) {
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(/\$\s?\d/);
    }
    expect(label[key]).not.toMatch(BANNED);
    expect(labelUnnamed[key] ?? '').not.toMatch(BANNED);
  });
});
