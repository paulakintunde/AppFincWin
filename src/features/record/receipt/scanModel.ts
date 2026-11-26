// 10.1-24 (SCN-02, SCN-03, SCN-05; D-11, D-12, D-13, D-16, D-20): the scan review's draft as pure functions. Nothing here
// writes anything: the draft only holds what the phone read and what the user changed, and every sum goes through the
// engine's reconcile and itemsToParts. Amounts are positive integer minor units as printed (null = empty field); the line's
// sign is applied only in toPrivateSave.
import { itemShares, itemsToParts, reconcile } from '@/engine/receipt';
import type { Field, ItemSharesResult, ParseOutcome, ReceiptFrame, Reconcile } from '@/engine/receipt';
import { primaryCategory } from '@/engine/parts';
import type { Part } from '@/engine/parts';

export interface ReviewItem {
  key: string;
  name: string;
  price: number | null;
  discount: number;
  categoryId: string | null;
  likely: boolean;
  unsure: boolean;
  /** In the page image's own pixels (the merged offset is taken off again), for the 96 x 96 crop. */
  frame: ReceiptFrame | null;
  page: number;
  /** 10.1-26 (D-14): who shares this item, in household member order. Null on a private line (no people at all). */
  people: string[] | null;
}

export interface ReviewExtra {
  key: string;
  kind: 'tax' | 'tip' | 'discount';
  name: string;
  amount: number | null;
  unsure: boolean;
}

export interface ReviewImage {
  uri: string;
  mime: string;
  /** The page's pixel size as the reader saw it; null when unknown (no crop is shown then). */
  width?: number | null;
  height?: number | null;
}

export interface ReviewDraft {
  mode: 'new' | 'existing';
  store: Field<string | null>;
  date: Field<string | null>;
  total: Field<number | null>;
  items: ReviewItem[];
  extras: ReviewExtra[];
  totalChoice: 'receipt' | 'items' | null;
  taxTipCategoryId: string | null;
  images: ReviewImage[];
  /** 10.1-26: the household's members on a shared line (who can be given an item); null on a private or new line. */
  members: ReviewMember[] | null;
  /** 10.1-26: the people of the line's usual split, which every item starts on (D-14); null when there are no people. */
  usual: string[] | null;
  /** 10.1-26: "Split items between people" is on; confirm then saves the split by item, not only the parts. */
  byItem: boolean;
}

export interface ReviewMember {
  id: string;
  name: string;
}

/** Where each page starts in the merged reading (useReadReceipt stacks pages top to bottom). */
export interface PageOffset {
  page: number;
  top: number;
}

export interface FromParsedContext {
  mode: 'new' | 'existing';
  images: ReviewImage[];
  lineTotal?: number;
  lineCategoryId?: string | null;
  pageOffsets?: readonly PageOffset[];
  suggest(name: string, store: string | null): { categoryId: string | null; source: string };
}

let counter = 0;
const nextKey = (prefix: string): string => `${prefix}-${++counter}`;

function placeFrame(frame: ReceiptFrame | null, offsets: readonly PageOffset[]): { frame: ReceiptFrame | null; page: number } {
  if (frame === null || offsets.length === 0) return { frame, page: offsets[0]?.page ?? 0 };
  let at = offsets[0] as PageOffset;
  for (const o of offsets) if (frame.top >= o.top) at = o;
  return { frame: { ...frame, top: frame.top - at.top }, page: at.page };
}

