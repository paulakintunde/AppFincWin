// 05.4-34 (BO-03, D-128): the fixed purchase the Record-as-bought harness writes. Dev only. A $1,200-style laptop (in the home
// currency's minor units) with a deposit, a 4-payment monthly plan and one monthly running cost, judged by the real v3 engine on
// the heavy synthetic account dated today, so Purchase and Result are the engine's own (never hand-built).
import { evaluate, homeThresholds } from '@/engine/decide/v3';
import type { CheckV2, Evaluation } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money/types';
import { heavyAccount, monthlyPlan } from './heavyAccount';

export const SAMPLE_NAME = 'Maestro test laptop';
export const SAMPLE_PRICE = 120_000;
export const SAMPLE_DEPOSIT = 20_000;
export const SAMPLE_PAYMENTS = 4;
export const SAMPLE_RUNNING = 1_500;

export function sampleCheck(today: string): CheckV2 {
  return {
    v: 2,
    legacyKind: 'buy',
    price: minorUnits(SAMPLE_PRICE),
    taxPercent: null,
    taxIncluded: true,
    oneOffFees: minorUnits(0),
    itemType: { kind: 'preset', value: 'general' },
    categoryId: null,
    purpose: null,
    emergency: false,
    envelopeId: null,
    pay: monthlyPlan(SAMPLE_PAYMENTS, '0', SAMPLE_DEPOSIT),
    extras: {},
    value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null },
    share: { kind: 'personal' },
    foreign: null,
    layerAnswers: {},
    runningCosts: [{ id: 'harness-running', amount: minorUnits(SAMPLE_RUNNING), everyMonths: 1, start: today, end: null, on: true }],
  };
}

/** 08.1-09: the sample check and the engine's own Evaluation of it, for the one Record-as-bought writer. */
export function sampleEvaluation(today: string, currency: string): { check: CheckV2; evaluation: Evaluation } {
  const inputs = { ...heavyAccount(), asOf: today, currency: currencyCode(currency), thresholds: homeThresholds(currency, null) };
  const check = sampleCheck(today);
  return { check, evaluation: evaluate(inputs, check) };
}
