/**
 * 05-115 (D-99, D-97; UI-SPEC R17.3, R17.13 M5): the Month details sheet. It holds what "Your month" showed inline and the
 * Decide home no longer shows: the steadiness chip, the Worst / Average control, the basis line, the Comes in / Goes out /
 * Left columns, the Activity link, the rough figures with Edit (RoughFiguresSheet stacked inside this sheet) and the
 * sources note. It grows with its content; the body scrolls in a SheetScroll when the content is taller than the screen.
 *
 * When the home card has no figure (unavailable, first run) the sheet shows the reason and its one action only: no
 * columns, no basis control, no figures and no sources note.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import type { HomeCardModel } from './homeCardModel';
import { MonthDetailsBody, type YourMonthCardProps } from './YourMonthCard';
import { RoughFiguresSheet } from './RoughFiguresSheet';

export interface MonthDetailsSheetProps extends Omit<YourMonthCardProps, 'onEditRough'> {
  visible: boolean;
  /** The card label ("Your worst month" and the others). */
  title: string;
  card: HomeCardModel;
  /** The home currency, for the stacked rough figures sheet. */
  currency: string;
  /** The sources note (built by the screen); null when there is none. */
  sourcesNote: string | null;
  onClose: () => void;
}

export function MonthDetailsSheet({ visible, title, card, source, settings, userId, whole, currency, sourcesNote, onClose }: MonthDetailsSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [roughOpen, setRoughOpen] = useState(false);

  const openActivity = () => {
    onClose();
    router.navigate('/activity' as Href);
  };

  let content: React.ReactNode = null;
  if (card.state === 'figure') {
    content = (
      <>
        <MonthDetailsBody
          source={source}
          settings={settings}
          userId={userId}
          whole={whole}
          onEditRough={() => setRoughOpen(true)}
          onActivity={openActivity}
        />
        {sourcesNote !== null ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sourcesNote}</Text>
        ) : null}
      </>
    );
  } else if (card.state === 'first_run' || card.state === 'unavailable') {
    // D-97, M5: the reason and the one action, nothing else.
    const u = card.unavailable;
    const reason =
      u.reason === 'missing_rate' ? t('decide.home.unavailable.rate', { currency: u.currencies.join(', ') }) : t('decide.home.unavailable.noFigures');
    content = (
      <>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{reason}</Text>
        <View style={styles.action}>
          {u.action === 'see_rate_lines' ? (
            <Pill label={t('decide.home.unavailable.seeLines')} variant="secondary" onPress={openActivity} />
          ) : (
            <Pill label={t('decide.home.unavailable.addRough')} variant="secondary" onPress={() => setRoughOpen(true)} />
          )}
        </View>
      </>
    );
  }

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {title}
      </Text>
      <SheetScroll contentContainerStyle={styles.column}>
        {content}
        <View style={styles.action}>
          <Pill label={t('decide.home.monthDetails.close')} variant="secondary" onPress={onClose} />
        </View>
      </SheetScroll>
      <RoughFiguresSheet visible={roughOpen} userId={userId} currency={currency} settings={settings} onClose={() => setRoughOpen(false)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingTop: space.gapMd },
  action: { alignItems: 'stretch' },
});
