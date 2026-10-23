/**
 * The 31 ⓘ explanations of the Decide UX refresh (05-54, D-70, UI-SPEC R3). Pure: keys and params only, no t(), no React.
 * Each key reads decide.info.{key}.term | body | changes from the catalogue.
 */
import { ref, type CopyRef } from './types';

export const INFO_KEYS = [
  'replaces', 'incomeChange', 'runningCosts', 'netMonthly', 'lossOfValue', 'beforeInterest', 'promoRate', 'deferredInterest',
  'variableRate', 'cardMinimum', 'size', 'edge', 'confidence', 'cushionMonths', 'reserve', 'dsrLine', 'unsecuredMultiple',
  'investingFloor', 'savingFloor', 'basisMonth', 'combined', 'whatBreaks', 'cashPath', 'whereItLands', 'setbacks', 'ifInvested',
  'kept', 'provisionalRate', 'coolingOff', 'waitGoal', 'whatGetsWritten',
] as const;

export type InfoKey = (typeof INFO_KEYS)[number];

export interface InfoDynamic {
  cushionMonths?: { months: number; reason: CopyRef };
  provisionalRate?: { date: string };
}

export interface InfoCopy {
  term: CopyRef;
  body: CopyRef[];
  changes: CopyRef;
  /** Set with the cushion line: the screen resolves it (refText) and passes it as the `reason` param of the last body ref. */
  reason?: CopyRef;
}

const P = 'decide.info.';

export function infoCopy(key: InfoKey, dynamic?: InfoDynamic): InfoCopy {
  const term = ref(`${P}${key}.term`);
  const changes = ref(`${P}${key}.changes`);
  if (key === 'cushionMonths' && dynamic?.cushionMonths) {
    const { months, reason } = dynamic.cushionMonths;
    return { term, body: [ref(`${P}${key}.body`), ref(`${P}${key}.line`, { count: months })], changes, reason };
  }
  if (key === 'provisionalRate') {
    const date = dynamic?.provisionalRate?.date;
    return { term, body: [date ? ref(`${P}${key}.body`, { date }) : ref(`${P}${key}.bodyNoDate`)], changes };
  }
  return { term, body: [ref(`${P}${key}.body`)], changes };
}
