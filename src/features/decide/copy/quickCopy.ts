/**
 * Quick-check result copy (05-09 Task 2, UI-SPEC "Quick check"). Both modes are scored by assess() (D-23); the "no" chip
 * reads "Not from cash" or "Not from credit", never "You cannot afford this". At a zero rate the line says "before any
 * interest" and, when short, that no rate makes it fit. Nothing here invents a rate: the rate is the one typed (D-02).
 */
import { ZERO_PERCENT } from '@/engine/decide';
import type { Assessment, BuyCheck, FirstRead, Warning, WarningCode } from '@/engine/decide';
import type { QuickComputation } from '../snapshot/types';
import { MISSING_TITLE, SIZE_LABEL } from './codeMaps';
import { percentText } from './percentText';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';
import { findWarning, invKind, noLead, stateChip } from './verdictCopy';
import type { ChipTone } from './verdictCopy';

export interface QuickMonthly {
  amount: number; // minor units; the screen formats it with cents (D-54)
  months: number; // the entered term
  paidOffMonth: number | null; // plan.months when the rounded-up payment clears the term earlier (D-45)
  zeroRate: boolean;
}

export interface QuickResultCopy {
  chip: { key: string; tone: ChipTone } | null;
  size: string | null;
  line: CopyRef;
  monthly: QuickMonthly | null;
  caption: CopyRef | null; // the monthly figure's caption (Credit only)
  tryCredit: boolean;
  basis: string | null;
}

interface CreditCtx {
  fmt: Fmt;
  fmtCents: Fmt;
  termMonths: number;
  zeroRate: boolean;
  payment: string; // the formatted monthly payment, with cents (D-54)
}

// Cash lines (a Cash result whose lead warning is each code)
export const QUICK_CASH_LINE = {
  cash: (a, w, fmt) => ref('decide.quick.line.cashBelowCushion', { cashAfter: fmt(a.cashAfter), short: fmt(w.shortfall), cushion: fmt(a.context.limits.reserve) }),
  cash_dip: (_a, w, fmt) => ref('decide.quick.line.cashDip', { amount: fmt(w.shortfall) }),
  dsr: (a) =>
    a.debtServiceRatioAfter === null
      ? ref('decide.quick.line.creditDsrNoIncome')
      : ref('decide.quick.line.creditDsr', { pct: percentText(a.debtServiceRatioAfter) }),
  owe: () => ref('decide.quick.line.creditOwe'),
  inv: (a, _w, fmt) => ref(`decide.quick.line.pause${invKind(a)}`, { amount: fmt(a.pauseNeeded) }),
  month: (_a, w, fmt) => ref('decide.quick.line.cashMonthShort', { short: fmt(w.shortfall) }),
} as const satisfies Record<WarningCode, (a: Assessment, w: Warning, fmt: Fmt) => CopyRef>;

// Credit lines (a Credit result whose lead warning is each code)
export const QUICK_CREDIT_LINE = {
  month: (_a, w, c) => creditShort(w.shortfall, c),
  inv: (_a, w, c) => creditShort(w.shortfall, c),
  dsr: (a) =>
    a.debtServiceRatioAfter === null
      ? ref('decide.quick.line.creditDsrNoIncome')
      : ref('decide.quick.line.creditDsr', { pct: percentText(a.debtServiceRatioAfter) }),
  owe: () => ref('decide.quick.line.creditOwe'),
  // deposit 0 in the quick check, so only the on-the-day fees reach cash
  cash: (a, w, c) =>
    ref('decide.quick.line.creditCash', {
      day: c.fmt(a.mineDayOne),
      cashAfter: c.fmt(a.cashAfter),
      short: c.fmt(w.shortfall),
      cushion: c.fmt(a.context.limits.reserve),
    }),
  cash_dip: (a, w, c) =>
    a.cashDip === 'hard'
      ? ref('decide.quick.line.creditCashDipHard', { payment: c.payment })
      : ref('decide.quick.line.creditCashDip', { payment: c.payment, amount: c.fmt(w.shortfall) }),
} as const satisfies Record<WarningCode, (a: Assessment, w: Warning, c: CreditCtx) => CopyRef>;

function creditShort(short: number, c: CreditCtx): CopyRef {
  return ref(c.zeroRate ? 'decide.quick.line.creditShortZero' : 'decide.quick.line.creditShort', {
    payment: c.payment,
    count: c.termMonths,
    short: c.fmt(short),
  });
}

function termOf(check: BuyCheck, fallback: number): number {
  return check.payment.method === 'loan' && check.payment.termMonths !== null ? check.payment.termMonths : fallback;
}

