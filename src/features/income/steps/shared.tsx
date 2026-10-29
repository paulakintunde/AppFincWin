/**
 * Plan 05.2-22: pieces the income step bodies share. Navigation-free and free of Decide-only screens, so Phase 9
 * onboarding can mount the same steps. Step titles are drawn by the host shell (stepTitleKey); a step body draws its
 * intro, controls and the "Why we ask" line.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/ui/Text';
import type { ParseKeys } from 'i18next';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode, minorUnits } from '@/engine/money';
import { heroAmountText, heroOneLineMax } from '@/features/decide/home/heroAmountText';
import type { SetupStepReady } from '@/features/decide/setup/steps/types';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { openSeriesStatus } from '@/features/record/entry/seriesStatusHost';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import type { RecurringSeriesRow } from '@/db/rows';

/**
 * The catalogue's translate function with plain string keys: step tables hold keys as data, and the typed `t` accepts
 * only literal keys. Every key used here lives in en.ts (income.*, decide.setup.shell.*, activity.incomeTag.*).
 */
export type Copy = (key: string, options?: Record<string, unknown>) => string;
export function useCopy(): Copy {
  const t = useT();
  return (key, options) => String((t as (k: ParseKeys, o?: Record<string, unknown>) => unknown)(key as ParseKeys, options));
}

/** The copy key that explains why Continue is off on a needed step (UI-SPEC: "At least one is needed to continue."). */
export const NEEDED_REASON_KEY = 'decide.setup.shell.neededReason' as const;

/** Held-Next reason on single-choice steps (one answer, not a multi-select). */
export const CHOOSE_ONE_REASON_KEY = 'decide.setup.shell.chooseOneReason' as const;

/** Held-Next reason on the account-use step (one use per account). */
export const EACH_ACCOUNT_REASON_KEY = 'decide.setup.shell.eachAccountReason' as const;

/** Reports readiness to the host. Only the three fields drive it, so a host that passes a fresh callback each render cannot loop. */
export function useReportReady(
  onReadyChange: (ready: SetupStepReady) => void,
  canContinue: boolean,
  reasonKey: string | null,
  dirty: boolean
): void {
  const callback = useRef(onReadyChange);
  useEffect(() => {
    callback.current = onReadyChange;
  });
  useEffect(() => {
    callback.current({ canContinue, reasonKey, dirty });
  }, [canContinue, reasonKey, dirty]);
}

/** A formatted amount that never breaks inside a digit group (UI-SPEC rule N, the no-wrap helper). */
export function useNoWrapMoney(currency: string): (minor: number) => string {
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  const money = useMoneyFormatter(false, currency);
  return (minor) => {
    let text: string;
    try {
      text = money.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) });
    } catch {
      text = String(minor);
    }
    return heroAmountText(text, heroOneLineMax(width, fontScale)).text;
  };
}

export function Intro({ textKey }: { textKey: string }) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t(textKey)}</Text>;
}

export function Why({ textKey }: { textKey: string }) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  return (
    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>
      {t('decide.setup.shell.why', { reason: t(textKey) })}
    </Text>
  );
}

export function Caption({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{text}</Text>;
}

export function Meta({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{text}</Text>;
}

/** A 44-high text button: ink underlined, or danger for Remove. */
export function TextButton({ label, onPress, danger = false, a11y, disabled = false }: { label: string; onPress: () => void; danger?: boolean; a11y?: string; disabled?: boolean }) {
  const { colors, pairing } = useTheme();
  const readOnly = useReadOnlyScope();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: readOnly || disabled }}
      disabled={readOnly || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: danger ? colors.danger : colors.ink, textDecorationLine: danger ? 'none' : 'underline' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 05.2 D-24: "Stopped or paused" for a saved series. Opens the status sheet only; nothing is written here. v3 only (D-01). */
export function SeriesStatusLink({ series }: { series: RecurringSeriesRow }) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const readOnly = useReadOnlyScope();
  const { v3 } = useDecideAccess();
  if (!v3) return null;
  const label = t('record.seriesStatus.action');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${series.name}, ${label}`}
      accessibilityState={{ disabled: readOnly }}
      disabled={readOnly}
      onPress={() => openSeriesStatus(series)}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

/** 05.2 D-24: paused series, listed read-only under "Paused" so Resume stays reachable. v3 only; nothing when none. */
export function PausedSeriesList({ series }: { series: readonly RecurringSeriesRow[] }) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const { v3 } = useDecideAccess();
  const money = useMoneyFormatter(false, series[0]?.currency ?? 'USD');
  if (!v3 || series.length === 0) return null;
  return (
    <View style={{ gap: space.gapMd }}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
        {t('record.seriesStatus.pausedHeading')}
      </Text>
      {series.map((s) => {
        const status = seriesStatusOf(s);
        const date = money.formatDate(status.kind === 'live' ? s.anchor_date : status.from).replace(/\s/g, ' ');
        const line = t('record.seriesStatus.statusPaused', { date });
        return (
          <View key={s.id} style={[styles.pausedCard, { borderColor: colors.line2, backgroundColor: colors.surface }]}>
            <View accessible accessibilityLabel={t('record.seriesStatus.a11yStatus', { name: s.name, status: line })} style={{ gap: 2 }}>
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{s.name}</Text>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{line}</Text>
            </View>
            <SeriesStatusLink series={s} />
          </View>
        );
      })}
    </View>
  );
}

export function Stack({ children, gap = space.gapMd }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

/** A wrapping chip row that announces as one radio or check group. */
export function ChipRow({ children, label, role = 'radiogroup' }: { children: React.ReactNode; label: string; role?: 'radiogroup' | 'none' }) {
  return (
    <View accessibilityRole={role === 'radiogroup' ? 'radiogroup' : undefined} accessibilityLabel={label} style={styles.chips}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  textButton: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  pausedCard: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
