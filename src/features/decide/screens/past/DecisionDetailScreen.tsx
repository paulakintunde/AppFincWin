// 06.1-27 (CO-D-64 (6), D48): one past decision. What Decide counted, what the records show so far, "What Decide said on {date}" from the
// check history (newest first), "See the check as it was" (a read-only answer), and "Remove from decisions" (danger text, Undo toast).
// The history read fails soft: when the table cannot be read nothing is listed and no error shows (10 is not in production yet).
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCheckHistory } from '@/data/queries/decideHistory';
import type { DecideCheckHistoryRow } from '@/db/decideCheckHistory';
import { VERDICT_TABLE, verdictRowFor, type Code, type Variant } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { canUse } from '@/features/decide/entitlements';
import { METHOD_LABEL } from '@/features/decide/screens/logic/codeMaps';
import { compareEstimate } from '@/features/decide/journal/estimateActual';
import { finalPriceOf, parseCheckInputs } from '@/features/decide/snapshot/checkInputs';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { StateBadge, type StateBadgeShape } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { router } from 'expo-router';
import { AboutSheet } from '../answer/info/AboutSheet';
import { AsCheckedAnswer, readStoredResult } from './AsCheckedAnswer';
import { estimateInputFor, localDateOf, usePastDecisions } from './data/usePastDecisions';
import { useDeleteDecision } from './data/useDeleteDecision';
import { stateForVerdict } from '../logic/stateForVerdict';

type T = (key: string, params?: Record<string, string | number>) => string;

const DASH = '—';

/** The chip word and state for one history row, or null when its code is one this build does not know. */
function chipOf(row: DecideCheckHistoryRow, once: boolean): { word: string; tone: ReturnType<typeof stateForVerdict> } | null {
  if (!Object.prototype.hasOwnProperty.call(VERDICT_TABLE, row.code)) return null;
  const variant = row.variant as Variant | null;
  const chipKey = verdictRowFor(row.code as Code, variant, once).chipKey;
  return { word: chipKey, tone: stateForVerdict(row.code, row.variant) };
}

export function DecisionDetailScreen({ id }: { id: string | null }) {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const model = usePastDecisions();
  const del = useDeleteDecision();
  const decision = id === null ? null : (model.decisions.find((d) => d.id === id) ?? null);
  const history = useCheckHistory(model.userId ?? undefined, decision?.id).data;
  const [asOf, setAsOf] = useState<DecideCheckHistoryRow | null>(null);
  const [about, setAbout] = useState(false);
  const { ctx, whole, wholeIn, formatDate, today } = model;
  const goalList = useMemo(() => [...model.goalByCheck.values()], [model.goalByCheck]);

  if (!canUse('decisionJournal')) return null;

  if (decision === null) {
    return (
      <DetailScreen title={t('decide.screens.past.list.title')}>
        <EmptyState heading={t('decide.screens.past.detail.notFoundTitle')} body={t('decide.screens.past.detail.notFoundBody')} />
      </DetailScreen>
    );
  }

  const inputs = parseCheckInputs(decision.inputs, today);
  const typed = wholeIn(inputs.currency);
  const once = inputs.method === 'cash';
  const lines = model.linesByCheck.get(decision.id) ?? [];
  const input = decision.status === 'bought' ? estimateInputFor(decision, lines, ctx) : null;
  const checkpoints = input !== null ? compareEstimate(input, today).checkpoints : [];
  const latest = [...checkpoints].reverse().find((c) => c.reached) ?? null;
  const last = checkpoints[checkpoints.length - 1] ?? null;
  const monthName = (date: string): string => {
    const [y, m] = date.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  };
  const decidedOn = formatDate(localDateOf(decision.decided_at ?? decision.updated_at, ctx.timeZone));
  const final = decision.status === 'bought' ? finalPriceOf(inputs) : null;
  const headline =
    decision.status === 'bought' && final !== null && inputs.method !== null
      ? t('decide.screens.past.detail.bought', {
          date: decidedOn,
          method: t(METHOD_LABEL[inputs.method]),
          amount: typed(final),
        })
      : t('decide.screens.past.detail.checked', { date: decidedOn });

  const rows = history ?? [];
  const name = decision.name || t('decide.quick.unnamed');

  const onRemove = () => {
    del.deleteDecision(decision, goalList);
    if (router.canGoBack()) router.back();
  };

  return (
    <DetailScreen title={name}>
      <View style={styles.stack}>
        {asOf !== null ? (
          <>
            <AsCheckedAnswer
              stored={asOf.result}
              dateText={formatDate(asOf.said_on)}
              currency={inputs.currency ?? ctx.home}
              today={asOf.said_on}
              country={null}
              once={once}
              onCantSee={() => setAbout(true)}
            />
            {about ? (
              <AboutSheet
                result={readStoredResult(asOf.result)}
                country={null}
                said={{ currency: inputs.currency ?? ctx.home, today: asOf.said_on }}
                onClose={() => setAbout(false)}
              />
            ) : null}
            <Pill variant="secondary" label={t('decide.screens.common.close')} onPress={() => setAsOf(null)} />
          </>
        ) : (
          <>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{headline}</Text>
            {input !== null ? (
              <View style={styles.group}>
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.past.detail.counted')}</Text>
                <LabelValueRow label={t('decide.screens.past.detail.upFront')} value={whole(input.estimateDayOne)} />
                <LabelValueRow label={t('decide.screens.past.detail.running')} value={whole(input.estimateMonthly)} />
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.past.detail.recordsSoFar')}</Text>
                <LabelValueRow
                  label={t('decide.screens.past.detail.upFront')}
                  value={latest !== null && latest.dayOneActual !== null ? whole(latest.dayOneActual) : DASH}
                />
                <LabelValueRow
                  label={t('decide.screens.past.detail.running')}
                  value={latest !== null && latest.monthlyActual !== null ? whole(latest.monthlyActual) : DASH}
                  {...(latest === null && last !== null ? { sub: t('decide.screens.past.detail.runningLater', { month: monthName(last.date) }) } : {})}
                />
              </View>
            ) : null}
            {rows.length > 0 ? (
              <View testID="past-history" style={styles.group}>
                {rows.map((row) => {
                  const chip = chipOf(row, once);
                  const date = formatDate(row.said_on);
                  const word = chip !== null ? String(t(chip.word)) : '';
                  return (
                    <Pressable
                      key={row.id}
                      testID={`past-history-${row.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={word === '' ? t('decide.screens.past.detail.saidOn', { date }) : t('decide.screens.past.detail.historyA11y', { date, word })}
                      onPress={() => setAsOf(row)}
                      style={styles.historyRow}
                    >
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, flexShrink: 1 }}>
                        {t('decide.screens.past.detail.saidOn', { date })}
                      </Text>
                      {chip !== null ? <StateBadge tone={chip.tone.tone} shape={chip.tone.glyph as StateBadgeShape} label={word} testID={`past-history-badge-${row.id}`} /> : null}
                    </Pressable>
                  );
                })}
                <Pill variant="secondary" label={t('decide.screens.past.detail.asItWas')} onPress={() => setAsOf(rows[0] ?? null)} />
              </View>
            ) : null}
            <Pressable
              testID="past-remove"
              accessibilityRole="button"
              onPress={onRemove}
              style={styles.remove}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('decide.screens.past.detail.remove')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  group: { gap: space.gapSm },
  historyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapSm,
    minHeight: space.touchMin,
    borderRadius: radii.card,
  },
  remove: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
