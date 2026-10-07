import type { UndoConflict } from '../types';
import { describeRefusal, rollbackRange, type StepSummary } from '../history';

describe('rollbackRange', () => {
  const steps: StepSummary[] = [
    { id: 's5', status: 'available' },
    { id: 's4', status: 'undone' },
    { id: 's3', status: 'available' },
    { id: 's2', status: 'refused' },
    { id: 's1', status: 'available' },
  ];

  it('collects available steps up to and including the target, skipping undone ones', () => {
    expect(rollbackRange(steps, 's3')).toEqual({ stepIds: ['s5', 's3'], blockedBy: null });
  });

  it('stops at a refused step before reaching the target', () => {
    expect(rollbackRange(steps, 's1')).toEqual({ stepIds: ['s5', 's3'], blockedBy: 's2' });
  });

  it('returns an empty plan when the target id is not found', () => {
    expect(rollbackRange(steps, 'missing')).toEqual({ stepIds: [], blockedBy: null });
  });
});

describe('describeRefusal', () => {
  const memberNames = new Map([['u2', 'Sam']]);

  it('attributes a change to a named household member', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u2',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames)).toEqual({
      actor: 'member',
      actorName: 'Sam',
      record: { kind: 'name', name: 'Groceries' },
    });
  });

  it('attributes a change by the current user to self', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u1',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames).actor).toBe('self');
  });

  it('attributes a null updatedBy to the system', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: null,
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames).actor).toBe('system');
  });

  it('attributes a not-found reason to the system regardless of updatedBy', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u2',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'not-found',
    };
    expect(describeRefusal(conflict, 'u1', memberNames).actor).toBe('system');
  });

  it('gives a null actorName for an unknown member id', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u-unknown',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames)).toMatchObject({ actor: 'member', actorName: null });
  });

  it('falls back to the builtin key when recordName is null', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u2',
      recordName: null,
      builtinKey: 'Groceries',
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames).record).toEqual({ kind: 'builtin', key: 'Groceries' });
  });

  it('falls back to the entity when both recordName and builtinKey are null', () => {
    const conflict: UndoConflict = {
      entity: 'categories',
      id: 'c1',
      updatedBy: 'u2',
      recordName: null,
      builtinKey: null,
      reason: 'changed',
    };
    expect(describeRefusal(conflict, 'u1', memberNames).record).toEqual({ kind: 'entity', entity: 'categories' });
  });
});
