/**
 * 05.3-38 (UI-SPEC "Assumptions line, links and actions", D-17): the card under the grey needs-input hero. One bullet line per
 * missing item that is not a question. "Help me check this" is the filled primary only when helpOffered is true;
 * "Update my records instead" always shows and opens Activity.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRootNavigationState, type Href } from 'expo-router';
import { useT } from '@/i18n';
import type { NavStateLike } from '@/shell/backHistory/navLocation';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { returnToTab } from '@/shell/navigation/returnToTab';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { helpHref } from '@/features/decide/v3/nav/hrefs';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const ACTIVITY_HREF = '/activity' as Href;

export interface NeedsInputCardProps {
  /** Full copy keys from needsInputLines(result). */
  lines: readonly string[];
  helpOffered: boolean;
  checkId: string;
}

export function NeedsInputCard({ lines, helpOffered, checkId }: NeedsInputCardProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  // UAT gap 33: the card sits on an outer-stack answer; router.navigate would push a second (tabs).
  const navState = useRootNavigationState() as unknown as NavStateLike | undefined;
  // UAT gap 29: show each distinct, non-empty line once; a line with no words (or only its own key) is dropped.
  const texts = [...new Set(lines.map((key) => t(key)))].filter((text) => text.trim() !== '' && !lines.includes(text));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.v3.ui.answer.missingHeading')}</Text>
      {texts.map((text) => (
        <View key={text} style={styles.line}>
          <Text importantForAccessibility="no" style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
            {'·'}
          </Text>
          <Text style={[styles.lineText, { ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }]}>{text}</Text>
        </View>
      ))}
      <View style={styles.actions}>
        {helpOffered ? <Pill label={t('decide.v3.ui.answer.help')} variant="primary" onPress={() => pushOnce(helpHref(checkId))} /> : null}
        <Pill label={t('decide.v3.ui.answer.updateRecords')} variant="secondary" onPress={() => returnToTab(ACTIVITY_HREF, navState)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  line: { flexDirection: 'row', gap: space.gapSm },
  lineText: { flex: 1 },
  actions: { gap: space.gapSm, paddingTop: space.gapSm },
});
