// 09-10: the ONLY file that imports react-native-purchases (pinned 10.16.0; a Jest test enforces both).
// Identity: configure once without an app user id, then logIn(Supabase user id) before any purchase. The store session
// is never ended, so the same person is recognised on every device (TIER-07).
// Access never comes from here: CustomerInfo is client-side and spoofable (T-09-38). It is read only to tell "the
// purchase went through". The plan record on the server decides what the person can do.
import { Linking, Platform } from 'react-native';
import Purchases, {
  type PurchasesOffering,
  type PurchasesPackage,
  type SubscriptionOption,
} from 'react-native-purchases';
import {
  PLAN_KEYS,
  offeringFor,
  packageIdFor,
  type GoogleChangeMode,
  type StorePlatform,
} from './catalog';
import type { PlanOffer, PlanPeriod, PurchaseOutcome } from '../types';

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

/** The public SDK key for this platform, or null when none is configured (every call then reports unavailable). */
export function purchasesApiKey(): string | null {
  const key = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  return key && key.length > 0 ? key : null;
}

let configured = false;
let loggedInAs: string | null = null;
let available = false;

// loadOffers remembers the package and Play subscription option behind each offer, so a purchase buys exactly what was shown.
const picked = new Map<string, { pkg: PurchasesPackage; option: SubscriptionOption | null }>();

function platform(): StorePlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export async function startPurchases(apiKey: string, userId: string): Promise<void> {
  if (!apiKey) return;
  if (!configured) {
    Purchases.configure({ apiKey });
    configured = true;
  }
  available = true;
  if (loggedInAs !== userId) {
    await Purchases.logIn(userId);
    loggedInAs = userId;
  }
}

function periodDays(unit: string, value: number): number | null {
  switch (unit) {
    case 'DAY':
      return value;
    case 'WEEK':
      return value * 7;
    case 'MONTH':
      return value * 30;
    case 'YEAR':
      return value * 365;
    default:
      return null;
  }
}

function pickOption(pkg: PurchasesPackage, trialAvailable: boolean): SubscriptionOption | null {
  const options = pkg.product.subscriptionOptions ?? [];
  if (options.length === 0) return pkg.product.defaultOption ?? null;
  if (trialAvailable) return pkg.product.defaultOption ?? options[0] ?? null;
  // Trial already used: the base plan without the free phase (D-16).
  return options.find((o) => !o.freePhase && o.isBasePlan) ?? options.find((o) => !o.freePhase) ?? options[0] ?? null;
}

function findPackage(all: Record<string, PurchasesOffering>, offeringId: string, packageId: string): PurchasesPackage | null {
  const wanted = [all[offeringId], all.default];
  for (const o of wanted) {
    const hit = o?.availablePackages.find((p) => p.identifier === packageId);
    if (hit) return hit;
  }
  return null;
}

export async function loadOffers(args: { platform: StorePlatform; trialAvailable: boolean }): Promise<PlanOffer[]> {
  if (!available) return [];
  const offerings = await Purchases.getOfferings();
  const out: PlanOffer[] = [];
  picked.clear();
  const periods: PlanPeriod[] = ['month', 'year'];
  for (const planKey of PLAN_KEYS) {
    for (const period of periods) {
      const packageId = packageIdFor(planKey, period);
      const offeringId = offeringFor({ platform: args.platform, trialAvailable: args.trialAvailable, plan: planKey });
      const pkg = findPackage(offerings.all, offeringId, packageId);
      if (!pkg) continue;
      const option = args.platform === 'android' ? pickOption(pkg, args.trialAvailable) : null;
      const free = option?.freePhase ?? null;
      const intro = pkg.product.introPrice;
      const iosTrial = args.platform === 'ios' && intro !== null && intro.price === 0;
      const hasTrial = args.platform === 'android' ? free !== null : iosTrial;
      const trialDays = free
        ? periodDays(free.billingPeriod.unit, free.billingPeriod.value)
        : iosTrial && intro
          ? periodDays(intro.periodUnit, intro.periodNumberOfUnits * Math.max(1, intro.cycles))
          : null;
      picked.set(packageId, { pkg, option });
      out.push({
        planKey,
        period,
        packageId,
        productId: pkg.product.identifier,
        priceString: option?.fullPricePhase?.price.formatted ?? pkg.product.priceString,
        hasTrial,
        trialDays: hasTrial ? trialDays : null,
        currencyCode: pkg.product.currencyCode,
      });
    }
  }
  return out;
}

