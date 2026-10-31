/**
 * 05.3-16 (D-10, P-12). PURE. Purpose and item-type option lists for the Check screen.
 * Order is fixed here; custom options follow in stored order. Retired item types (rent_bill, loan_repayment,
 * cash_equivalent) appear only as a read-only chip when a stored check carries one (T-05.3-16-03).
 * 05.3-83: an own option the user later deleted also shows as one read-only selected chip, by its stored name.
 */
import type { ItemTypeRef, Purpose } from '@/engine/decide/v3';

export const PURPOSE_ORDER = ['invest_in_me', 'for_work', 'necessity', 'nice_to_have', 'treat', 'luxury'] as const;
export const ITEM_TYPE_ORDER = ['general', 'electronics', 'vehicle', 'property', 'subscription', 'tuition', 'tax', 'insurance_premium', 'emergency_repair'] as const;

export interface CustomLabel {
  readonly id: string;
  readonly label: string;
}

export interface PurposeOption {
  readonly ref: Purpose;
  readonly labelKey: string | null;
  readonly label: string | null;
  readonly selected: boolean;
  readonly readOnly: boolean;
}

export interface ItemTypeOption {
  readonly ref: ItemTypeRef;
  readonly labelKey: string | null;
  readonly label: string | null;
  readonly selected: boolean;
  readonly readOnly: boolean;
}

const REMOVED_KEY = 'decide.v3.ui.ownOptions.removedName';
const NO_RETIRED: ReadonlyMap<string, string> = new Map();

export function purposeOptions(
  selected: Purpose | null,
  custom: readonly CustomLabel[],
  retired: ReadonlyMap<string, string> = NO_RETIRED,
): readonly PurposeOption[] {
  const presets: PurposeOption[] = PURPOSE_ORDER.map((value) => ({
    ref: { kind: 'preset', value },
    labelKey: `decide.v3.ui.layers.purpose.${value}`,
    label: null,
    selected: selected !== null && selected.kind === 'preset' && selected.value === value,
    readOnly: false,
  }));
  const customs: PurposeOption[] = custom.map((c) => ({
    ref: { kind: 'custom', id: c.id },
    labelKey: null,
    label: c.label,
    selected: selected !== null && selected.kind === 'custom' && selected.id === c.id,
    readOnly: false,
  }));
  const gone: PurposeOption[] =
    selected !== null && selected.kind === 'custom' && !custom.some((c) => c.id === selected.id)
      ? [{ ref: selected, labelKey: retired.has(selected.id) ? null : REMOVED_KEY, label: retired.get(selected.id) ?? null, selected: true, readOnly: true }]
      : [];
  return [...presets, ...customs, ...gone];
}

const ORDER: readonly string[] = ITEM_TYPE_ORDER;

export function itemTypeOptions(
  selected: ItemTypeRef,
  custom: readonly CustomLabel[],
  retired: ReadonlyMap<string, string> = NO_RETIRED,
): readonly ItemTypeOption[] {
  const out: ItemTypeOption[] = ITEM_TYPE_ORDER.map((value) => ({
    ref: { kind: 'preset', value },
    labelKey: `decide.v3.ui.check.itemType.${value}`,
    label: null,
    selected: selected.kind === 'preset' && selected.value === value,
    readOnly: false,
  }));
  for (const c of custom) {
    out.push({ ref: { kind: 'custom', id: c.id }, labelKey: null, label: c.label, selected: selected.kind === 'custom' && selected.id === c.id, readOnly: false });
  }
  if (selected.kind === 'custom' && !custom.some((c) => c.id === selected.id)) {
    out.push({ ref: selected, labelKey: retired.has(selected.id) ? null : REMOVED_KEY, label: retired.get(selected.id) ?? null, selected: true, readOnly: true });
  }
  if (selected.kind === 'preset' && !ORDER.includes(selected.value)) {
    out.push({ ref: selected, labelKey: `decide.v3.ui.check.itemType.${selected.value}`, label: null, selected: true, readOnly: true });
  }
  return out;
}
