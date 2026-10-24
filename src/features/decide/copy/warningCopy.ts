/**
 * Warning and card-reason cards (05-09 Task 2). One card per cause. The cash_dip card names the date and states only the
 * extra depth the purchase adds (04 D-59), never the whole gap.
 */
import type { Assessment, Verdict, Warning } from '@/engine/decide';
import { WARNING_TONE } from './codeMaps';
import { percentLabel } from './percentText';
import { ref } from './types';
import type { CopyRef, Fmt, WarnCard } from './types';
import { basisWordKey, invKind } from './verdictCopy';

export function warningCard(w: Warning, a: Assessment, fmt: Fmt, fmtDate: (localDate: string) => string): WarnCard {
  const tone = WARNING_TONE[w.code];
  const limits = a.context.limits;
  switch (w.code) {
    case 'month': {
      const short = fmt(w.shortfall);
      const leftBefore = a.context.leftBefore;
      // Before, adding and after are one basis and one check set: a.context is the combined context, a.left is leftBefore less the
      // purchase's monthly cost. The shortfall (w.shortfall) is what remains after pausing saving and investing (D-35), so it is
      // named as that and never set beside "adding" as if the purchase did the closing.
      const gap = fmt(-a.left);
      const added = leftBefore - a.left;
      const body: CopyRef[] = [];
      if (leftBefore < 0) {
        const basis = { basis: basisWordKey(a.context.money.basis) };
        body.push(
          added === 0
            ? ref('decide.warn.monthAlreadySame', { already: fmt(-leftBefore) }, basis)
            : ref('decide.warn.monthAlready', { already: fmt(-leftBefore), added: fmt(added), gap }, basis)
        );
        if (-a.left !== w.shortfall) body.push(ref('decide.warn.monthPaused', { paused: fmt(-a.left - w.shortfall), short }));
      } else body.push(ref('decide.warn.monthBody', { short }));
      return { title: ref('decide.warn.monthTitle'), value: ref('decide.warn.monthValue', { amount: short }), body, tone };
    }
    case 'cash':
      return {
        title: ref('decide.warn.cashTitle'),
        value: ref('decide.warn.cashValue', { amount: fmt(w.shortfall) }),
        body: [ref('decide.warn.cashBody', { cushion: fmt(limits.reserve), day: fmt(a.mineDayOne), cashAfter: fmt(a.cashAfter) })],
        tone,
      };
    case 'cash_dip': {
      const path = a.cashPath;
      const body =
        path.status === 'available'
          ? [ref('decide.warn.cashDipBody', { amount: fmt(w.shortfall), lowest: fmt(path.lowestWith.amount), date: fmtDate(path.lowestWith.date) })]
          : [];
      return {
        title: ref('decide.warn.cashDipTitle'),
        value: ref('decide.warn.cashDipValue', { amount: fmt(w.shortfall) }),
        body,
        tone: a.cashDip === 'hard' ? 'hard' : 'soft',
      };
    }
    case 'dsr': {
      const line = percentLabel(limits.dsrLine);
      const debt = fmt(a.debtServiceAfter);
      if (a.debtServiceRatioAfter === null) {
        return { title: ref('decide.warn.dsrTitle'), value: ref('decide.warn.dsrValueNoIncome'), body: [ref('decide.warn.dsrBodyNoIncome', { line, debt })], tone };
      }
      return {
        title: ref('decide.warn.dsrTitle'),
        value: ref('decide.warn.dsrValue', { pct: percentLabel(a.debtServiceRatioAfter) }),
        body: [ref('decide.warn.dsrBody', { line, debt, in: fmt(a.context.money.incomeBasis) })],
        tone,
      };
    }
    case 'housing': {
      const line = percentLabel(limits.housingLine);
      const housing = fmt(a.housingAfter);
      if (a.housingRatioAfter === null) {
        return {
          title: ref('decide.warn.housingTitle'),
          value: ref('decide.warn.housingValueNoIncome'),
          body: [ref('decide.warn.housingBodyNoIncome', { line, housing })],
          tone,
        };
      }
      return {
        title: ref('decide.warn.housingTitle'),
        value: ref('decide.warn.housingValue', { pct: percentLabel(a.housingRatioAfter) }),
        body: [ref('decide.warn.housingBody', { line, housing, in: fmt(a.context.money.incomeBasis) })],
        tone,
      };
    }
    case 'owe':
      return {
        title: ref('decide.warn.oweTitle'),
        value: ref('decide.warn.oweValue', { amount: fmt(a.unsecuredAfter) }),
        body: [ref('decide.warn.oweBody', { amount: fmt(a.unsecuredAfter), annual: fmt(a.context.annualIncome), mult: limits.unsecuredIncomeMultiple })],
        tone,
      };
    case 'inv': {
      const kind = invKind(a);
      const amount = fmt(a.pauseNeeded);
      const investingFrom = fmt(a.investingAfter + a.investingAtRisk);
      const savingFrom = fmt(a.savingAfter + a.savingAtRisk);
      const body =
        kind === 'Both'
          ? ref('decide.warn.invBodyBoth', { amount, savingFrom, savingTo: fmt(a.savingAfter), from: investingFrom, to: fmt(a.investingAfter) })
          : kind === 'Saving'
            ? ref('decide.warn.invBodySaving', { amount: fmt(a.savingAtRisk), from: savingFrom, to: fmt(a.savingAfter) })
            : ref('decide.warn.invBodyInvesting', { amount: fmt(a.investingAtRisk), from: investingFrom, to: fmt(a.investingAfter) });
      const lines = [body];
      if (a.investingAfter < limits.investingFloor) lines.push(ref('decide.warn.invBelowFloor', { floor: fmt(limits.investingFloor) }));
      else if (a.savingAfter < limits.savingFloor) lines.push(ref('decide.warn.invBelowFloor', { floor: fmt(limits.savingFloor) }));
      return { title: ref(`decide.warn.invTitle${kind}`), value: ref('decide.warn.invValue', { amount }), body: lines, tone };
    }
  }
}

