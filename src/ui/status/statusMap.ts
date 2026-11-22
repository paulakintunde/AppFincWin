/**
 * 06.2 D-12: the one status map. Decide answer boards keep 06.1 StateBadge (D-23).
 *
 * Every status reads by colour + shape + word together, so nothing relies on colour alone. Goals, caps, bills, import
 * and Decide home rows all read their badge from here.
 * D-14: red (the `short` tone) is only over cap, overdue and short. Amber (`tight`) is only due soon, behind and tight.
 * Up and down are neutral: the arrow and the word carry the direction, not a colour.
 */
import type { IconName } from '@/ui/icons/iconData';

export type StatusTone = 'fits' | 'tight' | 'short' | 'notYet' | 'net' | 'neutral';

export interface StatusDef {
  readonly tone: StatusTone;
  readonly icon: IconName;
  readonly wordKey: `appLife.status.${string}`;
}

export const STATUS = {
  paid: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.paid' },
  received: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.received' },
  reached: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.reached' },
  onTrack: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.onTrack' },
  cleared: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.cleared' },
  fits: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.fits' },
  dueSoon: { tone: 'tight', icon: 'stateDue', wordKey: 'appLife.status.dueSoon' },
  behind: { tone: 'tight', icon: 'stateTight', wordKey: 'appLife.status.behind' },
  tight: { tone: 'tight', icon: 'stateTight', wordKey: 'appLife.status.tight' },
  overCap: { tone: 'short', icon: 'stateOverCap', wordKey: 'appLife.status.overCap' },
  overdue: { tone: 'short', icon: 'stateOverCap', wordKey: 'appLife.status.overdue' },
  short: { tone: 'short', icon: 'stateShort', wordKey: 'appLife.status.short' },
  due: { tone: 'notYet', icon: 'stateDue', wordKey: 'appLife.status.due' },
  pending: { tone: 'notYet', icon: 'stateDue', wordKey: 'appLife.status.pending' },
  notYet: { tone: 'notYet', icon: 'stateDue', wordKey: 'appLife.status.notYet' },
  safetyNet: { tone: 'net', icon: 'stateSafetyNet', wordKey: 'appLife.status.safetyNet' },
  // L06 draws the pen in a square beside "Draft"; in iconData that drawing is firstEntry.
  draft: { tone: 'neutral', icon: 'firstEntry', wordKey: 'appLife.status.draft' },
  up: { tone: 'neutral', icon: 'stateUp', wordKey: 'appLife.status.up' },
  down: { tone: 'neutral', icon: 'stateDown', wordKey: 'appLife.status.down' },
  // 09 UI-SPEC: plan status words. Existing tones and icons only; red (the short tone) is not used in Phase 9.
  trial: { tone: 'neutral', icon: 'calendar', wordKey: 'appLife.status.trial' },
  planActive: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.planActive' },
  trialEnding: { tone: 'tight', icon: 'stateDue', wordKey: 'appLife.status.trialEnding' },
  paymentFailed: { tone: 'tight', icon: 'stateTight', wordKey: 'appLife.status.paymentFailed' },
  readOnly: { tone: 'notYet', icon: 'pinLock', wordKey: 'appLife.status.readOnly' },
  waitingApproval: { tone: 'notYet', icon: 'stateDue', wordKey: 'appLife.status.waitingApproval' },
  coveredBy: { tone: 'neutral', icon: 'household', wordKey: 'appLife.status.coveredBy' },
  freeAccess: { tone: 'fits', icon: 'stateFits', wordKey: 'appLife.status.freeAccess' },
} as const satisfies Record<string, StatusDef>;

export type StatusKey = keyof typeof STATUS;
