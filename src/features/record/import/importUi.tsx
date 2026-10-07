// Small text and layout pieces shared by the import steps. Colours come from useTheme() tokens
// only (DSG-02); text roles from the UI-SPEC typography table. File text is rendered as plain
// Text, never as a link or markup (T-02-27 trust boundary).
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole, type TextRole } from '@/theme/typography';

/**
 * Formats a minor-unit amount in its own currency. A currency code the engine does not know
 * falls back to the bare figure rather than throwing mid-render (a file can name any code).
 */
export function useFormatAmount(): { amount: (minor: number, currency: string) => string; date: (localDate: string) => string } {
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  return {
    amount: (minor, currency) => {
      try {
        return formatter.formatMoney(money(minor, currency));
      } catch {
        return `${minor} ${currency}`;
      }
    },
    date: (localDate) => formatter.formatDate(localDate, 'short'),
  };
}

/** Translates a key that is only known at run time (keys assembled from a profile or a reject reason). */
export function useDynamicT(): (key: string, params?: Record<string, string>) => string {
  const t = useT();
  return (key, params) => String(t(key as never, params as never));
}

type Tone = 'ink' | 'inkMuted' | 'danger';

export function T({
  role = 'body',
  tone = 'ink',
  children,
  numberOfLines,
}: {
  role?: TextRole;
  tone?: Tone;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const { colors, pairing } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={{ ...textRole(pairing, role), color: colors[tone] }}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="header" style={styles.heading}>
      <T role="sheetTitle">{children}</T>
    </View>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

/** The "Possible duplicate" / "Can't verify" chip: fill1, inkMuted Label text, words only (UI-SPEC). */
export function Tag({ label, accessibilityLabel }: { label: string; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? label} style={[styles.tag, { backgroundColor: colors.fill1 }]}>
      <T role="label" tone="inkMuted">
        {label}
      </T>
    </View>
  );
}

/** The recurring-suggestion card treatment: a fill1 card, Body text, two actions at the foot. */
export function SuggestionCard({
  children,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessible={accessibilityLabel !== undefined} accessibilityLabel={accessibilityLabel} style={[styles.card, { backgroundColor: colors.fill1 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { paddingBottom: space.gapSm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm, paddingTop: space.gapMd },
  tag: { borderRadius: radii.pill, paddingHorizontal: space.gapSm, paddingVertical: 1, alignSelf: 'flex-start' },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm, marginTop: space.gapMd },
});
