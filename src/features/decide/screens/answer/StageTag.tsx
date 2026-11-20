// 08.1-20 (DCU-10): the stage word for the answer's top-bar sub-line ("First read · Just you"). Text only, no chip, never a state
// colour (stages are not verdicts). Nothing at the deeper stage: three or more months of records show no stage word (UI-SPEC owner
// answer 2). Exported for plan 08.1-10, which places it in the top bar; this plan does not mount it.
import React from 'react';
import { useT } from '@/i18n';
import type { DecideStage } from '@/engine/decide/v3';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export function StageTag({ stage }: { stage: DecideStage }): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (stage === 'deeper') return null;
  return (
    <Text testID="stage-tag" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
      {t(`decide.screens.stage.word.${stage}` as never)}
    </Text>
  );
}
