// 02-28 Task 1: pure copy helpers for undo labels and refusals (REC-12, D-26).
import { i18n } from '@/i18n';
import type { UndoConflict } from '@/engine/undo';
import { conflictText, refusalText, stepLabel } from '../undoCopy';

const t = i18n.t.bind(i18n) as never;

describe('stepLabel', () => {
  it('formats plural, named and nameless labels', () => {
    expect(stepLabel(t, 'deletedMany', { n: 30 })).toBe('30 deleted');
    expect(stepLabel(t, 'added', { name: 'Groceries — week 2' })).toBe('Added · Groceries — week 2');
    expect(stepLabel(t, 'imported', { n: 1 })).toBe('Imported 1 line');
  });

  it('uses the nameless variant when there is no name (C-WR-06)', () => {
    expect(stepLabel(t, 'deleted', {})).toBe('Deleted');
  });
});

describe('refusalText', () => {
  it('names the member and the record', () => {
    expect(
      refusalText(t, { actor: 'member', actorName: 'Sam', record: { kind: 'name', name: 'Groceries' } })
    ).toBe('Sam edited Groceries after this, so it can’t be undone.');
  });

  it('falls back when the member has no name', () => {
    expect(
      refusalText(t, { actor: 'member', actorName: null, record: { kind: 'name', name: 'Groceries' } })
    ).toBe('Someone in your household edited Groceries after this, so it can’t be undone.');
  });

  it('covers self and system actors', () => {
    expect(refusalText(t, { actor: 'self', actorName: null, record: { kind: 'name', name: 'Rent' } })).toBe(
      'Rent was changed on another device after this, so it can’t be undone.'
    );
    expect(refusalText(t, { actor: 'system', actorName: null, record: { kind: 'name', name: 'Rent' } })).toBe(
      'Rent was changed elsewhere after this, so it can’t be undone.'
    );
  });

  it('renders built-in and entity records', () => {
    expect(refusalText(t, { actor: 'system', actorName: null, record: { kind: 'builtin', key: 'Groceries' } })).toBe(
      'Groceries was changed elsewhere after this, so it can’t be undone.'
    );
    expect(refusalText(t, { actor: 'system', actorName: null, record: { kind: 'entity', entity: 'transactions' } })).toBe(
      'this line was changed elsewhere after this, so it can’t be undone.'
    );
  });
});

describe('conflictText', () => {
  const names = new Map([['sam', 'Sam']]);
  const base: UndoConflict = {
    entity: 'transactions',
    id: 't1',
    updatedBy: 'sam',
    recordName: 'Groceries',
    builtinKey: null,
    reason: 'changed',
  };

  it('attributes a member edit via describeRefusal', () => {
    expect(conflictText(t, base, 'me', names)).toBe('Sam edited Groceries after this, so it can’t be undone.');
  });

  it('D-CR-01: a series refusal with no updated_by says newer occurrences were scheduled', () => {
    const c: UndoConflict = { ...base, entity: 'recurring_series', updatedBy: null, recordName: 'Rent' };
    expect(conflictText(t, c, 'me', names)).toBe(
      'Newer occurrences of Rent have been scheduled since, so this can’t be undone.'
    );
  });

  it('D-WR-02: both updated_by and record_name null still reads as a sentence', () => {
    const c: UndoConflict = { ...base, updatedBy: null, recordName: null };
    expect(conflictText(t, c, 'me', names)).toBe('this line was changed elsewhere after this, so it can’t be undone.');
  });
});