/** Cards for card-specific causes. `card_not_accepted` arrives on a missing verdict; the rest on a resolved card plan. */
export function cardReasonCards(verdict: Verdict, fmt: Fmt): readonly WarnCard[] {
  if (verdict.state === 'missing') {
    return verdict.reasons.includes('card_not_accepted')
      ? [{ title: ref('decide.warn.cardNotAcceptedTitle'), value: ref('decide.warn.cardNotAcceptedValue'), body: [], tone: 'hard' }]
      : [];
  }
  const plan = verdict.plan;
  const card = plan.card;
  if (!card) return [];
  const cards: WarnCard[] = [];
  if (card.remainderOnDay > 0) {
    cards.push({
      title: ref('decide.warn.cardRemainderTitle', { rest: fmt(card.remainderOnDay) }),
      value: null,
      body: [ref('decide.warn.cardRemainderBody', { cap: fmt(card.onCard), price: fmt(plan.price) })],
      tone: 'soft',
    });
  }
  if (card.payoff === 'minimum') {
    if (card.minimumOutcome === 'never_clears') {
      cards.push({ title: ref('decide.warn.cardMinimumTitle'), value: ref('decide.warn.cardMinimumNever'), body: [ref('decide.warn.cardMinimumNeverBody')], tone: 'hard' });
    } else if (card.minimumOutcome === 'exceeds_month_cap') {
      // 04 HI-02: plan.total, plan.interest and payoffMonths are all null here; only what is still owed is stated
      const owed = fmt(card.remainingAtCap ?? 0);
      cards.push({
        title: ref('decide.warn.cardCapTitle'),
        value: ref('decide.warn.cardCapValue', { amount: owed }),
        body: [ref('decide.warn.cardCapBody', { amount: owed, balance: fmt(card.onCard) })],
        tone: 'hard',
      });
    } else if (card.payoffMonths !== null) {
      const years = Math.max(1, Math.round(card.payoffMonths / 12));
      cards.push({
        title: ref('decide.warn.cardMinimumTitle'),
        value: ref('decide.warn.cardMinimumYears', { count: years }),
        body: [ref('decide.warn.cardMinimumBody', { months: card.payoffMonths, years, interest: fmt(plan.interest ?? 0), balance: fmt(card.onCard) })],
        tone: 'soft',
      });
    }
  }
  return cards;
}
