// 10.1-18 (SPL-01, SPL-02, SPL-04, SPL-05; UI-SPEC section 1): "Split across categories". Two parts to start (the line's category
// holding the whole total, and an empty second part); the first part follows "the rest" until it is edited by hand. Every maths
// rule lives in the engine (splitDraft calls partsBalance); the server re-checks everything on save (parts_invalid_reason).
import React, { useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { hapticTap, hapticWarn } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { money as toMoney } from '@/engine/money';
import { PARTS_MAX, primaryCategory } from '@/engine/parts';
import { toParts } from '@/db/categoryParts';
import type { CategoryRow, TransactionRow } from '@/db/rows';
import { useCategoryLookup } from '@/data/queries/categories';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRecordContext } from '../useRecordContext';
import { categoryName } from '../categoryName';
import { CategoryPicker } from '../entry/pickers/CategoryPicker';
import { BalanceLine } from './BalanceLine';
import { SplitPartRow } from './SplitPartRow';
import { addPart, canSave, draftBalance, initDraft, removePart, setAmount, setCategory, toSaveParts, type SplitDraft } from './splitDraft';
import { useSaveSplit } from './useSaveSplit';

export interface CategorySplitSheetProps {
  visible: boolean;
  line: TransactionRow;
  householdId: string;
  /** The line's month ('YYYY-MM'), so its cache entry can be patched. */
  month: string;
  currency: string;
  onClose: () => void;
  /** D-03: opened from "Place it", so the balance line is outlined. */
  highlightGap?: boolean;
}

export function CategorySplitSheet(props: CategorySplitSheetProps) {
  if (!props.visible) return null;
  return <SplitBody {...props} />;
}

function signature(d: SplitDraft): string {
  return JSON.stringify(d.parts.map((p) => [p.categoryId, p.amount]));
}

