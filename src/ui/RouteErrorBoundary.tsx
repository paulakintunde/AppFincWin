// Expo Router ErrorBoundary for the signed-in group: a render error on any screen shows this
// declarative fallback with Retry, instead of unmounting the whole app to a white screen.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { captureError } from '@/services/errors';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { EmptyState } from './EmptyState';
import { Pill } from './Pill';
import { Screen } from './Screen';

export interface RouteErrorBoundaryProps {
  error: Error;
  retry: () => Promise<void> | void;
}

export function RouteErrorBoundary({ error, retry }: RouteErrorBoundaryProps) {
  const t = useT();
  useEffect(() => {
    captureError(error, { area: 'ui' });
  }, [error]);

  return (
    <Screen>
      <View style={styles.body}>
        <EmptyState heading={t('errorBoundary.heading')} body={t('errorBoundary.body')} />
        <Pill label={t('errorBoundary.retry')} variant="primary" onPress={() => void retry()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.gapSm },
});
