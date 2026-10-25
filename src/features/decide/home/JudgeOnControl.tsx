/**
 * 05-140 (D-107; UI-SPEC R17.3, rule S): the Judge-on control on the dark card. `JudgeOnButton` is the compact dropdown
 * in the card's top row ("This month ▾", the DarkPill tint look); `JudgeOnSheet` is the app Sheet with the three choices.
 * Both are presentational: the screen calls `useChooseJudgeOn` once and passes `onChoose`, so the card, Month details and
 * every check read and write the one choice. With fewer than 3 full months the choice is This month only, so the button
 * is a plain label.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { prepareContext } from '@/engine/decide';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import type { SnapshotResult } from '../snapshot/types';
import { DarkPill } from '../ui/DarkPill';
import type { HomeJudgeOn } from './homeCardModel';

const ARROW = '▾';
/** 04 D-12: Worst and Average need this many full months. */
const MIN_FULL_MONTHS = 3;

export const JUDGE_ON_ORDER: readonly HomeJudgeOn[] = ['month', 'worst', 'average'];
export const JUDGE_ON_KEY = {
  month: 'decide.home.card.judge.month',
  worst: 'decide.home.card.judge.worst',
  average: 'decide.home.card.judge.average',
} as const satisfies Record<HomeJudgeOn, string>;

/** True when the source has 3 or more full months, so Worst and Average can be chosen. */
export function canChooseJudgeOn(source: SnapshotResult | null): boolean {
  if (source === null || source.kind !== 'logged') return false;
  const ctx = prepareContext(source.snapshot);
  return ctx.ok && ctx.context.money.fullMonthsUsed >= MIN_FULL_MONTHS;
}

export interface JudgeOnButtonProps {
  /** The chosen name; null = not read yet (nothing shows). */
  selected: HomeJudgeOn | null;
  /** false = fewer than 3 full months: a plain "This month" label, not pressable. */
  canChoose: boolean;
  onPress: () => void;
}

export function JudgeOnButton({ selected, canChoose, onPress }: JudgeOnButtonProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (selected === null) return null;
  if (!canChoose) {
    return (
      <View style={styles.plain} testID="judge-on-label">
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkSoft1 }}>{t(JUDGE_ON_KEY.month)}</Text>
      </View>
    );
  }
  const name = t(JUDGE_ON_KEY[selected]);
  return (
    <View testID="judge-on-button" style={styles.button}>
      <DarkPill
        variant="tint"
        label={`${name} ${ARROW}`}
        accessibilityLabel={t('decide.home.card.judge.a11y', { basis: name })}
        onPress={onPress}
      />
    </View>
  );
}

export interface JudgeOnSheetProps {
  visible: boolean;
  selected: HomeJudgeOn | null;
  /** D-106 addendum: set when This month is waiting for these currencies' rates. */
  fallback: { currencies: readonly string[] } | null;
  onChoose: (v: HomeJudgeOn) => void;
  onClose: () => void;
}

export function JudgeOnSheet({ visible, selected, fallback, onChoose, onClose }: JudgeOnSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const title = t('decide.home.card.judge.sheetTitle');
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {title}
      </Text>
      <View style={styles.column}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.home.card.judge.sheetBody')}</Text>
        {fallback === null ? null : (
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('decide.home.card.judge.sheetWaiting', { currency: fallback.currencies.join(', ') })}
          </Text>
        )}
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          {JUDGE_ON_ORDER.map((v) => {
            const checked = selected === v;
            const label = t(JUDGE_ON_KEY[v]);
            return (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                onPress={() => {
                  hapticSelection();
                  onChoose(v);
                  onClose();
                }}
                style={styles.radioRow}
              >
                <RadioDot selected={checked} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  button: { flexShrink: 1 },
  plain: { minHeight: space.touchMin, justifyContent: 'center' },
  column: { gap: space.gapMd, paddingTop: space.gapMd },
  radioRow: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