export function fromParsed(o: ParseOutcome | null, ctx: FromParsedContext): ReviewDraft {
  const receipt = o?.receipt ?? null;
  const readable = o !== null && o.readable;
  const store: Field<string | null> = receipt?.store ?? { value: null, unsure: true };
  const date: Field<string | null> = receipt?.date ?? { value: null, unsure: true };
  let total: Field<number | null>;
  if (ctx.mode === 'existing') total = { value: Math.abs(ctx.lineTotal ?? 0), unsure: false };
  else total = readable && receipt ? receipt.total : { value: null, unsure: true };

  const offsets = ctx.pageOffsets ?? [];
  const items: ReviewItem[] =
    readable && receipt
      ? receipt.items.map((it) => {
          const guess = ctx.suggest(it.name, store.value);
          const placed = placeFrame(it.frame, offsets);
          return {
            key: nextKey('item'),
            name: it.name,
            price: it.price,
            discount: it.discount,
            categoryId: guess.categoryId,
            likely: guess.categoryId !== null && (guess.source === 'item' || guess.source === 'store'),
            unsure: it.unsure,
            frame: placed.frame,
            page: placed.page,
            people: null,
          };
        })
      : [];
  const extras: ReviewExtra[] =
    readable && receipt
      ? receipt.extras.map((x) => ({ key: nextKey('extra'), kind: x.kind, name: x.name, amount: x.amount, unsure: x.unsure }))
      : [];

  return {
    mode: ctx.mode,
    store,
    date,
    total,
    items,
    extras,
    totalChoice: null,
    taxTipCategoryId: ctx.lineCategoryId ?? null,
    images: ctx.images,
    members: null,
    usual: null,
    byItem: false,
  };
}

/** The people a new item starts on: the usual split's, or null when the draft has no people. */
function startPeople(d: ReviewDraft): string[] | null {
  return d.members === null ? null : [...(d.usual ?? d.members.map((m) => m.id))];
}

// ---- edits -------------------------------------------------------------------------------------------------------------

export function setStore(d: ReviewDraft, value: string | null): ReviewDraft {
  return { ...d, store: { value: value === null || value.trim() === '' ? null : value, unsure: false } };
}

export function setDate(d: ReviewDraft, value: string | null): ReviewDraft {
  return { ...d, date: { value, unsure: false } };
}

export function setTotal(d: ReviewDraft, value: number | null): ReviewDraft {
  return { ...d, total: { value, unsure: false }, totalChoice: null };
}

function patchItem(d: ReviewDraft, key: string, patch: Partial<ReviewItem>): ReviewDraft {
  if (!d.items.some((i) => i.key === key)) return d;
  return { ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) };
}

export function setItemName(d: ReviewDraft, key: string, name: string): ReviewDraft {
  return patchItem(d, key, { name, unsure: false });
}

export function setItemPrice(d: ReviewDraft, key: string, price: number | null): ReviewDraft {
  return patchItem(d, key, { price, unsure: false });
}

export function setItemCategory(d: ReviewDraft, key: string, categoryId: string | null): ReviewDraft {
  return patchItem(d, key, { categoryId, likely: false });
}

export function addItem(d: ReviewDraft, name = ''): ReviewDraft {
  const item: ReviewItem = {
    key: nextKey('item'),
    name,
    price: null,
    discount: 0,
    categoryId: d.items.length > 0 ? (d.items[d.items.length - 1] as ReviewItem).categoryId : d.taxTipCategoryId,
    likely: false,
    unsure: false,
    frame: null,
    page: 0,
    people: startPeople(d),
  };
  return { ...d, items: [...d.items, item] };
}

export function removeItem(d: ReviewDraft, key: string): ReviewDraft {
  if (!d.items.some((i) => i.key === key)) return d;
  return { ...d, items: d.items.filter((i) => i.key !== key) };
}

export function setExtraAmount(d: ReviewDraft, key: string, amount: number | null): ReviewDraft {
  if (!d.extras.some((x) => x.key === key)) return d;
  return { ...d, extras: d.extras.map((x) => (x.key === key ? { ...x, amount, unsure: false } : x)) };
}

export function removeExtra(d: ReviewDraft, key: string): ReviewDraft {
  if (!d.extras.some((x) => x.key === key)) return d;
  return { ...d, extras: d.extras.filter((x) => x.key !== key) };
}

// ---- people (10.1-26, D-14, D-15) ---------------------------------------------------------------------------------------

/** Keeps the household's member order (the tie rule gives an odd cent in people order, the same order the server gets). */
function inMemberOrder(d: ReviewDraft, ids: readonly string[]): string[] {
  if (d.members === null) return [...ids];
  const order = new Map(d.members.map((m, k) => [m.id, k] as const));
  return [...new Set(ids)].filter((id) => order.has(id)).sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
}

