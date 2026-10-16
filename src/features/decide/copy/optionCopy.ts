/**
 * Option copy (05-09 Task 3): what would make it work. Names are noun phrases, not instructions (DCU-09).
 */
import type { DecideOption, OptionCode } from '@/engine/decide';
import { percentText } from './percentText';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';
import { basisWordKey } from './verdictCopy';

export type OptionAction = 'usePrice' | 'useTerm' | 'openActivity' | 'switchWait';

export const OPTION_ACTION = {
  affordable_price: 'usePrice',
  longer_term: 'useTerm',
  cut_line: 'openActivity',
  earn_more: null,
  save_first: 'switchWait',
  do_without: null,
} as const satisfies Record<OptionCode, OptionAction | null>;

export interface OptionCtx {
  fmt: Fmt;
  fmtCents: Fmt; // payments carry cents (D-54)
  lineName: (lineId: string) => string;
}

export interface OptionCopy {
  name: CopyRef;
  value: CopyRef | null;
  desc: CopyRef | null;
  action: OptionAction | null;
}

export function optionCopy(o: DecideOption, ctx: OptionCtx): OptionCopy {
  const { fmt, fmtCents } = ctx;
  const action = OPTION_ACTION[o.code];
  switch (o.code) {
    case 'affordable_price':
      return { name: ref('decide.section.optAffordable', { price: fmt(o.price) }), value: null, desc: ref('decide.section.optAffordableDesc', { amount: fmt(o.reduction) }), action };
    case 'longer_term':
      return {
        name: ref('decide.section.optTerm', { count: o.termMonths }),
        value: o.monthCloses ? ref('decide.section.optTermValue', { amount: fmtCents(o.leftChange) }) : ref('decide.section.optTermStill'),
        desc: ref('decide.section.optTermDesc', { payment: fmtCents(o.monthlyPayment), interest: fmt(o.extraInterest) }),
        action,
      };
    case 'cut_line': {
      const line = ctx.lineName(o.lineId);
      return {
        name: ref('decide.section.optCut', { line }),
        value: null,
        desc: ref('decide.section.optCutDesc', { cut: fmt(o.cut), line, gap: fmt(o.gap) }),
        action,
      };
    }
    case 'earn_more':
      return {
        name: ref('decide.section.optEarn', { amount: fmt(o.gap) }),
        value: null,
        // zero income: there is no percent of nothing to state
        desc: o.percentOfIncome === null ? null : ref('decide.section.optEarnDesc', { pct: percentText(o.percentOfIncome) }, { basis: basisWordKey(o.basis) }),
        action,
      };
    case 'save_first':
      return {
        name: ref('decide.section.optSaveFirst'),
        value: null,
        desc:
          o.months === null
            ? ref('decide.section.optSaveFirstOpen', { amount: fmt(o.need) })
            : ref('decide.section.optSaveFirstDesc', { amount: fmt(o.monthlySpare), count: o.months }),
        action,
      };
    case 'do_without':
      return {
        name: ref('decide.section.optWithout'),
        value: ref('decide.section.optWithoutValue', { amount: fmt(o.keptMonthly) }),
        desc:
          o.projected === null
            ? ref('decide.section.optWithoutDescTooLarge', { count: o.horizonMonths })
            : ref('decide.section.optWithoutDesc', { amount: fmt(o.projected), count: o.horizonMonths }),
        action,
      };
  }
}
