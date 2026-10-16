// 05-22 (DCU-07, D-11, D-12): Past decisions. Every bought, waiting and passed decision, newest first, with its state in
// words. A bought one shows its estimate against what the linked lines add up to once day 30 is reached. Numbers only.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { currencyCode } from '@/engine/money';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { shadows } from '@/theme/tokens';
import { EmptyState } from '@/ui/EmptyState';
import { Text } from '@/ui/Text';
import { METHOD_LABEL } from '../copy/codeMaps';
import { stateChip } from '../copy/verdictCopy';
import { canUse } from '../entitlements';
import { savedSoFar } from '../journal/goalProgress';
import { parseCheckInputs } from '../snapshot/checkInputs';
import { GoalProgress } from '../ui/GoalProgress';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { DecisionDetailSheet } from './DecisionDetailSheet';
import { deltaFor, localDateOf, useReopenDecision, usePastDecisions, type RowDelta } from './usePastDecisions';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

type T = (key: string, params?: Record<string, string | number>) => string;

function diffText(t: T, tone: 'over' | 'at' | 'under', diff: number, whole: (n: number) => string): string {
  if (tone === 'over') return t('decide.past.diffOver', { amount: whole(Math.abs(diff)) });
  if (tone === 'under') return t('decide.past.diffUnder', { amount: whole(Math.abs(diff)) });
  return t('decide.past.diffAt');
}

export function PastDecisionsScreen() {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const model = usePastDecisions();
  const wholeFmt = useMoneyFormatter(false);
  const reopen = useReopenDecision(model.today);
  const [openId, setOpenId] = useState<string | null>(null);
  const { decisions, whole, formatDate, ctx } = model;

  if (!canUse('decisionJournal')) return null;

  const selected = decisions.find((d) => d.id === openId) ?? null;

  const dateOf = (d: DecideCheckRow) => formatDate(d.decided_at !== null ? localDateOf(d.decided_at) : localDateOf(d.updated_at));

  const subLine = (d: DecideCheckRow): string | null => {
    const inputs = parseCheckInputs(d.inputs, model.today);
    const price = inputs.advertised;
    const date = dateOf(d);
    if (d.status === 'bought') {
      if (price === null) return date;
      const method = inputs.method !== null ? t(METHOD_LABEL[inputs.method]) : '';
      return method === '' ? `${whole(price)} · ${date}` : t('decide.past.subBought', { price: whole(price), method, date });
    }
    if (d.status === 'waiting') {
      const goal = model.goalByCheck.get(d.id);
      const target = goal?.target ?? price;
      if (target === null) return date;
      return t('decide.past.subWaiting', {
        target: whole(target),
        amount: whole(d.wait_monthly ?? 0),
        date: d.ready_by !== null ? formatDate(d.ready_by) : date,
      });
    }
    if (price === null) return date;
    const why = inputs.why.trim();
    return why === ''
      ? t('decide.past.subPassedNoWhy', { price: whole(price), date })
      : t('decide.past.subPassed', { price: whole(price), why, date });
  };

  const renderDelta = (delta: RowDelta) => {
    const strip = { backgroundColor: colors.fill6 };
    if (delta.kind === 'schedule') {
      return (
        <View style={[styles.delta, strip]}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, flex: 1 }}>
            {t('decide.past.matched')}
          </Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
            {t('decide.past.matchedValue', { count: delta.paid, total: delta.due })}
          </Text>
        </View>
      );
    }
    const color = delta.tone === 'over' ? colors.danger : colors.accent;
    return (
      <View style={[styles.delta, strip]}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, flex: 1 }}>
          {t('decide.past.estimated', { amount: whole(delta.estimate) })}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color }}>
          {`${whole(delta.actual)} (${diffText(t, delta.tone, delta.diff, whole)})`}
        </Text>
      </View>
    );
  };

  return (
    <DetailScreen title={t('decide.past.title')}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, paddingBottom: space.gapMd }}>
        {t('decide.past.sub')}
      </Text>
      {decisions.length === 0 ? (
        <EmptyState heading={t('decide.past.emptyHeading')} body={t('decide.past.emptyBody')} />
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
          {decisions.map((d, i) => {
            const chip = stateChip(d.status as 'bought' | 'waiting' | 'passed', 'full');
            const name = d.name || t('decide.quick.unnamed');
            const lines = model.linesByCheck.get(d.id) ?? [];
            const delta = deltaFor(d, lines, ctx);
            const sub = subLine(d);
            const goal = d.status === 'waiting' ? (model.goalByCheck.get(d.id) ?? null) : null;
            const progress = goal === null ? null : savedSoFar({ goal, lines: model.goalLines, home: ctx.home, rates: ctx.rates });
            return (
              <View
                key={d.id}
                style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={[name, t(chip.key), sub].filter((p): p is string => p !== null && p !== '').join(', ')}
                  onPress={() => setOpenId(d.id)}
                  style={({ pressed }) => [styles.main, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <View style={styles.text}>
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
                    <StateChip tone={chip.tone as StateChipTone} label={t(chip.key)} />
                    {sub !== null ? (
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>{sub}</Text>
                    ) : null}
                    {progress !== null ? (
                      <GoalProgress
                        saved={progress.saved}
                        target={progress.target}
                        whole={wholeFmt}
                        currency={currencyCode(ctx.home)}
                      />
                    ) : null}
                    {delta !== null ? renderDelta(delta) : null}
                  </View>
                  <View style={[styles.chevron, { borderColor: colors.inkFaint }]} />
                </Pressable>
                {d.status !== 'bought' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('decide.past.reopen')} ${name}`}
                    onPress={() => reopen(d)}
                    style={[styles.reopen, { backgroundColor: colors.fill1 }]}
                  >
                    <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.past.reopen')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <DecisionDetailSheet
        decision={selected}
        links={selected !== null ? (model.linksByCheck.get(selected.id) ?? []) : []}
        linkedLines={selected !== null ? (model.linesByCheck.get(selected.id) ?? []) : []}
        onClose={() => setOpenId(null)}
      />
    </DetailScreen>
  );
}

const CHEVRON = 8;
const styles = StyleSheet.create({
  list: { borderRadius: radii.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  main: {
    flex: 1,
    minHeight: space.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    paddingVertical: space.rowPad,
    paddingLeft: 18,
  },
  text: { flex: 1, gap: 4 },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    borderRadius: radii.card,
    paddingVertical: space.gapSm,
    paddingHorizontal: space.gapMd,
  },
  chevron: { width: CHEVRON, height: CHEVRON, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
  reopen: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    marginRight: space.gapMd,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
