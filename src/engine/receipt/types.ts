// 10.1-13 (SCN-05, SCN-06): receipt shapes shared with the parser. Amounts are positive integer minor units as printed.
export interface ReceiptFrame { left: number; top: number; width: number; height: number }
export interface ReceiptOcrLine { text: string; frame: ReceiptFrame | null }
export interface ReceiptOcr { lines: readonly ReceiptOcrLine[]; imageWidth: number | null; imageHeight: number | null }
export interface Field<T> { value: T; unsure: boolean }
/** price, discount: positive minor units as printed; discount attached to this item (0 if none). */
export interface ReceiptItem { key: string; name: string; price: number; discount: number; unsure: boolean; frame: ReceiptFrame | null }
export type ExtraKind = 'tax' | 'tip' | 'discount';
/** amount positive; a 'discount' extra is receipt-level (not attached to an item). */
export interface ReceiptExtra { key: string; kind: ExtraKind; name: string; amount: number; unsure: boolean; frame: ReceiptFrame | null }
export interface ParsedReceipt {
  store: Field<string | null>;
  date: Field<string | null>;
  total: Field<number | null>;
  items: ReceiptItem[];
  extras: ReceiptExtra[];
  currency: string;
}
/** computed = items(net) + tax + tip - discounts; diff = computed - total. */
export interface Reconcile {
  itemsTotal: number;
  extrasNet: number;
  computed: number;
  total: number | null;
  diff: number | null;
  state: 'match' | 'over' | 'short' | 'noTotal';
}
