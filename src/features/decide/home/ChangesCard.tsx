/**
 * 05-48 (D-27, DCU-03, DCU-15): "Changes coming up". The user's dated income and spending changes, each a tappable row
 * (edit) with a 44px 'x' (remove, with the "Change removed" Undo toast). Every open check recomputes from the changes
 * cache in the same render (D-15), so nothing is recomputed here. The tag is words (Income / Spending); colour backs it.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRemoveChange } from '@/data/mutations/decideChanges';
import type { DecideChangeRow } from '@/db/decideChanges';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY, shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { joinSentences } from '../check/joinSentences';
import { refText, type Translate } from '../check/refText';
import { Card, type Money } from '../check/steps/stepUi';
import { changeRowCopy } from '../copy/depthInputsCopy';
import { ChangeSheet, monthLabel } from './ChangeSheet';

export interface ChangesCardProps {
  changes: readonly DecideChangeRow[];
  currency: string;
  whole: Money;
}

export function ChangesCard({ changes, whole }: ChangesCardProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const { remove } = useRemoveChange();
  // undefined: closed; null: add mode; a row: edit mode.
  const [editing, setEditing] = useState<DecideChangeRow | null | undefined>(undefined);

  const rows = changes.filter((c) => c.deleted_at === null);

  const onRemove = (row: DecideChangeRow) => {
    const stepId = remove(row);
    showToast({ kind: 'destructive', text: { key: 'decide.depth.changes.removed' }, stepId });
  };

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
      {rows.length === 0 ? (
        <Card>
          <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{t('decide.depth.changes.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.depth.changes.emptyBody')}</Text>
        </Card>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
          {rows.map((row, i) => {
            const copy = changeRowCopy(row, whole, (m) => monthLabel(fmt.locale, m));
            const name = typeof copy.name === 'string' ? copy.name : refText(t, copy.name);
            const sub = refText(t, copy.from) + (copy.until !== null ? refText(t, copy.until) : '');
            const tag = t(row.kind === 'income' ? 'decide.depth.changes.income' : 'decide.depth.changes.spending');
            const income = row.kind === 'income';
            const a11y = joinSentences([name, tag, sub]);
            return (
              <View
                key={row.id}
                style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  onPress={() => setEditing(row)}
                  style={({ pressed }) => [styles.main, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <View style={styles.text}>
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
                    <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
                      {income ? (
                        <View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill },
                          ]}
                        />
                      ) : null}
                      <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: income ? colors.accent : colors.inkDim }}>
                        {tag}
                      </Text>
                    </View>
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('decide.depth.changes.removeA11y', { name: name || tag })}
                  onPress={() => onRemove(row)}
                  style={styles.remove}
                >
                  <CloseGlyph color={colors.inkDim} />
                </Pressable>
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
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minHeight: space.touchMin, paddingVertical: space.rowPad, paddingLeft: 18 },
  text: { gap: 4 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.gapMd, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
