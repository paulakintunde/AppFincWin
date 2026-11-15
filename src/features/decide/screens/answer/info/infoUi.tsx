// 06.1-35: the small pieces the four information sheets share: a section title, a body line and the sheet shell.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.close')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>{children}</SheetScroll>
    </Sheet>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
      {children}
    </Text>
  );
}

export function Body({ children, testID, muted = false }: { children: string; testID?: string; muted?: boolean }) {
  const { colors, pairing } = useTheme();
  return (
    <Text testID={testID} style={{ ...textRole(pairing, 'body'), color: muted ? colors.inkMuted : colors.ink }}>
      {children}
    </Text>
  );
}

export function Block({ children }: { children: React.ReactNode }) {
  return <View style={styles.block}>{children}</View>;
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.gapMd },
  block: { gap: space.gapSm },
});