function isZeroRate(check: BuyCheck): boolean {
  return check.payment.method === 'loan' && check.payment.apr === ZERO_PERCENT;
}

function monthlyFor(amount: number, termMonths: number, months: number, zeroRate: boolean): { monthly: QuickMonthly; caption: CopyRef } {
  const paidOffMonth = months > 0 && months < termMonths && !zeroRate ? months : null;
  const caption = zeroRate
    ? ref('decide.quick.monthlyCaptionZero', { count: termMonths })
    : paidOffMonth !== null
      ? ref('decide.quick.monthlyCaptionPaidOff', { count: termMonths, paid: paidOffMonth })
      : ref('decide.quick.monthlyCaption', { count: termMonths });
  return { monthly: { amount, months: termMonths, paidOffMonth, zeroRate }, caption };
}

function assessedCopy(a: Assessment, mode: 'cash' | 'credit', check: BuyCheck, fmt: Fmt, fmtCents: Fmt): QuickResultCopy {
  const surface = mode === 'cash' ? 'quickCash' : 'quickCredit';
  const chip = stateChip(a.state, surface);
  const size = SIZE_LABEL[a.size];
  const zeroRate = isZeroRate(check);
  const termMonths = termOf(check, a.plan.months);
  const ctx: CreditCtx = { fmt, fmtCents, termMonths, zeroRate, payment: fmtCents(a.plan.monthly) };
  const credit = mode === 'credit' ? monthlyFor(a.plan.monthly, termMonths, a.plan.months, zeroRate) : null;
  const finish = (line: CopyRef): QuickResultCopy => ({
    chip,
    size,
    line,
    monthly: credit ? credit.monthly : null,
    caption: credit ? credit.caption : null,
    tryCredit: mode === 'cash' && a.state === 'no',
    basis: null,
  });

  if (mode === 'cash') {
    if (a.state === 'fits') {
      return finish(ref('decide.quick.line.cashFits', { cashAfter: fmt(a.cashAfter), cushion: fmt(a.context.limits.reserve), left: fmt(a.left) }));
    }
    if (a.state === 'adjust') {
      const lead = a.warnings[0];
      return finish(lead ? QUICK_CASH_LINE[lead.code](a, lead, fmt) : ref('decide.quick.line.cashMonthShort', { short: fmt(0) }));
    }
    const kind = noLead(a);
    if (kind === 'cash_empty') {
      const cash = findWarning(a, 'cash');
      return finish(ref('decide.quick.line.cashNo', { short: fmt(cash ? cash.shortfall : -a.cashAfter) }));
    }
    if (kind === 'month') {
      const month = findWarning(a, 'month');
      return finish(ref('decide.quick.line.cashMonthShort', { short: fmt(month ? month.shortfall : 0) }));
    }
    return finish(ref('decide.quick.line.cashDipHard'));
  }

  if (a.state === 'fits') {
    return finish(
      ref(zeroRate ? 'decide.quick.line.creditFitsZero' : 'decide.quick.line.creditFits', {
        payment: fmtCents(a.plan.monthly),
        count: termMonths,
        left: fmt(a.left),
      }),
    );
  }
  let lead: Warning | undefined;
  if (a.state === 'no') {
    const kind = noLead(a);
    lead = kind === 'month' ? findWarning(a, 'month') : kind === 'cash_empty' ? findWarning(a, 'cash') : findWarning(a, 'cash_dip');
  }
  lead = lead ?? a.warnings[0];
  if (!lead) return finish(creditShort(0, ctx));
  return finish(QUICK_CREDIT_LINE[lead.code](a, lead, ctx));
}

