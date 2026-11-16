// Notices (HH-03, UI-SPEC "Notices"): every household event the caller may see, newest first, each as one sentence with the
// time under it. Opening the screen marks them read, which clears the count on the Household home and the You row. Names go
// through the member resolver (D-32). Copy never says "should" or "advise".
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useHouseholdEvents } from '@/data/queries/household';
import { markHouseholdEventsRead } from '@/db/householdEvents';
import { supabase } from '@/services/supabase';
import { ChangeLine } from './components/ChangeLine';
import { useNoticeFormat } from './noticeText';
import { useHouseholdScope } from './useHouseholdScope';

export function NoticesScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const scope = useHouseholdScope();
  const { events } = useHouseholdEvents(scope.householdId, scope.userId ?? undefined);
  const { text, when } = useNoticeFormat(scope.householdId, scope.name);
  const { userId, online } = scope;

  // Opening the list is what marks it read (needs a connection; offline it is marked on the next opening).
  useFocusEffect(
    useCallback(() => {
      if (!userId || !online) return;
      void markHouseholdEventsRead(supabase)
        .then(() => qc.invalidateQueries({ queryKey: queryKeys.householdEventReads(userId) }))
        .catch(() => undefined);
    }, [userId, online, qc]),
  );

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.notices.title')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {events.length === 0 ? (
          <Text testID="notices-empty" style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
            {t('household.notices.empty')}
          </Text>
        ) : (
          events.map((e) => <ChangeLine key={e.id} householdId={scope.householdId} actorId={e.actor_id} text={text(e)} at={when(e.created_at)} />)
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  card: { marginTop: step.section, padding: step.card, borderRadius: radii.card, gap: step.tight },
});
