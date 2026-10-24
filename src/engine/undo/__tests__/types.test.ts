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

  it('has no duplicate label keys', () => {
    expect(new Set(UNDO_LABEL_KEYS).size).toBe(UNDO_LABEL_KEYS.length);
  });

  it('keeps its constants', () => {
    expect(NOW_SENTINEL).toBe('$now');
    expect(MAX_UNDO_OPS).toBe(6000);
  });

  it('accepts the Decide entities as UndoEntity', () => {
    const entities: UndoEntity[] = ['decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals'];
    expect(entities).toHaveLength(5);
  });
});
