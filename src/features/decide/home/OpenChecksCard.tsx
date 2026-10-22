// 05-21 (DCU-03, DCU-04, D-15, D-24): the open checks. Every row's state is recomputed from the live snapshot on
// render through the cheaper chip entry; nothing is stored. A row whose state differs from the one last seen says
// so in words. Each check is judged with the other open checks unless its own toggle is off (computeChip handles that).
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DecideCheckRow, SeenState } from '@/db/decideChecks';
import { useAbandonCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { Text } from '@/ui/Text';
import { Card, type Money } from '../check/steps/stepUi';
import { type Translate } from '../check/refText';
import { METHOD_LABEL } from '../copy/codeMaps';
import { stateChip } from '../copy/verdictCopy';
import { canUse } from '../entitlements';
import { inHomeCurrency, sourceFor } from '../snapshot/checkCurrency';
import { effectiveMethod, parseCheckInputs } from '../snapshot/checkInputs';
import { computeChip } from '../snapshot/computeCheck';
import { selectOtherChecks } from '../snapshot/stacking';
import type { ChipComputation, SnapshotResult } from '../snapshot/types';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { checkHref, openNewCheck, type CheckKind } from './checkHref';

export interface OpenChecksCardProps {
  source: SnapshotResult | null;
  checks: readonly DecideCheckRow[]; // the open checks (checks in any other status are ignored)
  today: string;
  whole: Money;
  currency: string;
}

interface RowView {
  row: DecideCheckRow;
  chip: ChipComputation | null;
  hasPriceAndMethod: boolean;
  price: number | null;
  method: ReturnType<typeof effectiveMethod>;
}

const CHEVRON = 8;

function seenOf(chip: ChipComputation | null): SeenState | null {
  return chip !== null && (chip.status === 'logged' || chip.status === 'first_read') ? chip.state : null;
}

function chipLabel(chip: ChipComputation | null, t: Translate): { label: string; tone: StateChipTone } | null {
  if (chip === null) return null;
  switch (chip.status) {
    case 'none':
      return null;
    case 'incomplete':
      return { label: t('decide.state.draft'), tone: 'draft' };
    case 'unconverted':
      return { label: t('decide.state.missing'), tone: 'missing' };
    case 'logged':
    case 'first_read': {
      const c = stateChip(chip.state, 'full');
      return { label: t(c.key), tone: c.tone as StateChipTone };
    }
  }
}

export function OpenChecksCard({ source, checks, today, whole, currency }: OpenChecksCardProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const { abandon } = useAbandonCheck();

  const open = useMemo(() => checks.filter((c) => c.status === 'open' && c.deleted_at === null), [checks]);

  // Part 2 (D-24 amended): each row is judged with all the other open checks, so another check's edit can flip a row.
  const views = useMemo<RowView[]>(
    () =>
      open.map((row) => {
        const stored = parseCheckInputs(row.inputs, today);
        // D-67: a check typed in another currency is judged and priced in the home currency at the latest stored rate; with
        // no stored rate it reads missing and no price is shown in the wrong currency.
        const view = source === null ? null : inHomeCurrency(stored, source, { isSample: row.is_sample });
        const inputs = view === null ? stored : view.inputs;
        const method = effectiveMethod(inputs);
        const chip =
          source === null || view === null
            ? null
            : computeChip(sourceFor(source, view), inputs, selectOtherChecks({ checks: open, excludeId: row.id, source, today }).otherChecks);
        const shown = view?.kind === 'missing' ? null : inputs.advertised;
        return { row, chip, hasPriceAndMethod: inputs.advertised !== null && method !== null, price: shown, method };
      }),
    [open, source, today]
  );

  const start = (kind: CheckKind) => {
    if (open.length > 0 && !canUse('multipleOpenChecks')) return;
    openNewCheck(kind);
  };

  const onAbandon = (row: DecideCheckRow) => {
    const stepId = abandon(row);
    showToast({ kind: 'destructive', text: { key: 'decide.toast.abandoned' }, stepId });
    getAnalytics().track('check_abandoned', {});
  };

  const link = { ...textRole(pairing, 'label'), color: colors.accent };

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, flex: 1 }}>
          {t('decide.open.heading')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => start('buy')} style={styles.link}>
          <Text style={link}>{t('decide.open.purchase')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => start('invest')} style={styles.link}>
          <Text style={link}>{t('decide.open.investment')}</Text>
        </Pressable>
      </View>
      {views.length === 0 ? (
        <Card>
          <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{t('decide.open.emptyHeading')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.open.emptyBody')}</Text>
        </Card>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
          {views.map((v, i) => {
            const { row, chip } = v;
            const name = row.name || t('decide.quick.unnamed');
            const badge = chipLabel(chip, t);
            const price = v.price !== null && chip !== null && chip.status !== 'incomplete' ? chip.price : v.price;
            const methodText = v.method !== null ? t(METHOD_LABEL[v.method]) : null;
            const left = chip !== null && (chip.status === 'logged' || chip.status === 'first_read') ? chip.left : null;

            let sub: string | null = null;
            if (price !== null && chip !== null && chip.status === 'incomplete') {
              sub = methodText === null ? t('decide.open.subDraft', { price: whole(price) }) : `${whole(price)} · ${methodText}`;
            } else if (price !== null && methodText !== null) {
              sub =
                left !== null
                  ? t('decide.open.sub', { price: whole(price), method: methodText, left: whole(left) })
                  : `${whole(price)} · ${methodText}`;
            } else if (price !== null) {
              sub = t('decide.open.subDraft', { price: whole(price) });
            }

            const seen = seenOf(chip);
            const previous = row.last_seen_state;
            const changed =
              seen !== null && previous !== null && previous !== seen
                ? t('decide.open.changed') + t('decide.open.was', { state: t(stateChip(previous, 'full').key) })
                : null;

            const a11y = [name, badge?.label, changed, sub].filter((p): p is string => p != null && p !== '').join(', ');
            return (
              <View
                key={row.id}
                style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  onPress={() => pushOnce(checkHref(row.id, { step: v.hasPriceAndMethod ? '3' : '1' }))}
                  style={({ pressed }) => [styles.main, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <View style={styles.text}>
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
                    {badge !== null ? <StateChip tone={badge.tone} label={badge.label} /> : null}
                    {changed !== null ? (
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{changed}</Text>
                    ) : null}
                    {sub !== null ? (
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.chevron, { borderColor: colors.inkFaint }]} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('decide.open.abandonA11y', { name })}
                  onPress={() => onAbandon(row)}
                  style={styles.remove}
                >
                  <View style={[styles.removeBar, { backgroundColor: colors.inkDim }]} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
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
  chevron: { width: CHEVRON, height: CHEVRON, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  removeBar: { width: 12, height: 2, borderRadius: 1 },
});
