/**
 * The safety net (05.4 FIN-01, FIN-02, ENG-03, ENG-04; D-05, D-06, D-35, D-41, D-49). Pure; integer minor units.
 *
 * - No record means protection on, the starter size (1 month of essential costs, ARC-07) and the emergency fund as the money saved.
 * - Only money already saved is protected (D-35): the protected floor is min(saved, size). Nothing is held back for the part of
 *   the size not saved yet, and money saved above the size is spare.
 * - Any size is respected, however small (D-05). A size of 0 is treated exactly like protection off, and says so (D-06).
 * - With protection off, the money in the net counts like any other money; a purchase that uses it says so (protection_off).
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { ceilDivide } from '../../payoff/types';
import { NET_STARTER_MONTHS } from './constants';
import type { EssentialCosts } from './essentialCosts';
import type { V3Inputs, Variant } from './types';

export type NetState = 'none' | 'small' | 'full' | 'above';

export interface ResolvedNet {
  /** Protection as set (true when no record exists). */
  readonly protect: boolean;
  /** Protection off, or on with a size of 0 (D-06): the net's money counts like any other money. */
  readonly off: boolean;
  /** Protection on with a size of 0 (D-06): the answer says it is treated as off. */
  readonly zeroIsOff: boolean;
  /** The size in force: the user's size, or the starter. */
  readonly size: MinorUnits;
  /** 1 month of essential costs, rounded up (ARC-07). */
  readonly starter: MinorUnits;
  readonly saved: MinorUnits;
  /** The protected floor: min(saved, size); 0 when off. */
  readonly floor: MinorUnits;
  /** Money saved above the size, which counts as spare (D-35); 0 when off. */
  readonly aboveSize: MinorUnits;
  /** What the net can lend a purchase beyond spare money: the protected floor, or everything saved when off. */
  readonly usable: MinorUnits;
  readonly state: NetState;
}

/** The net in force for these inputs. A size or saved figure below 0 counts as 0. */
export function resolveSafetyNet(inputs: V3Inputs, essential: EssentialCosts): ResolvedNet {
  const sn = inputs.safetyNet ?? null;
  const protect = sn === null ? true : sn.protect;
  const starter = essential.total * NET_STARTER_MONTHS;
  const rawSize = sn === null || sn.size === null ? starter : sn.size;
  const size = rawSize > 0 ? rawSize : 0;
  const rawSaved = sn === null ? (inputs.emergency?.amount ?? 0) : sn.saved;
  const saved = rawSaved > 0 ? rawSaved : 0;
  const zeroIsOff = protect && size === 0;
  const off = !protect || zeroIsOff;
  const floor = off ? 0 : Math.min(saved, size);
  const aboveSize = off ? 0 : saved - floor;
  let state: NetState = 'full';
  if (saved === 0) state = 'none';
  else if (saved < size) state = 'small';
  else if (saved > size) state = 'above';
  return {
    protect,
    off,
    zeroIsOff,
    size: minorUnits(size),
    starter: minorUnits(starter),
    saved: minorUnits(saved),
    floor: minorUnits(floor),
    aboveSize: minorUnits(aboveSize),
    usable: minorUnits(off ? saved : floor),
    state,
  };
}

/** The no-net figures for hand-built judge inputs: protection off with nothing saved, so the previous rules apply unchanged. */
export const NO_NET: ResolvedNet = Object.freeze({
  protect: false,
  off: true,
  zeroIsOff: false,
  size: minorUnits(0),
  starter: minorUnits(0),
  saved: minorUnits(0),
  floor: minorUnits(0),
  aboveSize: minorUnits(0),
  usable: minorUnits(0),
  state: 'none',
});

export interface NetDip {
  /** Money taken from the net's protected part (or from the net when protection is off). */
  readonly used: MinorUnits;
  /** What stays in the net after the purchase (money above the size taken first). */
  readonly left: MinorUnits;
  /** Months of usual spare money to put the used money back: ceil(used / typicalLeft); null when the usual month leaves nothing. */
  readonly refillMonths: number | null;
}

/**
 * How a purchase dips into the net: `need` is what spare money (and money above the size) cannot carry, `fromAbove` the money
 * above the size it also takes. used never exceeds what the net can lend.
 */
export function netDip(need: MinorUnits, fromAbove: MinorUnits, net: ResolvedNet, typicalLeft: MinorUnits | null): NetDip {
  const want = need > 0 ? need : 0;
  const used = Math.min(want, net.usable);
  const taken = used + (fromAbove > 0 ? fromAbove : 0);
  const left = net.saved - taken > 0 ? net.saved - taken : 0;
  let refillMonths: number | null = null;
  if (used === 0) refillMonths = 0;
  else if (typicalLeft !== null && typicalLeft > 0) refillMonths = Number(ceilDivide(BigInt(used), BigInt(typicalLeft)));
  return { used: minorUnits(used), left: minorUnits(left), refillMonths };
}

/**
 * The fixed order of the variants on a fit (05.4-12 revision notes section 1): low_month / tight > costly_debt > no_net /
 * small_net. tight (05.4-21) and costly_debt (05.4-20) are inserted here by their plans.
 */
export const FIT_VARIANT_ORDER: readonly Variant[] = ['low_month', 'no_net', 'small_net'];

/** The winning variant and the losers, in order. A losing variant's fact still shows. */
export function fitVariant(candidates: readonly Variant[]): { readonly variant: Variant | null; readonly losers: readonly Variant[] } {
  const ranked = FIT_VARIANT_ORDER.filter((v) => candidates.includes(v));
  return { variant: ranked[0] ?? null, losers: ranked.slice(1) };
}