function firstReadCopy(fr: FirstRead, mode: 'cash' | 'credit', check: BuyCheck, fmt: Fmt, fmtCents: Fmt): QuickResultCopy {
  const surface = mode === 'cash' ? 'quickCash' : 'quickCredit';
  if (fr.state === 'missing') {
    return {
      chip: stateChip('missing', surface, fr.reasons),
      size: SIZE_LABEL[fr.size],
      line: ref(MISSING_TITLE[fr.reasons[0] ?? 'card_missing']),
      monthly: null,
      caption: null,
      tryCredit: false,
      basis: null,
    };
  }
  const zeroRate = isZeroRate(check);
  const termMonths = termOf(check, fr.plan.months);
  const payment = fmtCents(fr.monthly);
  const credit = mode === 'credit' ? monthlyFor(fr.monthly, termMonths, fr.plan.months, zeroRate) : null;
  const cashWarning = fr.warnings.find((w) => w.code === 'cash');
  const monthWarning = fr.warnings.find((w) => w.code === 'month');
  const lead = fr.warnings[0];
  let line: CopyRef;
  if (mode === 'cash') {
    if (fr.state === 'fits') {
      line = ref('decide.quick.line.cashFits', { cashAfter: fmt(fr.cashAfter), cushion: fmt(fr.roughCushion), left: fmt(fr.leftAfter) });
    } else if (fr.state === 'no' && fr.cashAfter < 0) {
      line = ref('decide.quick.line.cashNo', { short: fmt(cashWarning ? cashWarning.shortfall : -fr.cashAfter) });
    } else if (lead && lead.code === 'cash') {
      line = ref('decide.quick.line.cashBelowCushion', { cashAfter: fmt(fr.cashAfter), short: fmt(lead.shortfall), cushion: fmt(fr.roughCushion) });
    } else {
      line = ref('decide.quick.line.cashMonthShort', { short: fmt(monthWarning ? monthWarning.shortfall : 0) });
    }
  } else if (fr.state === 'fits') {
    line = ref(zeroRate ? 'decide.quick.line.creditFitsZero' : 'decide.quick.line.creditFits', { payment, count: termMonths, left: fmt(fr.leftAfter) });
  } else if (monthWarning) {
    line = ref(zeroRate ? 'decide.quick.line.creditShortZero' : 'decide.quick.line.creditShort', { payment, count: termMonths, short: fmt(monthWarning.shortfall) });
  } else {
    line = ref('decide.quick.line.creditCash', {
      day: fmt(fr.dayOne),
      cashAfter: fmt(fr.cashAfter),
      short: fmt(cashWarning ? cashWarning.shortfall : Math.max(0, -fr.cashAfter)),
      cushion: fmt(fr.roughCushion),
    });
  }
  return {
    chip: stateChip(fr.state, surface),
    size: SIZE_LABEL[fr.size],
    line,
    monthly: credit ? credit.monthly : null,
    caption: credit ? credit.caption : null,
    tryCredit: mode === 'cash' && fr.state === 'no',
    basis: null,
  };
}

export function quickResultCopy(
  qc: Exclude<QuickComputation, { kind: 'incomplete' }>,
  mode: 'cash' | 'credit',
  fmt: Fmt,
  fmtCents: Fmt,
): QuickResultCopy {
  switch (qc.kind) {
    case 'none':
      return { chip: null, size: null, line: ref('decide.quick.line.missing'), monthly: null, caption: null, tryCredit: false, basis: null };
    case 'unconverted':
      // D-37: no figure, no size, no monthly amount
      return {
        chip: { key: 'decide.missingRate.chip', tone: 'missing' },
        size: null,
        line: ref('decide.missingRate.title', { currency: qc.currencies.join(', ') }),
        monthly: null,
        caption: null,
        tryCredit: false,
        basis: null,
      };
    case 'cash_only': {
      // the onboarding skip path: cash only, never a cushion or a month claim (D-03, D-04)
      const line =
        qc.cashAfter >= 0
          ? ref('decide.quick.line.cashOnly', { price: fmt(qc.dayOne), cashAfter: fmt(qc.cashAfter) })
          : ref('decide.quick.line.cashOnlyShort', { price: fmt(qc.dayOne), short: fmt(-qc.cashAfter) });
      const credit =
        mode === 'credit' && qc.monthly !== null && qc.termMonths !== null
          ? monthlyFor(qc.monthly, qc.termMonths, qc.months ?? 0, isZeroRate(qc.check))
          : null;
      return {
        chip: null,
        size: null,
        line,
        monthly: credit ? credit.monthly : null,
        caption: credit ? credit.caption : null,
        tryCredit: false,
        basis: 'decide.basis.cashOnly',
      };
    }
    case 'logged': {
      const v = qc.verdict;
      if (v.state === 'missing') {
        return {
          chip: stateChip('missing', mode === 'cash' ? 'quickCash' : 'quickCredit', v.reasons),
          size: v.size ? SIZE_LABEL[v.size] : null,
          line: ref(MISSING_TITLE[v.reasons[0] ?? 'no_full_month']),
          monthly: null,
          caption: null,
          tryCredit: false,
          basis: null,
        };
      }
      return assessedCopy(v, mode, qc.check, fmt, fmtCents);
    }
    case 'first_read':
      return firstReadCopy(qc.firstRead, mode, qc.check, fmt, fmtCents);
  }
}
