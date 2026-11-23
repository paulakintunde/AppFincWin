// 10-24 (UI-SPEC 4b, DAT-01, D-13): the Archive list. Archived months newest first, 'Restore all' behind a ConfirmSheet, and
// 'Export the archive', which opens Export filtered to the archived months (10-17 `months` param). Archive is the person's own
// view setting: nothing here changes a balance, goal or Decide answer, and there is no haptic.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useRestoreAllMonths } from '@/data/mutations/archivedMonths';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ArchiveMonthRow } from './ArchiveMonthRow';
import { useArchiveState } from './useArchiveState';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function ArchiveScreen(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const { user } = useAuth();
  const archive = useArchiveState();
  const { restoreAllMonths } = useRestoreAllMonths();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Newest first (YYYY-MM sorts as text).
  const months = [...archive.archived].sort().reverse();
  const link = { ...textRole(pairing, 'label'), color: colors.accent };

  const openMonth = (month: string): void => {
    router.push(`/archive/${month}` as Href);
  };
  const exportArchive = (): void => {
    router.push(`/export?months=${[...archive.archived].sort().join(',')}` as Href);
  };

  // Below level 4 (or switched off) there is no archive to show.
  if (!archive.enabled) return <Redirect href={'/activity' as Href} />;

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="archive-screen">
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
            {t('system.archive.title')}
          </Text>
          {months.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setConfirmOpen(true)} style={styles.link} testID="archive-restore-all">
              <Text style={link}>{t('system.archive.restoreAll')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('system.archive.intro')}</Text>
        {months.length === 0 ? (
          <EmptyState heading={t('system.archive.emptyTitle')} body={t('system.archive.emptyBody')} testID="archive-empty" />
        ) : (
          <>
            <View style={styles.list}>
              {months.map((m) => (
                <ArchiveMonthRow key={m} month={m} onPress={openMonth} />
              ))}
            </View>
            <Pressable accessibilityRole="link" onPress={exportArchive} style={styles.link} testID="archive-export">
              <Text style={link}>{t('system.archive.exportLink')}</Text>
            </Pressable>
          </>
        )}
      </View>
      <ConfirmSheet
        visible={confirmOpen}
        title={t('system.archive.restoreAllTitle')}
        body={t('system.archive.restoreAllBody', { count: months.length })}
        cancelLabel={t('system.archive.cancel')}
        confirmLabel={t('system.archive.restoreAll')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          if (user?.id) restoreAllMonths({ userId: user.id });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  list: { gap: space.gapSm },
});
