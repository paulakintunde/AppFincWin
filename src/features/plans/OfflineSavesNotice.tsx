/**
 * 09-18 (UI-SPEC 9d, D-40): "Saved on this phone. Choose a plan to sync". Shown when writes kept because of a lock wait on
 * the phone. 09-19 places the notice on Home in priority order; the count chip sits in the Activity header. Nothing is
 * dropped: "See them" lists the items and the export includes them. Hidden in the sample state, where saves made before the
 * trial starts are expected (owner P3).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/i18n';
import { useLockedWrites } from '@/data/sync/lockedWrites';
import { space } from '@/theme/layout';
import { NoticeCard, PlanLink } from './components/NoticeCard';
import { LockedWritesSheet } from './LockedWritesSheet';
import { EXPORT_HREF, plansHref } from './routes';
import { usePlanState } from './usePlanState';

export function useOfflineSavesCount(): number {
  return useLockedWrites().length;
}

export function OfflineSavesNotice() {
  const t = useT();
  const count = useOfflineSavesCount();
  const plan = usePlanState();
  const [open, setOpen] = useState(false);
  if (count === 0 || plan.status === 'sample') return null;
  return (
    <View testID="offline-saves-notice" style={styles.wrap}>
      <NoticeCard
        icon="savedOffline"
        title={t('lock.savedOffline.title')}
        body={t('lock.savedOffline.body', { count })}
        actions={[
          { kind: 'primary', label: t('lock.savedOffline.choose'), onPress: () => router.push(plansHref({ mode: 'locked', trigger: 'locked' })) },
          { kind: 'link', label: t('lock.savedOffline.export'), onPress: () => router.push(EXPORT_HREF) },
        ]}
      />
      <PlanLink label={t('lock.savedOffline.see')} onPress={() => setOpen(true)} testID="offline-saves-see" />
      <LockedWritesSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
});
