// CONTEXT D-11: the once-only "Clear the sample figures?" prompt. Equal-weight neutral actions
// (no accent, no danger): clearing and keeping are both fine. Keep or dismiss saves the answer on
// the server so the prompt never returns on any device; the banner stays until cleared.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useSampleData } from '@/data/mutations/sampleData';
import { dismissSampleClearPrompt, useSampleClearPromptRequest } from '@/state/samplePrompt';
import { showToast } from '@/state/undoToast';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';

export function SampleClearPrompts() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const requested = useSampleClearPromptRequest();
  const { clear, declinePrompt, pending } = useSampleData({
    userId: ctx.userId ?? '',
    householdId: ctx.householdId ?? '',
    today: ctx.today,
  });

  const keep = (): void => {
    declinePrompt();
    dismissSampleClearPrompt();
  };
  const clearThem = (): void => {
    void clear().then((ok) => {
      dismissSampleClearPrompt();
      showToast({ kind: 'info', text: { key: ok ? 'samples.cleared' : 'samples.clearFailed' } });
    });
  };

  return (
    <Sheet visible={requested} onDismiss={keep}>
      <View style={styles.column}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('samples.promptTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('samples.promptBody')}</Text>
        <View style={styles.actions}>
          <Pill label={t('samples.promptClear')} variant="secondary" disabled={pending} onPress={clearThem} />
          <Pill label={t('samples.promptKeep')} variant="secondary" onPress={keep} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  actions: { flexDirection: 'row', gap: space.gapMd },
});
