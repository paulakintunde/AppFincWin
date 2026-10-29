/**
 * Plan 05.2-25: "Do you share costs with anyone?". Just me stores share_pct 100; sharing stores the chosen 1 to 99 %.
 * Optional: nothing chosen writes nothing.
 */
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
import { CustomValueChips } from '@/features/decide/ui/CustomValueChips';
import { Caption, Why, useCopy, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

const PRESETS = [30, 50, 60, 70] as const;
const JUST_ME = 100;
type Mode = 'me' | 'share';

export const ShareStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function ShareStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const stored = useDecideSettings(userId).data?.share_pct ?? null;
  const saver = useSaveSetupStep(userId ?? '');
  const [mode, setMode] = useState<Mode | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  const storedMode: Mode | null = stored === null ? null : stored === JUST_ME ? 'me' : 'share';
  const activeMode = mode ?? storedMode;
  const activePct = pct ?? (stored !== null && stored !== JUST_ME ? stored : null);
  const next: number | null = activeMode === 'me' ? JUST_ME : activeMode === 'share' ? activePct : null;
  const dirty = next !== null && next !== stored;

  useReportReady(onReadyChange, true, null, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined || !dirty || next === null) return { stepId: null };
      const result = saver.save({ stepTitle: t('decide.setup.share.title'), patch: { share_pct: next } });
      return { stepId: result?.stepId ?? null };
    },
  }));

  const desc = (selected: boolean, key: string) => (
    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: selected ? colors.inkSoft1 : colors.inkMuted }}>{t(key)}</Text>
  );

  return (
    <View style={{ gap: space.groupGap }}>
      <View style={{ gap: space.gapMd }}>
        <ChoiceCard
          selected={activeMode === 'me'}
          onPress={() => setMode('me')}
          title={t('decide.setup.share.optionJustMe')}
          accessibilityLabel={`${t('decide.setup.share.optionJustMe')}. ${t('decide.setup.share.optionJustMeDesc')}`}
        >
          {desc(activeMode === 'me', 'decide.setup.share.optionJustMeDesc')}
        </ChoiceCard>
        <ChoiceCard
          selected={activeMode === 'share'}
          onPress={() => setMode('share')}
          title={t('decide.setup.share.optionShare')}
          accessibilityLabel={`${t('decide.setup.share.optionShare')}. ${t('decide.setup.share.optionShareDesc')}`}
        >
          {desc(activeMode === 'share', 'decide.setup.share.optionShareDesc')}
        </ChoiceCard>
      </View>
      {activeMode === 'share' ? (
        <View style={{ gap: space.gapSm }}>
          <Caption text={t('decide.setup.share.shareCaption')} />
          <CustomValueChips
            presets={PRESETS}
            value={activePct}
            onChange={setPct}
            groupLabel={t('decide.setup.share.pctA11y')}
            min={1}
            max={99}
            rangeText={t('decide.setup.share.pctRange')}
            unitWord={t('decide.setup.share.pctUnit')}
            formatPreset={(n) => t('decide.setup.share.pctChip', { pct: n })}
          />
        </View>
      ) : null}
      <Why textKey="decide.setup.share.why" />
    </View>
  );
});
