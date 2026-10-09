// UI-SPEC 11 / REC-23: the persistent "These are sample figures" banner. It shows while sample
// rows exist and offers Start fresh, which confirms and then clears the unedited samples. Clearing
// is not undoable (D-09, D-10).
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useSampleData } from '@/data/mutations/sampleData';
import { showToast } from '@/state/undoToast';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';

export function SampleBanner() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const [confirming, setConfirming] = useState(false);
  const { clear, pending } = useSampleData({
    userId: ctx.userId ?? '',
    householdId: ctx.householdId ?? '',
    today: ctx.today,
  });

  if (!ctx.hasSamples) return null;

  const confirm = (): void => {
    setConfirming(false);
    void clear().then((ok) => {
      showToast({ kind: 'info', text: { key: ok ? 'samples.cleared' : 'samples.clearFailed' } });
    });
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.fill1, borderTopColor: colors.line2 }]}>
      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.ink }}>{t('samples.bannerTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.eyebrow, lineHeight: fontSize.eyebrow * 1.4, color: colors.inkMuted }}>{t('samples.bannerBody')}</Text>
      </View>
      <View style={styles.action}>
        <Pill label={t('samples.startFresh')} variant="primary" disabled={pending} onPress={() => setConfirming(true)} />
      </View>
      <ConfirmSheet
        visible={confirming}
        title={t('samples.confirmTitle')}
        body={t('samples.confirmBody')}
        cancelLabel={t('samples.cancel')}
        confirmLabel={t('samples.confirmClear')}
        destructive
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    paddingHorizontal: space.screenH,
    paddingVertical: space.gapMd,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, gap: 2 },
  action: { minHeight: space.touchMin, justifyContent: 'center' },
});
