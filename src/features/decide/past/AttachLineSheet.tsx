// 05-22 (D-12, D-36, A17): the row picker for attaching a household line to a decision. Lists only this household's
// lines from the last 90 days (T-05-22-01); there is no role picker, the date sets it (attachRoleFor in 05-19).
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAttachCandidates } from '@/data/queries/decide';
import { useAttachLine } from '@/data/mutations/decideLinks';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { homeAmountFor } from '@/data/queries/homeAmount';
import { usePastContext } from './usePastDecisions';

export const ATTACH_WINDOW_DAYS = 90;

export interface AttachLineSheetProps {
  visible: boolean;
  householdId: string;
  checkId: string;
  userId: string;
  decidedAt: string;
  /** Link targets already attached (transaction ids and series ids); their lines are left out. */
  excludeIds: readonly string[];
  onClose: () => void;
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function AttachLineSheet({ visible, householdId, checkId, userId, decidedAt, excludeIds, onClose }: AttachLineSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { ctx, whole, formatDate } = usePastContext();
  const { attach } = useAttachLine();
  const from = shiftDays(ctx.today, -ATTACH_WINDOW_DAYS);
  const lines = useAttachCandidates(householdId, from, ctx.today, visible).data;

  const rows = useMemo(() => {
    const skip = new Set(excludeIds);
    return (lines ?? [])
      .filter((l) => l.deleted_at === null && l.household_id === householdId)
      .filter((l) => !skip.has(l.id) && !(l.recurring_series_id !== null && skip.has(l.recurring_series_id)))
      .sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : 0));
  }, [lines, excludeIds, householdId]);

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('decide.past.pickTitle')}>
      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, paddingBottom: space.gapMd }}>
        {t('decide.past.pickTitle')}
      </Text>
      <SheetScroll>
        {rows.length === 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.past.pickEmpty')}</Text>
        ) : (
          rows.map((line) => {
            const amount = homeAmountFor(line, ctx.home, ctx.rates);
            const name = line.name ?? line.note ?? '';
            return (
              <Pressable
                key={line.id}
                accessibilityRole="button"
                accessibilityLabel={[name, formatDate(line.local_date), amount !== null ? whole(Math.abs(amount)) : null]
                  .filter((p): p is string => p !== null && p !== '')
                  .join(', ')}
                onPress={() => {
                  attach({
                    userId,
                    checkId,
                    householdId,
                    entity: 'transactions',
                    targetId: line.id,
                    decidedAt,
                    lineDate: line.local_date,
                  });
                  showToast({ kind: 'ordinary', text: { key: 'decide.toast.attached' } });
                  onClose();
                }}
                style={styles.row}
              >
                <View style={styles.text}>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
                  <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>
                    {formatDate(line.local_date)}
                  </Text>
                </View>
                {amount !== null ? (
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{whole(Math.abs(amount))}</Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPadDense },
  text: { flex: 1, gap: 2 },
});
