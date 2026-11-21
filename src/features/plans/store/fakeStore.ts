// 09-10: the Jest stand-in for purchasesClient. Same exported surface, in-memory state, no SDK.
// Use: jest.mock('@/features/plans/store/purchasesClient', () => require('@/features/plans/store/fakeStore'))
import { PLAN_KEYS, packageIdFor, type GoogleChangeMode, type StorePlatform } from './catalog';
import type { PlanOffer, PlanPeriod, PurchaseOutcome } from '../types';

type RestoreResult = 'restored' | 'nothing' | 'already-used-by-another-account' | 'failed';

export const fakeStoreState = {
  started: [] as { apiKey: string; userId: string }[],
  purchases: [] as { packageId: string; change?: { fromProductId: string; googleMode: GoogleChangeMode } }[],
  nextPurchase: { kind: 'purchased' } as PurchaseOutcome,
  nextRestore: 'nothing' as RestoreResult,
  manageOpened: 0,
  manageStore: null as string | null,
  /** What openManageSubscription resolves: false means no store page opened. */
  manageOpens: true,
  country: null as string | null,
  offers: null as PlanOffer[] | null,
};

export function resetFakeStore(): void {
  fakeStoreState.started = [];
  fakeStoreState.purchases = [];
  fakeStoreState.nextPurchase = { kind: 'purchased' };
  fakeStoreState.nextRestore = 'nothing';
  fakeStoreState.manageOpened = 0;
  fakeStoreState.manageStore = null;
  fakeStoreState.manageOpens = true;
  fakeStoreState.country = null;
  fakeStoreState.offers = null;
}

const PRICES = { solo: 4, duo: 7, household: 15, extended: 25 } as const;

function defaultOffers(trialAvailable: boolean): PlanOffer[] {
  const periods: PlanPeriod[] = ['month', 'year'];
  return PLAN_KEYS.flatMap((planKey) =>
    periods.map((period) => {
      const hasTrial = trialAvailable && (planKey === 'solo' || planKey === 'duo');
      return {
        planKey,
        period,
        packageId: packageIdFor(planKey, period),
        productId: `fincwin.${planKey}.${period}`,
        priceString: `$${PRICES[planKey] * (period === 'year' ? 10 : 1)}.99`,
        hasTrial,
        trialDays: hasTrial ? 14 : null,
        currencyCode: 'USD',
      };
    }),
  );
}

export function purchasesApiKey(): string | null {
  return 'fake-key';
}

export async function startPurchases(apiKey: string, userId: string): Promise<void> {
  fakeStoreState.started.push({ apiKey, userId });
}

export async function loadOffers(args: { platform: StorePlatform; trialAvailable: boolean }): Promise<PlanOffer[]> {
  return fakeStoreState.offers ?? defaultOffers(args.trialAvailable);
}

export async function purchasePlan(
  offer: PlanOffer,
  opts: { change?: { fromProductId: string; googleMode: GoogleChangeMode } } = {},
): Promise<PurchaseOutcome> {
  fakeStoreState.purchases.push({ packageId: offer.packageId, change: opts.change });
  return fakeStoreState.nextPurchase;
}

export async function restorePurchases(): Promise<RestoreResult> {
  return fakeStoreState.nextRestore;
}

export async function openManageSubscription(opts: { store?: string | null } = {}): Promise<boolean> {
  fakeStoreState.manageOpened += 1;
  fakeStoreState.manageStore = opts.store ?? null;
  return fakeStoreState.manageOpens;
}

export async function storefrontCountry(): Promise<string | null> {
  return fakeStoreState.country;
}
