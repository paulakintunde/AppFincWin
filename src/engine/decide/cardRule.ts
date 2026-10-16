import { assertNever } from '../guards/assertNever';

/**
 * Card eligibility is read from the explicit item type on the check
 * (D-14, DEC-10), so a user can correct a misclassification. The prototype
 * sniffed the item name with a regex; that survives only as
 * suggestItemType(), a pre-fill helper.
 */
export const ITEM_TYPES = [
  'vehicle',
  'rent_bill',
  'loan_repayment',
  'tax',
  'insurance_premium',
  'general',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export type CardEligibility = 'blocked' | 'capped' | 'permitted';

export function cardEligibility(itemType: ItemType): CardEligibility {
  switch (itemType) {
    case 'rent_bill':
    case 'loan_repayment':
    case 'tax':
    case 'insurance_premium':
      return 'blocked';
    case 'vehicle':
      return 'capped';
    case 'general':
      return 'permitted';
    default:
      return assertNever(itemType, 'itemType');
  }
}

/**
 * Pre-fill suggestion only (D-14). The verdict path reads BuyCheck.itemType;
 * plan.ts and assess.ts must never import this function.
 *
 * Normalised as the prototype did: lower-case, non-alphanumerics to spaces,
 * space-padded so matches are whole words ('car' does not match 'cardigan').
 * Blocked types are tested before capped, as in the prototype. 'bill'/'bills'
 * is a deliberate extension of the prototype vocabulary.
 */
export function suggestItemType(itemName: string): ItemType {
  const s = ' ' + itemName.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (/ (rent|bill|bills) /.test(s)) return 'rent_bill';
  if (/ (tax|taxes) /.test(s)) return 'tax';
  if (/ (premium|premiums) /.test(s)) return 'insurance_premium';
  if (/ (note|notes|loan|loans|mortgage|repayment|repayments|instalment|instalments) /.test(s)) {
    return 'loan_repayment';
  }
  if (/ (car|cars|vehicle|vehicles|truck|van|motorbike|motorcycle|suv) /.test(s)) return 'vehicle';
  return 'general';
}
