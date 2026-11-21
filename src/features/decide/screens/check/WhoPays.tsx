// 08.1-10 (D-01, D-02, UI-SPEC section 2): "Who pays" on the price step. Just me | Household, shown only when the viewer's household has
// 2 or more people. Every new check starts on Just me; Household is used only when picked, and the choice lives in the check
// (CheckV2.share), so Back from the answer keeps it. The helper under it reads once on change (polite live region).
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ShareScope } from '@/engine/decide/v3';
import { useHouseholdShare } from '@/features/household/decide/useHouseholdScopeSource';
import { whoPaysLineOf } from '@/features/household/decide/spendNote';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';

/** Narrow and large text: two stacked full-width choices replace the segmented row. */
const NARROW_DP = 320;
const LARGE_TEXT = 1.3;

export interface WhoPaysProps {
  share: ShareScope;
  /** The scope the check is saved with: personal, or the household's default split rule. */
  onChange: (next: ShareScope) => void;
}

export function WhoPays({ share, onChange }: WhoPaysProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { shareScope, spend } = useHouseholdShare();
  if (shareScope === null) return null;
  const value = share.kind === 'household' ? 'household' : 'me';
  const pick = (key: string): void => onChange(key === 'household' ? shareScope : { kind: 'personal' });
  const label = t('decide.screens.stepper.whoPays.label');
  const options = [
    { key: 'me', label: t('decide.screens.stepper.whoPays.justMe') },
    { key: 'household', label: t('decide.screens.stepper.whoPays.household') },
  ];
  const stacked = fontScale > LARGE_TEXT && width <= NARROW_DP;
  // 08.1-23 (Q12): the helper names the spending rule the check counts; Just me with a joint account says only my part counts.
  const line = whoPaysLineOf(spend, value);
  const say = t as unknown as (key: string, values?: Readonly<Record<string, string | number>>) => string;
  const helper = line !== null ? say(line.key, line.values) : value === 'household' ? t('decide.screens.stepper.whoPays.helper') : null;
  return (
    <View testID="who-pays" style={styles.wrap}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{label}</Text>
      {stacked ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.stack}>
          {options.map((o) => (
            <Pill
              key={o.key}
              variant="secondary"
              tall
              accessibilityRole="radio"
              selected={o.key === value}
              label={o.label}
              accessibilityLabel={`${label}, ${o.label}`}
              onPress={() => pick(o.key)}
            />
          ))}
        </View>
      ) : (
        <SegmentedControl itemRole="radio" accessibilityLabel={label} value={value} onChange={pick} options={options} />
      )}
      {helper !== null ? (
        <Text testID="who-pays-helper" accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
  stack: { gap: space.gapSm },
});
