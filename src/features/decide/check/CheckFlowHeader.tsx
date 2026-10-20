/**
 * 05-30 (DCU-02, D-08, D-24): the check flow's sticky header. Back circle, 'Step n of 5', the step title, the five-segment
 * step bar, and (only on an open check with other open checks) the 'With other checks' pill in the right slot, which adds
 * no height. Presentational: the screen owns the step and every rule about which steps can be entered.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { BackButton } from '@/shell/header/BackButton';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { CombineToggle } from '../ui/CombineToggle';
import { StepBar } from '../ui/StepBar';
import type { StepNumber } from './stepTypes';
import { Eyebrow } from './steps/stepUi';

type TextRef = React.ComponentRef<typeof Text>;

export interface CheckFlowHeaderProps {
  step: StepNumber;
  furthest: StepNumber;
  title: string;
  titles: readonly [string, string, string, string, string];
  canEnter: (step: StepNumber) => boolean;
  onJump: (step: StepNumber) => void;
  onBlocked: (step: StepNumber) => void;
  onBack: () => void;
  titleRef: React.Ref<TextRef>;
  /** Null hides the pill (a decided check, or fewer than two open checks). */
  combine: { value: boolean; onChange: (next: boolean) => void } | null;
}

export function CheckFlowHeader({ step, furthest, title, titles, canEnter, onJump, onBlocked, onBack, titleRef, combine }: CheckFlowHeaderProps) {
  const t = useT();
  const { colors, fonts } = useTheme();
  const insets = useScreenInsets();
  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + space.detailHeaderPadTop,
          paddingHorizontal: space.detailHeaderPadH,
          paddingBottom: space.detailHeaderPadBottom,
          borderBottomColor: colors.line1,
          backgroundColor: colors.canvas,
        },
      ]}
    >
      <View style={styles.row}>
        <BackButton variant="detail" onPress={onBack} />
        <View style={styles.titles}>
          <Eyebrow>{t('decide.flow.stepOf', { n: step })}</Eyebrow>
          <Text
            ref={titleRef}
            accessibilityRole="header"
            numberOfLines={1}
            style={{ fontFamily: fonts.body[600], fontSize: fontSize.sheetTitle, letterSpacing: fontSize.sheetTitle * -0.01, color: colors.ink }}
          >
            {title}
          </Text>
        </View>
        {combine ? <CombineToggle value={combine.value} onChange={combine.onChange} /> : null}
      </View>
      <StepBar current={step} furthest={furthest} titles={titles} canEnter={canEnter} onJump={onJump} onBlocked={onBlocked} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, gap: space.gapMd },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  titles: { flex: 1, gap: 2 },
});
