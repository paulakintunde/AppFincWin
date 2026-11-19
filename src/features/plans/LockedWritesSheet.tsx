/**
 * 09-18 (UI-SPEC 9d, D-40): the writes kept on this phone because the plan does not cover the household. One row per kept
 * item: what it was and when. There is deliberately no delete or dismiss action: kept items are never dropped silently.
 * They sync when the plan is active again and are included in the export.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { clockText } from '@/ui/clockText';
import { failedEntityKey } from '@/ui/failedWriteLabels';
import { useT } from '@/i18n';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useLockedWrites, type LockedWrite } from '@/data/sync/lockedWrites';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

function whenText(at: string, locale: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
  return `${date}, ${clockText({ hours: d.getHours(), minutes: d.getMinutes() }, locale)}`;
}

/** The mutation key's first part names the record kind ("custom-currencies" -> custom_currencies). */
function entityOf(entry: LockedWrite): string {
  const head = entry.mutationKey[0];
  return typeof head === 'string' ? head.replace(/-/g, '_') : 'unknown';
}

export function LockedWritesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { locale } = useDeviceLocale();
  const { colors, pairing } = useTheme();
  const entries = useLockedWrites();
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('lock.savedOffline.title')}>
      <SheetHeader title={t('lock.savedOffline.title')} cancelLabel={t('sync.failedSheet.close')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.list}>
          {entries.map((entry) => (
            <View key={entry.id} testID={`locked-write-${entry.id}`} style={[styles.row, { backgroundColor: colors.fill1 }]}>
              <Text style={{ ...body, fontWeight: '600' }}>{t(failedEntityKey(entityOf(entry)))}</Text>
              <Text style={meta}>{whenText(entry.at, locale)}</Text>
            </View>
          ))}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  row: { padding: space.cardPad, borderRadius: radii.card, gap: 2 },
});