/**
 * A shared line's people: the household's members, and the people of the line's usual split. Every item starts on the usual
 * people and "Split items between people" starts on (UI-SPEC 6). A private line never calls this, so it has no people at all.
 */
export function withMembers(d: ReviewDraft, members: readonly ReviewMember[], usual: readonly string[]): ReviewDraft {
  return withUsualPeople({ ...d, members: [...members], byItem: true }, usual);
}

/** Every item gets the usual participants (D-14). Unknown ids are dropped; with none left, every member is used. */
export function withUsualPeople(d: ReviewDraft, usual: readonly string[]): ReviewDraft {
  if (d.members === null) return d;
  let people = inMemberOrder(d, usual);
  if (people.length === 0) people = d.members.map((m) => m.id);
  return { ...d, usual: people, items: d.items.map((i) => ({ ...i, people: [...people] })) };
}

/** "Back to the usual split": every item back on the usual people. */
export function resetToUsual(d: ReviewDraft, usual: readonly string[]): ReviewDraft {
  return withUsualPeople(d, usual);
}

/** Gives or takes one person on one item. At least one person stays on every item. */
export function togglePerson(d: ReviewDraft, itemKey: string, memberId: string): ReviewDraft {
  const item = d.items.find((i) => i.key === itemKey);
  if (!item || item.people === null || d.members === null || !d.members.some((m) => m.id === memberId)) return d;
  const on = item.people.includes(memberId);
  if (on && item.people.length === 1) return d;
  const people = on ? item.people.filter((p) => p !== memberId) : inMemberOrder(d, [...item.people, memberId]);
  return patchItem(d, itemKey, { people });
}

/** Turns "Split items between people" on or off (a shared line only). */
export function setByItem(d: ReviewDraft, on: boolean): ReviewDraft {
  if (d.members === null) return d;
  return { ...d, byItem: on };
}

function extrasSum(d: ReviewDraft, kind: ReviewExtra['kind']): number {
  return d.extras.filter((x) => x.kind === kind).reduce((s, x) => s + (x.amount ?? 0), 0);
}

/**
 * Each person's share as the items stand (D-15: tax, tip and discounts in proportion to each person's items). A preview only:
 * the server works the shares out again on save (T-10.1-26-01), with the same maths (parity proven in 10.1-14).
 */
export function sharesPreview(d: ReviewDraft): ItemSharesResult {
  return itemShares({
    members: (d.members ?? []).map((m) => m.id),
    items: d.items.map((i) => ({ price: i.price ?? 0, discount: i.discount, people: i.people ?? [] })),
    tax: extrasSum(d, 'tax'),
    tip: extrasSum(d, 'tip'),
    discounts: extrasSum(d, 'discount'),
  });
}

// ---- sums --------------------------------------------------------------------------------------------------------------

/** D-12: items (net of their own discounts) + tax + tip - discounts against the total, by how much. Empty fields count 0. */
export function reviewBalance(d: ReviewDraft): Reconcile {
  return reconcile({
    items: d.items.map((i) => ({ key: i.key, name: i.name, price: i.price ?? 0, discount: i.discount, unsure: i.unsure, frame: null })),
    extras: d.extras.map((x) => ({ key: x.key, kind: x.kind, name: x.name, amount: x.amount ?? 0, unsure: x.unsure, frame: null })),
    total: d.total,
  });
}

export type ConfirmBlock = 'noItems' | 'emptyPrice' | 'noTotal' | 'mismatch';

