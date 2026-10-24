import { assertNever } from '../guards/assertNever';

/**
 * Card eligibility is read from the explicit item type on the check
 * (D-14, DEC-10), so a user can correct a misclassification. The prototype
 * sniffed the item name with a regex; that survives only as
 * suggestItemType(), a pre-fill helper.
 *
 * D-92 (R16.8, R16.11 E5): property, cash_equivalent and tuition join the list; tax is region-aware.
 */
export const ITEM_TYPES = [
  'vehicle',
  'rent_bill',
  'loan_repayment',
  'tax',
  'insurance_premium',
  'general',
  'property',
  'cash_equivalent',
  'tuition',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export type CardEligibility = 'blocked' | 'capped' | 'permitted';

/** D-92: the fee or region note that sits under the eligibility box. Notes never pre-fill Card fees (04 D-07). */
export type CardNote = 'tuition_fee' | 'tax_processing_fee' | 'tax_gb';

export interface CardRule {
  readonly eligibility: CardEligibility;
  readonly note: CardNote | null;
}

/**
 * `region` is the RD-02 country code, or null when none is known. Tax is blocked in GB only (HMRC has not taken
 * personal credit cards since January 2018); everywhere else, including no region, it is permitted with a processor-fee note.
 */
export function cardEligibility(itemType: ItemType, region: string | null): CardRule {
  switch (itemType) {
    case 'rent_bill':
    case 'loan_repayment':
    case 'insurance_premium':
    case 'property':
    case 'cash_equivalent':
      return { eligibility: 'blocked', note: null };
    case 'tax':
      return region !== null && region.trim().toUpperCase() === 'GB'
        ? { eligibility: 'blocked', note: 'tax_gb' }
        : { eligibility: 'permitted', note: 'tax_processing_fee' };
    case 'tuition':
      return { eligibility: 'permitted', note: 'tuition_fee' };
    case 'vehicle':
      return { eligibility: 'capped', note: null };
    case 'general':
      return { eligibility: 'permitted', note: null };
    default:
      return assertNever(itemType, 'itemType');
  }
}

/**
 * Pre-fill suggestion only (D-14). The verdict path reads BuyCheck.itemType;
 * plan.ts and assess.ts must never import this function.
 *
 * Normalised as the prototype did: lower-case, non-alphanumerics to spaces,
 * space-padded so matches are whole words ('car' does not match 'cardigan') and
 * multi-word phrases match as phrases. Order (R16.8): property, cash_equivalent,
 * the existing blocked types, tuition, vehicle, general. Bare home, flat, land,
 * deposit, wire, bet, shares and stocks are not keywords (M5). A weak property
 * phrase ('down payment') yields to a vehicle signal. 'bill'/'bills' is a
 * deliberate extension of the prototype vocabulary.
 */
const PROPERTY_STRONG = / (house deposit|mortgage deposit|buy a house|property|condo|apartment purchase) /;
const PROPERTY_WEAK = / down payment /;
const CASH_LIKE = / (wire transfer|money orders?|gift cards?|crypto|bitcoin|casino|gambling|betting) /;
const VEHICLE = / (car|cars|vehicle|vehicles|truck|van|motorbike|motorcycle|suv) /;

export function suggestItemType(itemName: string): ItemType {
  const s = ' ' + itemName.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (PROPERTY_STRONG.test(s)) return 'property';
  if (PROPERTY_WEAK.test(s) && !VEHICLE.test(s)) return 'property';
  if (CASH_LIKE.test(s)) return 'cash_equivalent';
  if (/ (rent|bill|bills) /.test(s)) return 'rent_bill';
  if (/ (tax|taxes) /.test(s)) return 'tax';
  if (/ (premium|premiums) /.test(s)) return 'insurance_premium';
  if (/ (note|notes|loan|loans|mortgage|repayment|repayments|instalment|instalments) /.test(s)) {
    return 'loan_repayment';
  }
  if (/ (tuition|school fees|course fees|college|university) /.test(s)) return 'tuition';
  if (VEHICLE.test(s)) return 'vehicle';
  return 'general';
}
