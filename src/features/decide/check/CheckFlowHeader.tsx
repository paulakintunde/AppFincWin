/**
 * 05-30 (DCU-02, D-08, D-24): the check flow's sticky header. Back circle, 'Step n of 5', the step title, the five-segment
 * step bar, and in the right slot the 'With other checks' pill (an open check with other open checks) then 'Clear'.
 * 05-75 (D-73, D-76, D-77): the save status sits beside the eyebrow as its own text, the title wraps, and under rule S the
 * right slot moves to its own row, right-aligned. Presentational: the screen owns the step and every rule about which
 * steps can be entered.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { BackButton } from '@/shell/header/BackButton';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space, useScreenInsets } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { CombineToggle } from '../ui/CombineToggle';
import { StepBar } from '../ui/StepBar';
import { useShouldStack } from '../ui/textFit';
import type { StepNumber } from './stepTypes';
import { Eyebrow } from './steps/stepUi';
import type { SaveStatus } from './useCheckSaveStatus';

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
  /** D-73: absent or null hides Clear (a new unedited check, a decided check). */
  onClear?: (() => void) | null;
  /** D-77: absent or null renders no status. */
  saveStatus?: SaveStatus;
}

export function CheckFlowHeader({
  step,
  furthest,
  title,
  titles,
  canEnter,
  onJump,
  onBlocked,
  onBack,
  titleRef,
  combine,
  onClear = null,
  saveStatus = null,
}: CheckFlowHeaderProps) {
  const t = useT();
  const { colors, pairing, fonts } = useTheme();
  const insets = useScreenInsets();
  const stacked = useShouldStack();
  const hasRight = combine !== null || onClear !== null;
  const right = hasRight ? (
    <View testID="check-header-right" style={[styles.right, stacked && styles.rightStacked]}>
      {combine ? <CombineToggle value={combine.value} onChange={combine.onChange} /> : null}
      {onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.clear.a11y')}
          accessibilityHint={t('decide.clear.hint')}
          onPress={onClear}
          style={({ pressed }) => [styles.clear, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.clear.button')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;
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
          <View style={styles.eyebrowRow}>
            <Eyebrow>{t('decide.flow.stepOf', { n: step })}</Eyebrow>
            {saveStatus ? (
              <Text
                style={{
                  fontFamily: fonts.body[600],
                  fontSize: fontSize.tabLabel,
                  color: saveStatus === 'failed' ? colors.warn1 : colors.inkMuted,
                }}
              >
                {t(`decide.save.${saveStatus}`)}
              </Text>
            ) : null}
          </View>
          <Text
            ref={titleRef}
            accessibilityRole="header"
            style={{ fontFamily: fonts.body[600], fontSize: fontSize.sheetTitle, letterSpacing: fontSize.sheetTitle * -0.01, color: colors.ink }}
          >
            {title}
          </Text>
        </View>
        {stacked ? null : right}
      </View>
      {stacked ? right : null}
      <StepBar current={step} furthest={furthest} titles={titles} canEnter={canEnter} onJump={onJump} onBlocked={onBlocked} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, gap: space.gapMd },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  titles: { flex: 1, gap: 2 },
  eyebrowRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapSm },
  right: { flexDirection: 'row', alignItems: 'center' },
  rightStacked: { alignSelf: 'flex-end' },
  clear: { minHeight: 44, minWidth: 44, paddingHorizontal: space.gapSm, alignItems: 'center', justifyContent: 'center' },
});