function SplitBody({ line, householdId, month, currency, onClose, highlightGap = false }: CategorySplitSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const lookup = useCategoryLookup(user?.id);
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const money = (minor: number) => formatter.formatMoney(toMoney(minor, currency));

  const existing = useMemo(() => toParts(line.category_parts ?? null), [line.category_parts]);
  const editing = existing !== null;
  const [initial] = useState(() => initDraft({ amount: line.original_amount, categoryId: line.category_id, parts: existing }));
  const [draft, setDraft] = useState<SplitDraft>(initial);
  const [known] = useState(() => new Set(initial.parts.map((p) => p.key)));
  const [picker, setPicker] = useState<string | 'keepAs' | null>(null);
  const [keepAs, setKeepAs] = useState<string | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [tried, setTried] = useState(false);

  const saver = useSaveSplit({ householdId, month, id: line.id, version: line.version });

  // D-04: every category is offered, the system Transfer one included (the lookup keeps system rows out of `active`).
  const choices = useMemo<CategoryRow[]>(() => {
    const transfer = lookup.transferCategoryId ? lookup.byId.get(lookup.transferCategoryId) : undefined;
    return transfer && transfer.archived_at === null ? [...lookup.active, transfer] : lookup.active;
  }, [lookup.active, lookup.byId, lookup.transferCategoryId]);

  const largest = primaryCategory(existing ?? []);
  const keepCategory = keepAs === undefined ? largest : keepAs;

  const nameOf = (id: string | null): string => {
    if (id === null) return t('split.uncategorised');
    const row = lookup.byId.get(id);
    return row ? categoryName(row, t) : t('split.uncategorised');
  };

  const balance = draftBalance(draft);
  const verdict = canSave(draft);
  const dirty = signature(draft) !== signature(initial);
  const title = t('split.title', { name: line.name ?? money(draft.total) });

  const submit = () => {
    if (!verdict.ok) {
      setTried(true);
      hapticWarn();
      AccessibilityInfo.announceForAccessibility(
        balance.state === 'addsUp'
          ? t('split.balance.addsUp')
          : t(balance.state === 'left' ? 'split.balance.left' : 'split.balance.over', { amount: money(balance.amount) }),
      );
      return;
    }
    hapticTap();
    saver.save(toSaveParts(draft), { onDone: onClose });
  };

  const confirmRemove = () => {
    setConfirming(false);
    hapticTap();
    saver.remove(keepCategory, { onDone: onClose });
  };

  const pickFor = picker !== null && picker !== 'keepAs' ? draft.parts.findIndex((p) => p.key === picker) : -1;

  const noteFor = (id: string | null): string | null => {
    const row = id === null ? undefined : lookup.byId.get(id);
    if (row?.builtin_key === 'Savings') return t('split.part.countsAsSaving');
    if (row?.builtin_key === 'Transfer') return t('split.part.countsAsTransfer');
    return null;
  };

  const glyphFor = (id: string | null) => {
    const row = id === null ? undefined : lookup.byId.get(id);
    const name = nameOf(id);
    return (
      <CategoryGlyph
        colorKey={row?.color_key ?? 'slate'}
        icon={iconForCategory(row)}
        letter={name.charAt(0).toUpperCase()}
      />
    );
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty} onDiscard={onClose}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('split.note', { total: money(draft.total) })}</Text>

        <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="split-parts">
          {draft.parts.map((part, i) => (
            <View key={part.key} style={i === 0 ? null : [styles.rule, { borderTopColor: colors.line1 }]}>
              <SplitPartRow
                n={i + 1}
                categoryName={nameOf(part.categoryId)}
                glyph={glyphFor(part.categoryId)}
                note={noteFor(part.categoryId)}
                amount={part.amount}
                currency={currency}
                spokenAmount={money(part.amount ?? 0)}
                canRemove={draft.parts.length > 2}
                needsAmount={tried && (part.amount === null || part.amount <= 0)}
                fresh={!known.has(part.key)}
                onPickCategory={() => setPicker(part.key)}
                onAmount={(minor) => setDraft((d) => setAmount(d, part.key, minor))}
                onRemove={() => setDraft((d) => removePart(d, part.key))}
              />
            </View>
          ))}
        </View>

        <View style={styles.addRow}>
          {draft.parts.length < PARTS_MAX ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('split.add')}
              hitSlop={LINK_HIT_SLOP}
              onPress={() => setDraft((d) => addPart(d))}
              style={({ pressed }) => [styles.addPill, { borderColor: pressed ? colors.accent : colors.line2 }]}
              testID="split-add"
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('split.add')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.balance}>
            <BalanceLine balance={balance} money={money} highlight={highlightGap} />
          </View>
        </View>

        {saver.conflict ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }} testID="split-conflict">
            {saver.conflict}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={verdict.ok ? t('split.save') : t('split.saveBlocked')}
          accessibilityState={{ disabled: !verdict.ok || saver.pending, busy: saver.pending }}
          onPress={saver.pending ? undefined : submit}
          style={[styles.save, { backgroundColor: verdict.ok ? colors.accent : colors.fill2 }]}
          testID="split-save"
        >
          <Text style={{ ...textRole(pairing, 'label'), color: verdict.ok ? colors.surface : colors.inkDim }}>
            {verdict.ok ? t('split.save') : t('split.saveBlocked')}
          </Text>
        </Pressable>

        {editing ? (
          <View style={styles.removeBlock}>
            <Row
              label={t('split.remove.keepAs')}
              value={nameOf(keepCategory)}
              chevron
              dense
              onPress={() => setPicker('keepAs')}
              accessibilityLabel={`${t('split.remove.keepAs')}, ${nameOf(keepCategory)}`}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('split.remove.label')}
              hitSlop={LINK_HIT_SLOP}
              onPress={() => setConfirming(true)}
              style={styles.removeLink}
              testID="split-remove"
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('split.remove.label')}</Text>
            </Pressable>
          </View>
        ) : null}
      </SheetScroll>

      <CategoryPicker
        visible={picker !== null}
        categories={choices}
        selectedId={picker === 'keepAs' ? keepCategory : pickFor >= 0 ? draft.parts[pickFor]!.categoryId : null}
        title={pickFor >= 0 ? t('split.part.categoryTitle', { n: pickFor + 1 }) : undefined}
        hideUncategorised={false}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (picker === 'keepAs') setKeepAs(id);
          else if (picker !== null) setDraft((d) => setCategory(d, picker, id));
          setPicker(null);
        }}
      />

      <ConfirmSheet
        visible={confirming}
        title={t('split.remove.confirm.title')}
        body={t('split.remove.confirm.body', { category: nameOf(keepCategory) })}
        cancelLabel={t('split.remove.confirm.keep')}
        confirmLabel={t('split.remove.label')}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
  card: { borderRadius: radii.card, paddingHorizontal: step.card },
  rule: { borderTopWidth: 1 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: step.tight },
  addPill: {
    minHeight: space.touchMin,
    paddingHorizontal: step.card,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balance: { flexGrow: 1, alignItems: 'flex-end' },
  save: {
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: step.card,
  },
  removeBlock: { gap: step.tight },
  removeLink: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
