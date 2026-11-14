// 06.1-14 (APP-10, D-52): the offline, error and not-ready cards. One card look. The error card never says "not found" and shows
// no figure; the not-ready card lists what is missing and never reads like a verdict. 06.1-44: the not-ready card names each item.
// 06.1-66: the Not ready exits (FQ6) and the outcome line of a decided check (FQ8).
// 06.1-67 (G-10, routed from 06.1-59): the Not ready card keeps one sentence in view; "More may follow" opens under a More row.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Pill } from '@/ui/Pill';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';
import type { ReadinessFixRow } from '../logic/readinessFixes';
import { MoreRow } from '../ui/MoreRow';
import { ReadinessFixList, type ReadinessFixListProps } from './ReadinessFixList';

function Card({ testID, children }: { testID: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface }]}>
      {children}
    </View>
  );
}

export function OfflineCard({ date, onRetry }: { date: string; onRetry: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID="answer-offline">
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.common.offline.title', { date })}</Text>
      <Pill variant="secondary" label={t('decide.screens.common.offline.retry')} onPress={onRetry} />
    </Card>
  );
}

export function ErrorCard({ item, onRetry }: { item: string; onRetry: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID="answer-error">
      <StateGlyph name="sQuestion" color={stateColors.notYet.color} size={22} />
      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.common.error.title')}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.common.error.message')}</Text>
      <Pill
        variant="primary"
        label={t('decide.screens.common.error.retry')}
        accessibilityLabel={t('decide.screens.common.error.retryA11y', { item })}
        onPress={onRetry}
      />
    </Card>
  );
}

export interface NotReadyCardProps extends Omit<ReadinessFixListProps, 'rows'> {
  /** 06.1-44 (C-2): the named readiness items with their fixes and answers (readinessFixRows). */
  rows: readonly ReadinessFixRow[];
  /**
   * 06.1-66 (OQ-66-2, DS-2): a "More needed" answer (needs_input) is the same not-ready state. With no readiness row, its first
   * missing figure is the item: the sentence and what sits under it (the Fix link).
   */
  missing?: { text: string; after: React.ReactNode } | null;
  /** D-57 (C-1): quick estimates count only while the records hold no earlier month (estimatesCanAnswer). */
  canUseEstimates: boolean;
  onFinishSetup: () => void;
  onFromEstimates: () => void;
}

/**
 * 06.1-44 (G-1, C-1, C-2, A-ANS-3): one short lead line, then the item with its fix and answers. Quick estimates are the
 * primary only when they can count (a person with no earlier month); otherwise "Finish setup" is the primary and the card carries no
 * quick-estimates control at all, so a person with records is never sent round the loop again (F-1).
 * 06.1-66 (OQ-66-1, DN-10): no count. Decide finds some items only after earlier ones are done, so the card names the first item
 * ("First: …") and says more may follow; answering it re-judges and the next one shows.
 */
export function NotReadyCard({ rows, missing = null, canUseEstimates, onFinishSetup, onFromEstimates, ...list }: NotReadyCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-68 (CB-11): a row just answered stays in view as "Saved, updating…" over the next open row until the engine drops it.
  const answered = list.answered;
  const openAt = answered === undefined ? 0 : rows.findIndex((r) => !answered.has(r.id));
  const first = answered === undefined ? rows.slice(0, 1) : rows.filter((r, i) => answered.has(r.id) || i === openAt);
  const hasItem = first.length > 0 || missing !== null;
  return (
    <Card testID="answer-not-ready">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('decide.screens.answer.notReady.title')}
      </Text>
      {first.length > 0 ? (
        <ReadinessFixList rows={first} leadFirst {...list} />
      ) : missing !== null ? (
        <View testID="answer-not-ready-missing" style={styles.missing}>
          <Text accessible style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('decide.screens.answer.notReady.first', { item: missing.text })}
          </Text>
          {missing.after}
        </View>
      ) : null}
      {hasItem ? <MoreRow testID="answer-not-ready-more">{t('decide.screens.answer.notReady.moreMayFollow')}</MoreRow> : null}
      {canUseEstimates ? (
        <>
          <Pill variant="primary" label={t('decide.screens.answer.notReady.fromEstimates')} onPress={onFromEstimates} />
          <Pressable testID="answer-not-ready-finish" accessibilityRole="link" onPress={onFinishSetup} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.answer.notReady.finishSetup')}</Text>
          </Pressable>
        </>
      ) : (
        <Pill variant="primary" label={t('decide.screens.answer.notReady.finishSetup')} onPress={onFinishSetup} />
      )}
    </Card>
  );
}

/** 06.1-66 (FQ6, CS-3): the two ways out of a check that has no answer yet. No buy or save until there is a verdict (OQ-66-2). */
export function NotReadyExits({ onNotBuying, onDelete }: { onNotBuying: () => void; onDelete: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  const exit = (testID: string, label: string, onPress: () => void) => (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>
    </Pressable>
  );
  return (
    <View testID="answer-not-ready-exits" style={styles.exits}>
      {exit('answer-not-ready-not-buying', t('decide.screens.answerActions.bar.notBuying'), onNotBuying)}
      {exit('answer-not-ready-delete', t('decide.screens.answer.notReady.deleteCheck'), onDelete)}
    </View>
  );
}

/** 06.1-66 (FQ8, CC-2, DS-5): a decided check says what happened, with a link to its Past decisions entry, in place of the action bar. */
export function OutcomeLine({ text, onOpenPast }: { text: string; onOpenPast: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const press = usePressFeedback('row');
  return (
    <View testID="answer-outcome" style={[styles.outcome, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.gapSm }]}>
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{text}</Text>
      <Pressable testID="answer-outcome-past" accessibilityRole="link" onPress={onOpenPast} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.answer.outcome.pastLink')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd, alignItems: 'flex-start' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  missing: { gap: space.gapSm, alignSelf: 'stretch' },
  exits: { gap: space.gapSm, alignItems: 'flex-start' },
  outcome: { paddingHorizontal: space.screenH, paddingVertical: space.gapSm, gap: space.gapSm },
});
