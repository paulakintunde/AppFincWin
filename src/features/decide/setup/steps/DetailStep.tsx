/** Plan 05.2-25: "How much detail do you like?". Stores detail 'short' | 'full'. Optional. */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { Meta, useCopy, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

type Detail = 'short' | 'full';
const OPTIONS: readonly { value: Detail; titleKey: string; descKey: string }[] = [
  { value: 'short', titleKey: 'decide.setup.detail.optionShort', descKey: 'decide.setup.detail.optionShortDesc' },
  { value: 'full', titleKey: 'decide.setup.detail.optionFull', descKey: 'decide.setup.detail.optionFullDesc' },
];

export const DetailStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function DetailStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const stored = useDecideSettings(userId).data?.detail ?? null;
  const saver = useSaveSetupStep(userId ?? '');
  const [draft, setDraft] = useState<Detail | null>(null);
  const chosen = draft ?? stored;
  const dirty = chosen !== null && chosen !== stored;

  useReportReady(onReadyChange, true, null, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined || !dirty) return { stepId: null };
      const result = saver.save({ stepTitle: t('decide.setup.detail.title'), patch: { detail: chosen } });
      return { stepId: result?.stepId ?? null };
    },
  }));

  return (
    <View style={{ gap: space.groupGap }}>
      <View style={{ gap: space.gapMd }}>
        {OPTIONS.map((o) => {
          const selected = chosen === o.value;
          return (
            <ChoiceCard key={o.value} selected={selected} onPress={() => setDraft(o.value)} title={t(o.titleKey)} accessibilityLabel={`${t(o.titleKey)}. ${t(o.descKey)}`}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: selected ? colors.inkSoft1 : colors.inkMuted }}>{t(o.descKey)}</Text>
            </ChoiceCard>
          );
        })}
      </View>
      <Meta text={t('decide.setup.detail.footer')} />
    </View>
  );
});
