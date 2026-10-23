/**
 * The 59 ⓘ explanations of the Decide UX refresh (31 from 05-54, D-70, UI-SPEC R3; 24 from 05-80, D-84, R15.8; 4 from 05-88, D-86..D-91, R16.10). Pure: keys and params only, no t(), no React.
 * Each key reads decide.info.{key}.term | body | changes from the catalogue.
 */
import { ref, type CopyRef } from './types';

export const INFO_KEYS = [
  'replaces', 'incomeChange', 'runningCosts', 'netMonthly', 'lossOfValue', 'beforeInterest', 'promoRate', 'deferredInterest',
  'variableRate', 'cardMinimum', 'size', 'edge', 'confidence', 'cushionMonths', 'reserve', 'dsrLine', 'unsecuredMultiple',
  'investingFloor', 'savingFloor', 'basisMonth', 'combined', 'whatBreaks', 'cashPath', 'whereItLands', 'setbacks', 'ifInvested',
  'kept', 'provisionalRate', 'coolingOff', 'waitGoal', 'whatGetsWritten',
  // 05-80 (D-84, R15.8)
  'price', 'taxFees', 'tradeIn', 'finalPrice', 'howYouPay', 'paidInFull', 'depositAndLoan', 'deposit', 'loanTerm', 'apr', 'secured',
  'instalmentPlan', 'hasRate', 'firstPayment', 'lateFee', 'onCard', 'paidInFullMonthly', 'lumpSum', 'monthlyContribution',
  'expectedReturn', 'itemType', 'customItemType', 'treatLike', 'cardClearing',
  // 05-88 (D-86, D-89, D-90, D-91, R16.10)
  'interestSaved', 'instalmentFrequency', 'impliedApr', 'cardCheckLimit',
] as const;

export type InfoKey = (typeof INFO_KEYS)[number];

export interface InfoDynamic {
  cushionMonths?: { months: number; reason: CopyRef };
  provisionalRate?: { date: string };
  /** The card cap in checks, formatted (R16.10). Without it the body drops its cap sentence (bodyNoCap). */
  onCard?: { cap: string };
  /** cap = the converted snapshot.cardMaxPurchase, usdLimit = formatAmount of USD 10,000,000 minor units; usdHome when the home currency is USD. */
  cardCheckLimit?: { cap?: string; usdLimit: string; usdHome?: boolean };
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
  if (key === 'onCard') {
    const cap = dynamic?.onCard?.cap;
    return { term, body: [cap ? ref(`${P}${key}.body`, { cap }) : ref(`${P}${key}.bodyNoCap`)], changes };
  }
  if (key === 'cardCheckLimit') {
    const d = dynamic?.cardCheckLimit;
    if (d?.usdHome) return { term, body: [ref(`${P}${key}.bodyUsdHome`, { usdLimit: d.usdLimit })], changes };
    if (d?.cap) return { term, body: [ref(`${P}${key}.body`, { cap: d.cap, usdLimit: d.usdLimit })], changes };
    return { term, body: [ref(`${P}${key}.bodyNoLimit`)], changes };
  }
  return { term, body: [ref(`${P}${key}.body`)], changes };
}
