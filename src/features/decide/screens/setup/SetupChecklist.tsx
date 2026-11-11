// 06.1-17 (D31): the Decide setup checklist. Six rows with their status, a count with the same segmented bar as the banner, and one
// button that goes to the next open item. Presentational: progress, the item routes and navigation come in as props.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { StateGlyph, type StateGlyphName } from '@/ui/glyphs/StateGlyph';
import { Pill } from '@/ui/Pill';
import { StateBadge } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import type { SetupItemId, SetupProgress } from '../logic/setupProgress';
import { SetupBar } from './SetupBanner';
import { useSetupText } from './useSetupText';

const TILE = 40;

/** Item screens built by plans 24 and 25; linked as strings so this plan does not depend on them. */
export const SETUP_ROUTES: Record<SetupItemId, Href> = {
  pay: '/decide/setup/pay' as Href,
  bills: '/decide/setup/bills' as Href,
  debts: '/decide/setup/debts' as Href,
  net: '/decide/setup/net' as Href,
  rules: '/decide/setup/rules' as Href,
  records: '/decide/setup/records' as Href,
};

const TILE_GLYPH: Record<SetupItemId, StateGlyphName> = {
  pay: 'calendar',
  bills: 'bills',
  debts: 'debt',
  net: 'savings',
  rules: 'target',
  records: 'view',
};

export interface SetupChecklistProps {
  progress: SetupProgress;
  currency: string;
  /** Opens an item screen. */
  onOpen: (route: Href) => void;
  /** Leaves setup for Decide home (shown instead of Continue once everything is done). */
  onBack: () => void;
}

export function SetupChecklist({ progress, currency, onOpen, onBack }: SetupChecklistProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const text = useSetupText(currency);
  const next = progress.next;
  return (
    <View testID="setup-checklist" style={styles.page}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t(progress.allDone ? 'decide.screens.setup.checklist.doneTitle' : 'decide.screens.setup.checklist.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t(progress.allDone ? 'decide.screens.setup.checklist.doneSub' : 'decide.screens.setup.checklist.sub')}
        </Text>
      </View>
      <View style={styles.count}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.screens.setup.checklist.progress', { count: progress.doneCount })}</Text>
        <SetupBar done={progress.doneCount} />
      </View>
      <View style={[styles.list, { backgroundColor: colors.surface }]}>
        {progress.items.map((item) => {
          const name = text.itemName(item.id);
          const status = text.status(item);
          return (
            <Pressable
              key={item.id}
              testID={`setup-row-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('decide.screens.setup.checklist.rowA11y', { item: name, status })}
              onPress={() => {
                hapticLight();
                onOpen(SETUP_ROUTES[item.id]);
              }}
              style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
                <StateGlyph name={TILE_GLYPH[item.id]} color={colors.ink} size={22} />
              </View>
              <View style={styles.rowText}>
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{name}</Text>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{status}</Text>
              </View>
              {item.done ? (
                <StateBadge tone="accent" shape="sCheck" label={t('decide.screens.setup.checklist.statusDone')} testID={`setup-done-${item.id}`} />
              ) : (
                <StateGlyph name="chev" color={colors.inkMuted} size={18} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.setup.checklist.note')}</Text>
      {next !== null ? (
        <Pill
          variant="primary"
          label={t('decide.screens.setup.checklist.continue', { next: text.itemName(next) })}
          onPress={() => {
            hapticLight();
            onOpen(SETUP_ROUTES[next]);
          }}
        />
      ) : (
        <Pill variant="primary" label={t('decide.screens.common.backToDecide')} onPress={onBack} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.groupGap, paddingHorizontal: space.screenH },
  titleBlock: { gap: space.gapSm },
  count: { gap: space.gapSm },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, padding: space.cardPad, minHeight: 64 },
  tile: { width: TILE, minHeight: TILE, borderRadius: radii.glyphTile + 3, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
});
