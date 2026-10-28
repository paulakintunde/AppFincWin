/**
 * Plan 05.2-45 (D-24): "Something changed?" as a pure table. Each everyday life change maps to the edit it opens: a
 * setup step in edit-one-step mode, the standalone income steps, or a sheet. Nothing here writes anything (D-21): the
 * change happens in the edit it opens, with that edit's own Undo.
 */
export type ChangeId = 'pay' | 'income' | 'bill' | 'account' | 'share' | 'emergency' | 'unusual';

export interface ChangeChoice {
  readonly id: ChangeId;
  readonly labelKey: string;
}

export const SOMETHING_CHANGED: readonly ChangeChoice[] = [
  { id: 'pay', labelKey: 'decide.settings.changed.pay' },
  { id: 'income', labelKey: 'decide.settings.changed.income' },
  { id: 'bill', labelKey: 'decide.settings.changed.bill' },
  { id: 'account', labelKey: 'decide.settings.changed.account' },
  { id: 'share', labelKey: 'decide.settings.changed.share' },
  { id: 'emergency', labelKey: 'decide.settings.changed.emergency' },
  { id: 'unusual', labelKey: 'decide.settings.changed.unusual' },
];

export type ChangeTarget = { readonly kind: 'route'; readonly href: string } | { readonly kind: 'sheet'; readonly sheet: 'emergency' };

export interface ChangeFacts {
  /** Whether a regular pay type is set (the Regular pay settings row shows). */
  readonly hasRegularPay: boolean;
  /** Full months of records. The unusual-months step needs two; below that the everyday step opens instead. */
  readonly fullMonths?: number;
}

const route = (href: string): ChangeTarget => ({ kind: 'route', href });

export function targetOf(id: ChangeId, facts: ChangeFacts = { hasRegularPay: true }): ChangeTarget {
  switch (id) {
    case 'pay':
      return facts.hasRegularPay ? route('/decide/setup?only=pay') : route('/decide/setup?mode=standalone');
    case 'income':
      return route('/decide/setup?mode=standalone');
    case 'bill':
      return route('/decide/setup?only=regular');
    case 'account':
      return route('/decide/setup?only=accountUse');
    case 'share':
      return route('/decide/setup?only=share');
    case 'emergency':
      return { kind: 'sheet', sheet: 'emergency' };
    case 'unusual':
      return facts.fullMonths !== undefined && facts.fullMonths < 2 ? route('/decide/setup?only=everyday') : route('/decide/setup?only=unusual');
  }
}
