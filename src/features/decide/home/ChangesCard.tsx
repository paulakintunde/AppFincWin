/**
 * 05-48 (D-27, DCU-03, DCU-15): "Changes coming up". The user's dated income and spending changes, each a DeletableRow
 * (tap edits; swipe or the ⋯ menu deletes behind a confirm and an Undo toast; 05-72). Every open check recomputes from the changes
 * cache in the same render (D-15), so nothing is recomputed here. The tag is words (Income / Spending); colour backs it.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRemoveChange } from '@/data/mutations/decideChanges';
import type { DecideChangeRow } from '@/db/decideChanges';
import { currencyCode } from '@/engine/money';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY, shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { joinSentences } from '../check/joinSentences';
import { refText, type Translate } from '../check/refText';
import { moneyFn, type Money } from '../check/steps/stepUi';
import { changeRowCopy } from '../copy/depthInputsCopy';
import { DeletableRow } from '../ui/DeletableRow';
import { ChangeSheet, monthLabel } from './ChangeSheet';

const CURRENCY_RE = /^[A-Z]{3}$/;

export interface ChangesCardProps {
  changes: readonly DecideChangeRow[];
  currency: string;
  whole: Money;
  /** 05-113 (D-99): the pushed screen keeps "+ Add a change" with no rows; the home shows its own add row. */
  showWhenEmpty?: boolean;
}

export function ChangesCard({ changes, currency, whole, showWhenEmpty = false }: ChangesCardProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const { remove } = useRemoveChange();
  // undefined: closed; null: add mode; a row: edit mode.
  const [editing, setEditing] = useState<DecideChangeRow | null | undefined>(undefined);

  const rows = changes.filter((c) => c.deleted_at === null);

  const onDelete = (row: DecideChangeRow) => {
    const stepId = remove(row);
    showToast({ kind: 'destructive', text: { key: 'decide.delete.toastChange' }, stepId });
  };

  // D-72: with no change the card is gone (the add row on home replaces the empty state). The sheet stays mounted
  // so deleting the last row never unmounts an open edit.
  if (rows.length === 0 && editing === undefined && !showWhenEmpty) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, flex: 1 }}>
          {t('decide.depth.changes.heading')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.link}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.depth.changes.add')}</Text>
        </Pressable>
      </View>
      {rows.length === 0 ? null : (
      <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
        {rows.map((row, i) => {
          // IN-B04: a change is shown in the currency it was typed in (ChangeSheet edits it there; the builder converts it).
          const rowMoney = row.currency === currency || !CURRENCY_RE.test(row.currency) ? whole : moneyFn(fmt, currencyCode(row.currency));
          const copy = changeRowCopy(row, rowMoney, (m) => monthLabel(fmt.locale, m));
          const name = typeof copy.name === 'string' ? copy.name : refText(t, copy.name);
          const sub = refText(t, copy.from) + (copy.until !== null ? refText(t, copy.until) : '');
          const tag = t(row.kind === 'income' ? 'decide.depth.changes.income' : 'decide.depth.changes.spending');
          const income = row.kind === 'income';
          const a11y = joinSentences([name, tag, sub]);
          const edit = () => setEditing(row);
          return (
            <View key={row.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null}>
              <DeletableRow
                name={name}
                accessibilityLabel={a11y}
                onOpen={edit}
                menu={[{ key: 'edit', label: t('decide.delete.menuEdit'), onSelect: edit }]}
                confirm={{ title: t('decide.delete.changeTitle'), body: t('decide.delete.changeBody') }}
                onDelete={() => onDelete(row)}
              >
                <View style={styles.text}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                    {name}
                  </Text>
                  <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
                    {income ? (
                      <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
                      />
                    ) : null}
                    <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: income ? colors.accent : colors.inkDim }}>
                      {tag}
                    </Text>
                  </View>
                  <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
                </View>
              </DeletableRow>
            </View>
          );
        })}
      </View>
      )}
      <ChangeSheet visible={editing !== undefined} row={editing ?? null} onClose={() => setEditing(undefined)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  text: { gap: 4, paddingVertical: space.rowPad, paddingLeft: 18, minHeight: space.touchMin, justifyContent: 'center' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.gapMd, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' },
});
