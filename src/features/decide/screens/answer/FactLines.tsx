// 06.1-14 (CMP-F04, CO-D-36): the fact sentences, in the engine's order. freeHelpUrl gives a help site only from the typed FREE_HELP
// table, and only when that URL is https (T-06.1-14-01).
// 06.1-67 (H-6, G-10, CS-1, CS-4, DS-3): short line first. The first fact shows in full; every other fact, and the notices that are
// not the one above the verdict, open in place under one "Why?" (06.1-59 WhyLine). Nothing is removed (D-18: the engine's copy keys
// are unchanged; only where a line sits changes). Missing figures are one short line whose "More" opens "Give it more to go on",
// which lists each of them. Free help lives only in its More detail row; its sentence shows here only when that row cannot.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { FREE_HELP, freeHelpFor } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';
import { WhyLine } from '../ui/WhyLine';
import type { Line } from '../logic/sayResult';

export interface FactLinesProps {
  facts: readonly Line[];
  /** DS-3: notices that do not sit above the verdict. They open under the same Why?, after the facts. Absent = none. */
  notices?: readonly Line[];
  /** CS-4: how many figures are missing; above 0 draws the one short line. Absent = 0. */
  missingCount?: number;
  /** Opens "Give it more to go on", the one place every missing figure is listed. */
  onMissingMore?: () => void;
  /** V3Inputs.region: the free-help sentence moves to its More detail row when the country has a service. */
  country?: string | null;
  /** 06.1-23: extra content under one fact (the factAction buttons). The index is the fact's place in `facts`. */
  renderAfter?: (line: Line, index: number) => React.ReactNode;
}

const HTTPS = 'https://';
const NO_LINES: readonly Line[] = [];

/** The https link for a country's money-help site, or null (no row, or any other scheme). */
export function freeHelpUrl(country: string | null | undefined): { name: string; url: string } | null {
  if (country === null || country === undefined || !Object.prototype.hasOwnProperty.call(FREE_HELP, country)) return null;
  const entry = FREE_HELP[country];
  return entry !== undefined && entry.url.startsWith(HTTPS) ? { name: entry.name, url: entry.url } : null;
}

export function FactLines({ facts, notices = NO_LINES, missingCount = 0, onMissingMore, country = null, renderAfter }: FactLinesProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  // CS-4: the free-help sentence has its own More detail row whenever the country has a service listed.
  const helpRow = freeHelpFor(country) !== null;
  const shown = facts.map((line, index) => ({ line, index })).filter(({ line }) => !(helpRow && line.code === 'free_help'));
  const [first, ...rest] = shown;
  // CO-D-36: a not-cleared overdraft warning is the engine's first fact; it reads in bold ink, no new colour.
  const fact = ({ line, index }: { line: Line; index: number }) => (
    <View key={`${line.code}-${index}`} testID={`answer-fact-${index}`}>
      <Text style={{ ...textRole(pairing, line.code === 'overdraft_not_cleared' ? 'bodyStrong' : 'body'), color: colors.ink }}>{line.text}</Text>
      {renderAfter?.(line, index) ?? null}
    </View>
  );
  const missingText = String(t('decide.screens.answer.giveMore.missingShort', { count: missingCount }));
  const more = String(t('decide.screens.common.more'));
  return (
    <View testID="answer-facts" style={styles.list}>
      {first !== undefined ? fact(first) : null}
      {missingCount > 0 ? (
        <Pressable
          testID="answer-missing-more"
          accessibilityRole="button"
          accessibilityLabel={`${missingText} ${more}`}
          onPress={() => onMissingMore?.()}
          android_ripple={press.android_ripple}
          style={({ pressed }) => [styles.missing, press.pressedStyle(pressed)]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {missingText} <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{more}</Text>
          </Text>
        </Pressable>
      ) : null}
      {rest.length > 0 || notices.length > 0 ? (
        <WhyLine testID="answer-facts-why">
          <View style={styles.list}>
            {rest.map(fact)}
            {notices.map((n, i) => (
              <Text key={`${n.code}-${i}`} testID={`answer-notice-${n.code}`} style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
                {n.text}
              </Text>
            ))}
          </View>
        </WhyLine>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  missing: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'stretch' },
});
