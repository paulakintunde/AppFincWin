/**
 * Entry-sheet note selector (REC-20, UI-SPEC section 8). Refund and transfer
 * notes replace the Marking note; the FX note may stack. Never more than two.
 * The caller maps `autoConvert` from `lead_figure === 'home'`.
 */
export type EntryNote =
  | { kind: 'transfer' }
  | { kind: 'refund' }
  | { kind: 'marking' }
  | { kind: 'fxConverted' }
  | { kind: 'fxKept' };

export interface EntryNoteInput {
  direction: 'out' | 'in' | 'transfer';
  refund: boolean;
  foreign: boolean;
  autoConvert: boolean;
  hasAccount: boolean;
  status: 'paid' | 'pending' | 'skipped';
}

export function entryNotes(s: EntryNoteInput): EntryNote[] {
  if (s.direction === 'transfer') return [{ kind: 'transfer' }];
  const notes: EntryNote[] = [];
  if (s.refund && s.direction === 'out') {
    notes.push({ kind: 'refund' });
  } else if (s.hasAccount && s.status === 'pending') {
    notes.push({ kind: 'marking' });
  }
  if (s.foreign) notes.push({ kind: s.autoConvert ? 'fxConverted' : 'fxKept' });
  return notes;
}
