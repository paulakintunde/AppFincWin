// 06.1-14 (CMP-F04, CO-D-36): the fact sentences, one row each, in the engine's order. The free-help line carries its site link
// from the typed FREE_HELP table, and only when that URL is https (T-06.1-14-01).
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FREE_HELP } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import type { Line } from '../logic/sayResult';

export interface FactLinesProps {
  facts: readonly Line[];
  /** V3Inputs.region, to find the free-help site. */
  country?: string | null;
}

const HTTPS = 'https://';

/** The https link for a country's money-help site, or null (no row, or any other scheme). */
export function freeHelpUrl(country: string | null | undefined): { name: string; url: string } | null {
  if (country === null || country === undefined || !Object.prototype.hasOwnProperty.call(FREE_HELP, country)) return null;
  const entry = FREE_HELP[country];
  return entry !== undefined && entry.url.startsWith(HTTPS) ? { name: entry.name, url: entry.url } : null;
}

export function FactLines({ facts, country = null }: FactLinesProps) {
  const { t } = useTranslation();
  const { colors, pairing } = useTheme();
  const help = freeHelpUrl(country);
  // CO-D-36: a not-cleared overdraft warning is the engine's first fact; it reads in bold ink, no new colour.
  return (
    <View testID="answer-facts" style={styles.list}>
      {facts.map((line, i) => {
        const strong = line.code === 'overdraft_not_cleared';
        return (
          <View key={`${line.code}-${i}`}>
            <Text style={{ ...textRole(pairing, strong ? 'bodyStrong' : 'body'), color: colors.ink }}>{line.text}</Text>
            {line.code === 'free_help' && help !== null ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('decide.screens.answer.frame.helpLinkA11y', { name: help.name })}
                onPress={() => void Linking.openURL(help.url).catch(() => undefined)}
                style={styles.link}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{help.name}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