// Play wants the subscription product id; the server stores it as "<product>:<base plan>".
function playOldProductId(fromProductId: string): string {
  return fromProductId.split(':')[0] ?? fromProductId;
}

function errorCode(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'code' in e) return String((e as { code: unknown }).code);
  return null;
}

function toOutcome(e: unknown): PurchaseOutcome {
  const code = errorCode(e);
  const codes = Purchases.PURCHASES_ERROR_CODE;
  if (code === String(codes.PURCHASE_CANCELLED_ERROR) || (e as { userCancelled?: boolean | null } | null)?.userCancelled === true) {
    return { kind: 'cancelled' };
  }
  if (code === String(codes.PAYMENT_PENDING_ERROR)) return { kind: 'pending' };
  const alreadyUsed = [
    codes.RECEIPT_ALREADY_IN_USE_ERROR,
    codes.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR,
    codes.PURCHASE_BELONGS_TO_OTHER_USER,
  ].map(String);
  if (code !== null && alreadyUsed.includes(code)) return { kind: 'already-used-by-another-account' };
  // Only the codes that mean the store refused before taking payment count as "you were not charged".
  const notCharged = [
    codes.PURCHASE_NOT_ALLOWED_ERROR,
    codes.PURCHASE_INVALID_ERROR,
    codes.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR,
  ].map(String);
  return { kind: 'failed', notCharged: code !== null && notCharged.includes(code) };
}

export async function purchasePlan(
  offer: PlanOffer,
  opts: { change?: { fromProductId: string; googleMode: GoogleChangeMode } } = {},
): Promise<PurchaseOutcome> {
  if (!available) return { kind: 'failed', notCharged: true };
  const hit = picked.get(offer.packageId);
  if (!hit) return { kind: 'failed', notCharged: true };
  try {
    if (platform() === 'android') {
      // An explicit replacement mode on every plan change, never the SDK default.
      const change = opts.change
        ? { oldProductIdentifier: playOldProductId(opts.change.fromProductId), replacementMode: Purchases.STORE_REPLACEMENT_MODE[opts.change.googleMode] }
        : null;
      if (hit.option) await Purchases.purchaseSubscriptionOption(hit.option, change);
      else await Purchases.purchasePackage(hit.pkg, null, change);
    } else {
      await Purchases.purchasePackage(hit.pkg);
    }
    return { kind: 'purchased' };
  } catch (e) {
    return toOutcome(e);
  }
}

export async function restorePurchases(): Promise<'restored' | 'nothing' | 'already-used-by-another-account' | 'failed'> {
  if (!available) return 'failed';
  try {
    const info = await Purchases.restorePurchases();
    return info.activeSubscriptions.length > 0 ? 'restored' : 'nothing';
  } catch (e) {
    return toOutcome(e).kind === 'already-used-by-another-account' ? 'already-used-by-another-account' : 'failed';
  }
}

export async function openManageSubscription(): Promise<void> {
  if (!available) return;
  if (platform() === 'ios') {
    await Purchases.showManageSubscriptions();
    return;
  }
  let url = PLAY_SUBSCRIPTIONS_URL;
  try {
    url = (await Purchases.getCustomerInfo()).managementURL ?? PLAY_SUBSCRIPTIONS_URL;
  } catch {
    // keep the Play default
  }
  await Linking.openURL(url);
}

/** The store account's country, used once for redeem_invite and never stored (T-09-40). */
export async function storefrontCountry(): Promise<string | null> {
  if (!available) return null;
  try {
    return (await Purchases.getStorefront())?.countryCode ?? null;
  } catch {
    return null;
  }
}
