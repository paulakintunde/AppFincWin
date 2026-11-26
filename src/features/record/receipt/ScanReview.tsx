// 10.1-24 (SCN-02, SCN-03, SCN-05; D-11, D-12, D-16; UI-SPEC 5d): "Check the receipt". Store, Date and Total; the items with a
// likely category each; tax, tip and discounts as their own rows; "Doesn't add up" with by how much, at the top and above the
// button; the footer note. Nothing is saved here: the primary button only hands the draft to the sheet, and it stays disabled
// until the list is complete and adds up (T-10.1-24-01).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Row } from '@/ui/Row';
import { TextInput } from '@/ui/TextInput';
import { MoneyInput } from '@/ui/MoneyInput';
import { WarningCard } from '@/ui/WarningCard';
import { Glyph } from '@/ui/icons/Glyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { hapticWarn } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { money as toMoney } from '@/engine/money';
import type { CategoryRow } from '@/db/rows';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecordContext } from '../useRecordContext';
import { categoryName } from '../categoryName';
import { CategoryPicker } from '../entry/pickers/CategoryPicker';
import { DateField } from '../entry/pickers/DateField';
import { CROP_SIZE, ItemRow, type CropSource } from './ItemRow';
import {
  addItem,
  applyItemsTotal,
  applyReceiptTotal,
  canConfirm,
  removeExtra,
  removeItem,
  reviewBalance,
  setDate,
  setExtraAmount,
  setItemCategory,
  setItemName,
  setItemPrice,
  setStore,
  setTotal,
  type ReviewDraft,
  type ReviewExtra,
} from './scanModel';

export interface ScanReviewProps {
  draft: ReviewDraft;
  currency: string;
  onChange(next: ReviewDraft): void;
  onConfirm(): void;
  onDiscard(): void;
  onTryAnother(): void;
  pending?: boolean;
  conflict?: string | null;
}

