/**
 * 05.3-38 (UI-SPEC "Action bar"): fixed bar with two equal pills (48 high) then "Not buying it" and "Check another price" as
 * 44-high text buttons. Exactly one pill is the filled accent per the actionBar model; the other is outlined. Under rule S the
 * two pills become two full-width rows. D-19: "Check another price" opens a NEW check (reopened_from = this check) with the
 * item kept and the price focused; the stored row is never written.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Result } from '@/engine/decide/v3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useReopenCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { actionBar } from '@/features/decide/v3/model/actionBar';
import { purchaseHref } from '@/features/decide/v3/nav/hrefs';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const PILL_MIN = 48;

export interface AnswerActionBarProps {
  result: Pick<Result, 'code' | 'variant' | 'readyBy'>;
  row: DecideCheckRow;
  onBought(): void;
  onPlan(): void;
  onNotBuying(): void;
}

function BarPill({ label, primary, onPress }: { label: string; primary: boolean; onPress: () => void }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        primary
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : { backgroundColor: colors.surface, borderColor: colors.line4 },
        { opacity: pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: primary ? colors.surface : colors.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function AnswerActionBar({ result, row, onBought, onPlan, onNotBuying }: AnswerActionBarProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const stacked = useShouldStack();
  const { reopen } = useReopenCheck();
  const model = actionBar(result);

  const rightParams = model.right.params === undefined ? undefined : f.params(model.right.params).screen;
  const rightLabel = t(model.right.key, rightParams);

  const anotherPrice = (): void => {
    const newId = reopen(row, new Date().toISOString().slice(0, 10));
    pushOnce(purchaseHref(newId, { focus: 'price' }));
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.canvas, borderTopColor: colors.line1, paddingBottom: Math.max(insets.bottom, space.tabBarPadBottomMin) },
      ]}
    >
      <View style={stacked ? styles.pillsStacked : styles.pillsRow}>
        <BarPill label={t(model.left.key)} primary={model.left.primary} onPress={onBought} />
        <BarPill label={rightLabel} primary={model.right.primary} onPress={onPlan} />
      </View>
      <TextButton label={t(model.notBuyingKey)} onPress={onNotBuying} />
      <TextButton label={t(model.anotherPriceKey)} onPress={anotherPrice} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingTop: space.gapMd, paddingHorizontal: space.cardPad, gap: 4 },
  pillsRow: { flexDirection: 'row', gap: space.gapSm },
  pillsStacked: { gap: space.gapSm },
  pill: {
    flex: 1,
    minHeight: PILL_MIN,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.gapSm,
    paddingHorizontal: space.cardPad,
  },
  textButton: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
