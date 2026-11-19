// 09-15 (D-03, UI-SPEC Navigation): You > Free help. Always open: this screen never reads plan state (T-09-55), so a lock, a
// failed plan query or a missing plan cannot hide it. The links are the typed FREE_HELP table (05.4-38): https only, the
// person's country first, every entry when the country has none. Information from independent services, not a recommendation.
import { Linking, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { FREE_HELP, freeHelpFor, type FreeHelpEntry } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getDeviceRegion } from '@/services/locale/deviceLocale';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';

/** The one place a help link opens: https only. */
function openHelp(entry: FreeHelpEntry): void {
  if (!entry.url.startsWith('https://')) return;
  void Linking.openURL(entry.url);
}

export function FreeHelpScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const rc = useRecordContext();
  const country = rc.region ?? getDeviceRegion(null) ?? null;
  const own = freeHelpFor(country);
  const entries: readonly FreeHelpEntry[] = own ? [own] : Object.values(FREE_HELP);
  const tint = accentTintOver(colors.fill1, colors.accent);
  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('plans.freeHelp.row')}
      </Text>
      <View style={styles.stack}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('plans.freeHelp.sub')}</Text>
        <SettingsGroup title={t('decide.screens.answer.help.title')}>
          {entries.map((entry) => (
            <Row
              key={entry.name}
              label={entry.name}
              leading={<IconTile icon="headphones" color={colors.accent} tint={tint} />}
              chevron
              accessibilityLabel={t('decide.screens.answer.help.openA11y', { name: entry.name })}
              onPress={() => openHelp(entry)}
            />
          ))}
        </SettingsGroup>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.answer.help.note')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  stack: { marginTop: space.groupGap, gap: space.groupGap },
});