export function ScanReview({ draft, currency, onChange, onConfirm, onDiscard, onTryAnother, pending = false, conflict = null }: ScanReviewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const formatter = useMoneyFormatter(rc.showCents, rc.homeCurrency);
  const money = (minor: number) => formatter.formatMoney(toMoney(minor, currency));
  const spoken = (minor: number) => formatter.formatMoneyA11y(toMoney(minor, currency));

  const [picker, setPicker] = useState<string | null>(null);
  const [editing, setEditing] = useState<'store' | 'total' | null>(null);
  const [editingExtra, setEditingExtra] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const balance = reviewBalance(draft);
  const verdict = canConfirm(draft);
  const mismatch = draft.items.length > 0 && (balance.state === 'over' || balance.state === 'short');

  // UI-SPEC Interaction: hapticWarn when "Doesn't add up" appears (not on every render).
  const wasMismatch = useRef(false);
  useEffect(() => {
    if (mismatch && !wasMismatch.current) hapticWarn();
    wasMismatch.current = mismatch;
  }, [mismatch]);

  const choices = useMemo<CategoryRow[]>(() => lookup.active, [lookup.active]);
  const nameOf = (id: string | null): string | null => {
    if (id === null) return null;
    const row = lookup.byId.get(id);
    return row ? categoryName(row, t) : null;
  };
  const cropFor = (page: number): CropSource | null => {
    const img = draft.images[page];
    return img && img.width && img.height ? { uri: img.uri, width: img.width, height: img.height } : null;
  };

  const notRead = t('scan.review.notRead');
  const check = (unsure: boolean) =>
    unsure ? (
      <View style={[styles.badge, { backgroundColor: stateColors.tight.tint }]}>
        <Glyph name="caution" size={16} color={stateColors.tight.color} />
        <Text style={{ ...textRole(pairing, 'label'), color: stateColors.tight.color }}>{t('scan.review.checkThis')}</Text>
      </View>
    ) : null;

  const mismatchCard = (where: 'top' | 'bottom') => {
    if (!mismatch || balance.diff === null || balance.total === null) return null;
    const value = t(balance.state === 'over' ? 'scan.review.mismatch.over' : 'scan.review.mismatch.short', { amount: money(Math.abs(balance.diff)) });
    return (
      <View style={styles.mismatch} testID={`scan-mismatch-${where}`}>
        <WarningCard
          tone="soft"
          title={t('scan.review.mismatch.title')}
          value={value}
          body={[t('scan.review.mismatch.body', { itemsTotal: money(balance.computed), total: money(balance.total) })]}
        />
        <View style={styles.links}>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={() => onChange(applyReceiptTotal(draft, t('scan.review.other')))} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.review.useReceiptTotal')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={() => onChange(applyItemsTotal(draft))} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.review.useItemsTotal')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const extraRow = (x: ReviewExtra) => {
    const shown = x.amount === null ? notRead : x.kind === 'discount' ? `-${money(x.amount)}` : money(x.amount);
    const label = x.kind === 'discount' && x.name.trim() === '' ? t('scan.review.discount') : x.name;
    return (
      <View key={x.key} style={styles.extra} testID={`scan-extra-${x.key}`}>
        <View style={{ flex: 1 }}>
          {editingExtra === x.key ? (
            <MoneyInput
              value={x.amount}
              currency={currency}
              onChange={(minor) => onChange(setExtraAmount(draft, x.key, minor))}
              onBlur={() => setEditingExtra(null)}
              label={label}
              accessibilityLabel={label}
              amountField={{}}
            />
          ) : (
            <Row
              label={label}
              sublabel={x.kind === 'discount' ? t('scan.review.discount') : undefined}
              amount={shown}
              dense
              onPress={() => setEditingExtra(x.key)}
              status={check(x.unsure)}
              statusText={x.unsure ? t('scan.review.checkThis') : undefined}
              accessibilityLabel={`${label}, ${x.amount === null ? notRead : (x.kind === 'discount' ? '-' : '') + spoken(x.amount)}${x.unsure ? `, ${t('scan.review.checkThis')}` : ''}`}
            />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.item.remove', { name: label })}
          onPress={() => onChange(removeExtra(draft, x.key))}
          style={styles.remove}
        >
          <Glyph name="delete" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
    );
  };

  const addItemNow = () => {
    const next = addItem(draft);
    setFresh(next.items[next.items.length - 1]?.key ?? null);
    onChange(next);
  };

  const pickFor = picker === null ? undefined : draft.items.find((i) => i.key === picker);
  const primaryLabel = draft.mode === 'new' ? t('scan.review.addLine') : t('scan.review.use');
  const blocked = !verdict.ok || pending;
  const firstImage = draft.images[0];

  return (
    <View style={styles.column} testID="scan-review">
      {mismatchCard('top')}

      <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="scan-header">
        {editing === 'store' ? (
          <TextInput
            value={draft.store.value ?? ''}
            onChangeText={(v) => onChange(setStore(draft, v))}
            onBlur={() => setEditing(null)}
            autoFocus
            accessibilityLabel={t('scan.review.store')}
            style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.surface }]}
            testID="scan-store-input"
          />
        ) : (
          <Row label={t('scan.review.store')} value={draft.store.value ?? notRead} chevron dense onPress={() => setEditing('store')} status={check(draft.store.unsure)} />
        )}
        <DateField
          label={t('scan.review.date')}
          value={draft.date.value ?? rc.today}
          display={draft.date.value ? formatter.formatDate(draft.date.value) : notRead}
          onChange={(d) => onChange(setDate(draft, d))}
          renderTrigger={(open) => (
            <Row
              label={t('scan.review.date')}
              value={draft.date.value ? formatter.formatDate(draft.date.value) : notRead}
              chevron
              dense
              onPress={open}
              status={check(draft.date.unsure)}
            />
          )}
        />
        {editing === 'total' && draft.mode === 'new' ? (
          <MoneyInput
            value={draft.total.value}
            currency={currency}
            onChange={(minor) => onChange(setTotal(draft, minor))}
            onBlur={() => setEditing(null)}
            label={t('scan.review.total')}
            accessibilityLabel={t('scan.review.total')}
            amountField={{}}
          />
        ) : (
          <Row
            label={t('scan.review.total')}
            emphasis
            amount={draft.total.value === null ? notRead : money(draft.total.value)}
            dense
            onPress={draft.mode === 'new' ? () => setEditing('total') : undefined}
            status={check(draft.total.unsure || mismatch)}
            statusText={draft.total.unsure || mismatch ? t('scan.review.checkThis') : undefined}
          />
        )}
      </View>

      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('scan.review.items')}
      </Text>

      {draft.items.length === 0 ? (
        <View style={styles.empty} testID="scan-empty">
          {firstImage ? <Image source={{ uri: firstImage.uri }} style={[styles.photo, { backgroundColor: colors.fill1 }]} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('scan.review.empty.label')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('scan.review.empty.body')}</Text>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onTryAnother} style={styles.link} testID="scan-try-another">
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.fail.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="scan-items">
          {draft.items.some((i) => i.likely) ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, paddingTop: step.row }}>{t('scan.item.likelyCategory')}</Text>
          ) : null}
          {draft.items.map((item, i) => {
            const row = item.categoryId ? lookup.byId.get(item.categoryId) : undefined;
            return (
              <View key={item.key} style={i === 0 ? null : [styles.rule, { borderTopColor: colors.line1 }]}>
                <ItemRow
                  item={item}
                  currency={currency}
                  priceText={item.price === null ? notRead : money(item.price - item.discount)}
                  spokenPrice={item.price === null ? notRead : spoken(item.price - item.discount)}
                  categoryName={nameOf(item.categoryId)}
                  categoryIcon={row ? iconForCategory(row) : null}
                  crop={cropFor(item.page)}
                  startEditing={fresh === item.key}
                  onName={(name) => onChange(setItemName(draft, item.key, name))}
                  onPrice={(minor) => onChange(setItemPrice(draft, item.key, minor))}
                  onPickCategory={() => setPicker(item.key)}
                  onRemove={() => onChange(removeItem(draft, item.key))}
                />
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('scan.review.addItem')}
        hitSlop={LINK_HIT_SLOP}
        onPress={addItemNow}
        style={({ pressed }) => [styles.addPill, { borderColor: pressed ? colors.accent : colors.line2 }]}
        testID="scan-add-item"
      >
        <Glyph name="add" size={16} color={colors.ink} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('scan.review.addItem')}</Text>
      </Pressable>

      {draft.extras.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t('scan.review.extras')}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]} testID="scan-extras">
            {draft.extras.map(extraRow)}
          </View>
        </>
      ) : null}

      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }} testID="scan-footer">
        {t('scan.review.footer')}
      </Text>

      {mismatchCard('bottom')}

      {conflict ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }} testID="scan-conflict">
          {conflict}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: blocked, busy: pending }}
        onPress={() => {
          if (blocked) {
            if (!pending) hapticWarn();
            return;
          }
          onConfirm();
        }}
        style={[styles.primary, { backgroundColor: blocked ? colors.fill2 : colors.accent }]}
        testID="scan-confirm"
      >
        <Text style={{ ...textRole(pairing, 'label'), color: blocked ? colors.inkDim : colors.surface }}>{primaryLabel}</Text>
      </Pressable>

      <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onDiscard} style={styles.discard} testID="scan-discard">
        <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('scan.review.discard')}</Text>
      </Pressable>

      <CategoryPicker
        visible={picker !== null}
        categories={choices}
        selectedId={pickFor?.categoryId ?? null}
        hideUncategorised={false}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (picker !== null) onChange(setItemCategory(draft, picker, id));
          setPicker(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
  card: { borderRadius: radii.card, paddingHorizontal: step.card },
  rule: { borderTopWidth: 1 },
  input: { borderRadius: radii.card, paddingHorizontal: step.row, paddingVertical: step.tight, minHeight: 52, marginVertical: step.hair },
  badge: { flexDirection: 'row', alignItems: 'center', gap: step.hair, paddingHorizontal: step.tight, paddingVertical: step.hair, borderRadius: radii.pill },
  mismatch: { gap: step.hair },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: step.card },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  extra: { flexDirection: 'row', alignItems: 'center', gap: step.tight },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: step.tight, alignItems: 'flex-start' },
  photo: { width: CROP_SIZE, height: CROP_SIZE, borderRadius: radii.card },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: step.hair,
    minHeight: space.touchMin,
    paddingHorizontal: step.card,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  primary: { minHeight: 52, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: step.card, marginTop: step.tight },
  discard: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
