// 06.1-35 (D65, CMP-F04, CO-D-122): "Money help at no cost". Independent services from the typed FREE_HELP table only; a link opens
// only when it is https. Information, never a recommendation: FincWin is not paid by these services and is not a lender.
import React from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import { freeHelpFor } from '@/engine/decide/v3';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { Body, InfoSheet } from './infoUi';

/** The one place a help link is opened: https only. */
export function openHelpUrl(url: string): boolean {
  if (!url.startsWith('https://')) return false;
  void Linking.openURL(url);
  return true;
}

export interface FreeHelpSheetProps {
  country: string | null;
  onClose: () => void;
}

export function FreeHelpSheet({ country, onClose }: FreeHelpSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const entry = freeHelpFor(country);
  const rows = entry === null ? [] : [entry];
  return (
    <InfoSheet title={t('decide.screens.answer.help.title')} onClose={onClose}>
      <Body muted>{t('decide.screens.answer.help.sub')}</Body>
      {rows.length === 0 ? <Body testID="free-help-none">{t('decide.screens.answer.help.none')}</Body> : null}
      {rows.map((r) => (
        <Pressable
          key={r.name}
          testID="free-help-row"
          accessibilityRole="link"
          accessibilityLabel={t('decide.screens.answer.help.openA11y', { name: r.name })}
          onPress={() => openHelpUrl(r.url)}
          style={styles.row}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{r.name}</Text>
        </Pressable>
      ))}
      <Body muted>{t('decide.screens.answer.help.note')}</Body>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: space.touchMin, justifyContent: 'center' },
});
