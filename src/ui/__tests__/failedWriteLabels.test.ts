import { failedEntityKey, failedReasonKey } from '../failedWriteLabels';

describe('failedReasonKey', () => {
  it('reads a failed reopen copy as copyNotSaved whatever its kind', () => {
    const attempted = { op: 'create', reopenedFrom: 'k1' };
    for (const kind of ['rejected', 'not-found', 'conflict'] as const) {
      expect(failedReasonKey({ kind, code: '42501', entity: 'decide_checks', attempted })).toBe('sync.failedSheet.reason.copyNotSaved');
    }
  });

  it('keeps the plain mapping for an ordinary create or another entity', () => {
    expect(failedReasonKey({ kind: 'not-found', code: '', entity: 'decide_checks', attempted: { op: 'create' } })).toBe('sync.failedSheet.reason.notFound');
    expect(failedReasonKey({ kind: 'rejected', code: '23505', entity: 'transactions', attempted: { reopenedFrom: 'x' } })).toBe('sync.failedSheet.reason.duplicate');
    expect(failedReasonKey({ kind: 'rejected', code: '' })).toBe('sync.failedSheet.reason.generic');
  });
});

// 06.1-84 (G-61-12): a failed history write was listed as "Change" because its entity had no label of its own.
describe('failedEntityKey', () => {
  it('names a Decide history write', () => {
    expect(failedEntityKey('decide_check_history')).toBe('sync.failedSheet.entity.decide_check_history');
    expect(failedEntityKey('nope')).toBe('sync.failedSheet.entity.unknown');
  });
});
