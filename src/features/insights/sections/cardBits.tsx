// 07-10: small pieces the net-worth and score cards share: the surface card, a 44 px text button, the placeholder block, the error card and the offline card.
import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useT } from '@/i18n';
import { radii, space, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';

export function Card({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }, style]}>
      {children}
    </View>
  );
}

export function TextButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.textButton}>
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.accent }}>{label}</Text>
    </Pressable>
  );
}

export function LoadingBlock({ testID, height }: { testID: string; height: number }) {
  const { colors } = useTheme();
  return <View testID={testID} accessible={false} style={{ height, borderRadius: radii.card, backgroundColor: colors.fill1 }} />;
}

export function ErrorCard({ onRetry, testID = 'insights-error' }: { onRetry: () => void; testID?: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID={testID}>
      <View style={styles.errorHead}>
        <Glyph name="info" size={20} color={colors.inkMuted} />
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1 }}>
          {t('insights.states.errorTitle')}
        </Text>
      </View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('insights.states.errorBody')}</Text>
      <TextButton label={t('insights.states.retry')} onPress={onRetry} testID={`${testID}-retry`} />
    </Card>
  );
}

/** NR-01: offline with nothing cached; the read resumes on its own when the device is back online, so there is no button. */
export function OfflineCard({ testID = 'insights-offline' }: { testID?: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID={testID}>
      <View style={styles.errorHead}>
        <Glyph name="info" size={20} color={colors.inkMuted} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>{t('insights.states.offlineNoCache')}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: step.row },
  textButton: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: step.row },
});
