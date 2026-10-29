/**
 * Plan 05.2-25: "Reminders". Two switches that start Off. Turning one on asks for notification permission through the
 * 05-26 reminder module; a refusal puts the switch back Off and shows "Notifications are off ...". Stores remind_plan
 * and remind_unspent. Reminder text is fixed copy and never carries an amount.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { ToggleRow } from '@/ui/ToggleRow';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { requestReminderPermission } from '@/features/decide/notifications/waitReminder';
import { Meta, useCopy, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

type Key = 'remind_plan' | 'remind_unspent';

export const RemindersStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function RemindersStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const settings = useDecideSettings(userId).data;
  const saver = useSaveSetupStep(userId ?? '');
  const [draft, setDraft] = useState<Partial<Record<Key, boolean>>>({});
  const [refused, setRefused] = useState(false);

  const valueOf = (key: Key): boolean => draft[key] ?? settings?.[key] ?? false;
  const changed = (['remind_plan', 'remind_unspent'] as const).filter((k) => k in draft && draft[k] !== (settings?.[k] ?? false));

  useReportReady(onReadyChange, true, null, changed.length > 0);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined || changed.length === 0) return { stepId: null };
      const patch: Partial<Record<Key, boolean>> = {};
      for (const k of changed) patch[k] = draft[k] as boolean;
      const result = saver.save({ stepTitle: t('decide.setup.reminders.title'), patch });
      return { stepId: result?.stepId ?? null };
    },
  }));

  const change = async (key: Key, on: boolean) => {
    if (!on) {
      setRefused(false);
      setDraft((d) => ({ ...d, [key]: false }));
      return;
    }
    const granted = await requestReminderPermission();
    setRefused(!granted);
    setDraft((d) => ({ ...d, [key]: granted }));
  };

  return (
    <View style={{ gap: space.gapMd }}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
        <ToggleRow label={t('decide.setup.reminders.planCovered')} value={valueOf('remind_plan')} onChange={(on) => void change('remind_plan', on)} />
        <ToggleRow label={t('decide.setup.reminders.unspentCheck')} value={valueOf('remind_unspent')} onChange={(on) => void change('remind_unspent', on)} />
      </View>
      {refused ? <Meta text={t('decide.setup.reminders.refused')} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, paddingHorizontal: space.cardPad, minHeight: 64 },
});
