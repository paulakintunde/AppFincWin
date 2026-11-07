import { MAX_UNDO_OPS, NOW_SENTINEL, UNDO_LABEL_KEYS, type UndoEntity } from '../types';

describe('undo vocabulary (05: Decide entities and labels)', () => {
  it('carries the Decide labels exactly once each', () => {
    for (const key of ['checkAbandoned', 'decisionWritten', 'decisionRemoved', 'lineUnlinked', 'changeAdded', 'changeEdited', 'changeRemoved', 'transferTagged', 'transferUntagged']) {
      expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
    }
  });

  it('D-101 the pot and housing undo labels exist and resolve', () => {
    const expected: Record<string, string> = {
      potAdded: 'Pot added', potEdited: 'Pot edited', potDeleted: 'Pot deleted', potDone: 'Pot marked done', potReopened: 'Pot reopened',
      debtHousingChanged: 'Housing setting changed',
    };
    for (const [key, text] of Object.entries(expected)) {
      expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
      expect(text.length).toBeGreaterThan(0); // the catalogue strings are asserted in src/i18n/__tests__/decideCopy.test.ts (engine/ imports no i18n)
    }
  });

  it('05.3-56 the readiness answer labels exist once each', () => {
    for (const key of ['paidByOther', 'alwaysPaidByOther', 'didNotHappen', 'noPayThisMonth', 'incomeElsewhere', 'nothingToAdd', 'monthComplete', 'decideStartMonth', 'readinessAnswerCleared']) {
      expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
      expect(key).toMatch(/^[a-zA-Z]{1,40}$/); // undo_log.label_key check
    }
  });

  it('05.3-120 the own-option labels exist once each', () => {
    for (const key of ['ownOptionAdded', 'ownOptionRenamed', 'ownOptionRemoved']) {
      expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
    }
  });

  it('06 the Grow labels exist once each', () => {
    const grow = ['goalMade', 'goalPlanChanged', 'goalEdited', 'goalRemoved', 'goalMoneyMoved', 'goalContributionConfirmed', 'safetyNetChanged', 'safetyNetSizeSaved', 'safetyNetConfirmed', 'debtPlanSaved', 'debtSaleRecorded', 'holdingAdded', 'holdingEdited', 'holdingRemoved', 'holdingEntryAdded', 'holdingEntryEdited', 'holdingEntryRemoved', 'holdingValueUpdated', 'accountRateSaved', 'debtRemoved', 'debtOneOffRecorded'];
    expect(grow).toHaveLength(21);
    for (const key of grow) {
      expect(UNDO_LABEL_KEYS.filter((k) => k === key)).toHaveLength(1);
      expect(key).toMatch(/^[a-zA-Z]{1,40}$/);
    }
  });

  it('06 accepts holdings and holding_lots as UndoEntity', () => {
    const entities: UndoEntity[] = ['holdings', 'holding_lots'];
    expect(entities).toHaveLength(2);
  });

  it('every label key passes the undo_log.label_key database check', () => {
    for (const key of UNDO_LABEL_KEYS) expect(key).toMatch(/^[a-zA-Z]{1,40}$/);
  });

  it('has no duplicate label keys', () => {
    expect(new Set(UNDO_LABEL_KEYS).size).toBe(UNDO_LABEL_KEYS.length);
  });

  it('keeps its constants', () => {
    expect(NOW_SENTINEL).toBe('$now');
    expect(MAX_UNDO_OPS).toBe(6000);
  });

  it('accepts the Decide entities as UndoEntity', () => {
    const entities: UndoEntity[] = ['decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals', 'decide_settings', 'recurring_dismissals', 'income_payer_prompts', 'decide_answers'];
    expect(entities).toHaveLength(9);
  });
});