/** T-10.1-24-01: nothing unbalanced or half-typed can be confirmed. */
export function canConfirm(d: ReviewDraft): { ok: true } | { ok: false; reason: ConfirmBlock } {
  if (d.items.length === 0) return { ok: false, reason: 'noItems' };
  if (d.items.some((i) => i.price === null || i.price <= 0) || d.extras.some((x) => x.amount === null)) {
    return { ok: false, reason: 'emptyPrice' };
  }
  const b = reviewBalance(d);
  if (b.state === 'noTotal' || b.total === null || b.total <= 0) return { ok: false, reason: 'noTotal' };
  if (b.state !== 'match') return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/**
 * "Use the receipt total": the total stays; the gap becomes an 'Other' item the user can name (items short of the total)
 * or an 'Other' discount (items over the total).
 */
export function applyReceiptTotal(d: ReviewDraft, otherName = 'Other'): ReviewDraft {
  const b = reviewBalance(d);
  if (b.diff === null) return d;
  const gap = -b.diff; // total - computed
  if (gap === 0) return { ...d, totalChoice: 'receipt' };
  if (gap > 0) {
    const item: ReviewItem = {
      key: nextKey('other'),
      name: otherName,
      price: gap,
      discount: 0,
      categoryId: d.taxTipCategoryId,
      likely: false,
      unsure: false,
      frame: null,
      page: 0,
      people: startPeople(d),
    };
    return { ...d, items: [...d.items, item], totalChoice: 'receipt' };
  }
  const extra: ReviewExtra = { key: nextKey('other'), kind: 'discount', name: otherName, amount: -gap, unsure: false };
  return { ...d, extras: [...d.extras, extra], totalChoice: 'receipt' };
}

/** "Use the items total": the total becomes what the items, tax and tip, less discounts, come to. */
export function applyItemsTotal(d: ReviewDraft): ReviewDraft {
  const b = reviewBalance(d);
  return { ...d, total: { value: b.computed, unsure: false }, totalChoice: 'items' };
}

/** What a private (or new) line saves: its total, its parts (null when one category), and the line's category. */
export function toPrivateSave(
  d: ReviewDraft,
  lineSign: 1 | -1,
  lineCategoryId: string | null,
): { total: number; parts: Part[] | null; categoryId: string | null } {
  const tax = extrasSum(d, 'tax');
  const tip = extrasSum(d, 'tip');
  const discounts = extrasSum(d, 'discount');
  const items = d.items.map((i) => ({ price: i.price ?? 0, discount: i.discount, categoryId: i.categoryId }));
  const parts = itemsToParts({ lineSign, lineCategoryId, taxTipCategoryId: d.taxTipCategoryId, items, tax, tip, discounts });
  const total = d.total.value ?? reviewBalance(d).computed;
  const single = d.items.find((i) => (i.price ?? 0) - i.discount > 0)?.categoryId ?? d.items[0]?.categoryId ?? null;
  const categoryId = parts === null ? (single ?? lineCategoryId) : primaryCategory(parts);
  return { total, parts, categoryId };
}

export interface ItemSplitSave {
  items: { name: string; price: number; discount: number; c: string | null; people: string[] }[];
  extras: { tax: number; tip: number; discounts: number };
  /** Signed like the line (with the 'Tax and tip' part, D-20); null when the items come to one category. */
  parts: Part[] | null;
  /** With null parts: the line's one category. */
  category: string | null;
  store: string | null;
  date: string | null;
}

/** What a shared line's split by item sends: the items with their people, the extras, and the parts (D-14..D-17, D-20). */
export function toItemSplitSave(d: ReviewDraft, lineSign: 1 | -1, lineCategoryId: string | null): ItemSplitSave {
  const save = toPrivateSave(d, lineSign, lineCategoryId);
  return {
    items: d.items.map((i) => ({ name: i.name, price: i.price ?? 0, discount: i.discount, c: i.categoryId, people: [...(i.people ?? [])] })),
    extras: { tax: extrasSum(d, 'tax'), tip: extrasSum(d, 'tip'), discounts: extrasSum(d, 'discount') },
    parts: save.parts,
    category: save.parts === null ? save.categoryId : null,
    store: d.store.value,
    date: d.date.value,
  };
}

/** Whether the user changed anything since the draft was built (the sheet's discard prompt). */
export function draftSignature(d: ReviewDraft): string {
  return JSON.stringify([
    d.store.value,
    d.date.value,
    d.total.value,
    d.items.map((i) => [i.name, i.price, i.categoryId, i.people]),
    d.extras.map((x) => [x.kind, x.amount]),
    d.byItem,
  ]);
}
