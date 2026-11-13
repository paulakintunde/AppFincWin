/**
 * 06.1-21 (D-02, D-09, D-12, D-21): Check it on Decide home. buildCheck turns the home fields into a CheckV2; routeFor says where it
 * goes (blocked for a home, the stepper for a big buy, the answer for everything else); useNewCheck writes the draft row first, with
 * a client uuid so it works offline, and then routes. The stepper routes (plan 19) read an existing draft row by id, so this hook is
 * what creates it. Only typed inputs are stored; no verdict is ever written from here (D-15).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useDecideV3 } from '@/data/queries/decideV3';
import {
  INCLUDED_COUNTRIES,
  lookupTaxDefault,
  parseCheckV2,
  salesTaxOf,
  toStoredV2,
  type CheckV2,
  type HomeThresholds,
  type ItemTypeRef,
  type LocalDate,
  type PayV2,
  type QuickLine,
  type UsdRate,
} from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { isBigBuy } from '../logic/bigBuy';
import { isHomeWords, readKind, readsAsPlan, type ItemKind } from '../logic/kindWords';
import { useMonthPicture } from '../engine/useMonthPicture';

export type WhenChoice = 'today' | 'payday' | { readonly date: LocalDate };

export interface NewCheckFields {
  /** The item words, already without the price (the "What is it?" field). */
  readonly text: string;
  readonly price: number | null;
  readonly when: WhenChoice;
  readonly payMode: 'once' | 'plan';
  /** The installment terms from the plan sheet; absent with payMode 'plan' means the terms are chosen later in the stepper. */
  readonly plan?: Extract<PayV2, { mode: 'plan' }> | null;
  readonly purpose: 'need' | 'want' | null;
  readonly quickLines: readonly QuickLine[];
}

export interface BuildContext {
  readonly country: string | null;
  readonly nextPayday: LocalDate | null;
}

function itemTypeOf(kind: ItemKind | null): ItemTypeRef {
  if (kind === 'car') return { kind: 'preset', value: 'vehicle' };
  if (kind === 'tech') return { kind: 'preset', value: 'electronics' };
  if (kind === 'home') return { kind: 'preset', value: 'property' };
  return { kind: 'preset', value: 'general' };
}

/** D-12: need and want only reorder the options. There is no emergency question, so emergency is always false. */
function purposeOf(choice: 'need' | 'want' | null): CheckV2['purpose'] {
  if (choice === 'need') return { kind: 'preset', value: 'necessity' };
  if (choice === 'want') return { kind: 'preset', value: 'nice_to_have' };
  return null;
}

/** The CheckV2 a Check it tap starts from. The parser supplies every default, so this carries only what the person typed or chose. */
export function buildCheck(fields: NewCheckFields, ctx: BuildContext): CheckV2 {
  const base = parseCheckV2({ v: 2 }) as CheckV2;
  const purchaseDate: LocalDate | null = fields.when === 'today' ? null : fields.when === 'payday' ? ctx.nextPayday : fields.when.date;
  const pay: PayV2 = fields.payMode === 'plan' && fields.plan != null ? fields.plan : { mode: 'once' };
  return {
    ...base,
    price: fields.price === null ? null : minorUnits(fields.price),
    itemType: itemTypeOf(readKind(fields.text)),
    purpose: purposeOf(fields.purpose),
    emergency: false,
    pay,
    taxIncluded: ctx.country !== null && INCLUDED_COUNTRIES.includes(ctx.country),
    purchaseDate,
    ...(fields.quickLines.length > 0 ? { quickLines: [...fields.quickLines] } : {}),
  };
}

export interface RouteContext {
  readonly id: string;
  readonly text: string;
  readonly payMode: 'once' | 'plan';
  readonly currency: string;
  readonly country: string | null;
  readonly subdivision?: string | null;
  readonly thresholds?: HomeThresholds | null;
  readonly usdRate?: UsdRate | null;
}

export type NewCheckRoute = 'blocked' | `/decide/check/kind?id=${string}` | `/decide/check/price?id=${string}` | `/decide/answer/${string}`;

/** The price with tax, in minor units, as the big-buy band reads it. A price that already includes tax adds none. */
function wholeWithTax(check: CheckV2, ctx: RouteContext): number {
  const price = check.price === null ? 0 : Number(check.price);
  if (check.price === null || check.taxIncluded === true) return price;
  const lookup = lookupTaxDefault({ country: ctx.country, subdivision: ctx.subdivision ?? null });
  const percent = check.taxPercent ?? (lookup.kind === 'add' ? lookup.percent : null);
  return price + Number(salesTaxOf(check.price, percent));
}

/** D-02 blocks a home before any write; D-09 sends a big buy to the stepper (the kind step first when the words did not read a kind). */
export function routeFor(check: CheckV2, ctx: RouteContext): NewCheckRoute {
  const kind = readKind(ctx.text);
  if (isHomeWords(ctx.text) || kind === 'home' || (check.itemType.kind === 'preset' && check.itemType.value === 'property')) return 'blocked';
  const big = isBigBuy({
    kind,
    payMode: ctx.payMode === 'plan' || check.pay.mode === 'plan' || readsAsPlan(ctx.text) ? 'plan' : 'once',
    whole: minorUnits(wholeWithTax(check, ctx)),
    currency: ctx.currency,
    usdRate: ctx.usdRate ?? null,
    thresholds: ctx.thresholds ?? null,
  });
  if (!big) return `/decide/answer/${ctx.id}`;
  return kind === null ? `/decide/check/kind?id=${ctx.id}` : `/decide/check/price?id=${ctx.id}`;
}

const DOUBLE_TAP_MS = 900;

export interface NewCheck {
  /** True from Check it until the route has opened; the button stays disabled meanwhile (T-06.1-21-02). */
  pending: boolean;
  /**
   * Returns the route taken, or 'blocked' when nothing was written. 06.1-52 (C-18): 'loading' while the user or household is not
   * loaded yet (the caller says so); 'unavailable' while a create is still pending (the button stays disabled meanwhile).
   */
  start(fields: NewCheckFields): NewCheckRoute | 'unavailable' | 'loading';
}

export function useNewCheck(): NewCheck {
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const { picture } = useMonthPicture();
  const { create } = useCreateCheck();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const start = useCallback(
    (fields: NewCheckFields): NewCheckRoute | 'unavailable' | 'loading' => {
      if (pending) return 'unavailable';
      if (rc.userId === null || rc.householdId === null) return 'loading';
      const inputs = v3.inputs;
      const country = inputs?.region ?? rc.region;
      const check = buildCheck(fields, { country, nextPayday: picture?.payday ?? null });
      const id = Crypto.randomUUID();
      const route = routeFor(check, {
        id,
        text: fields.text,
        payMode: fields.payMode,
        currency: inputs?.currency ?? rc.homeCurrency,
        country,
        subdivision: inputs?.regionSubdivision ?? null,
        thresholds: inputs?.thresholds ?? null,
      });
      if (route === 'blocked') return route;
      setPending(true);
      timer.current = setTimeout(() => setPending(false), DOUBLE_TAP_MS);
      create({
        userId: rc.userId,
        id,
        householdId: rc.householdId,
        kind: 'buy',
        name: fields.text.trim(),
        inputs: toStoredV2(check) as Record<string, unknown>,
        furthestStep: 1,
      });
      router.push(route as never);
      return route;
    },
    [rc.userId, rc.householdId, rc.region, rc.homeCurrency, pending, v3.inputs, picture, create, router],
  );

  return { pending, start };
}
