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
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { Text } from '@/ui/Text';
import { type Money } from '../check/steps/stepUi';
import { refText, type Translate } from '../check/refText';
import { METHOD_LABEL } from '../copy/codeMaps';
import { monthFigure } from '../copy/monthFigure';
import { stateChip } from '../copy/verdictCopy';
import { canUse } from '../entitlements';
import { inHomeCurrency, sourceFor } from '../snapshot/checkCurrency';
import { effectiveMethod, parseCheckInputs } from '../snapshot/checkInputs';
import { computeChip } from '../snapshot/computeCheck';
import { selectOtherChecks } from '../snapshot/stacking';
import type { ChipComputation, SnapshotResult } from '../snapshot/types';
import { DeletableRow } from '../ui/DeletableRow';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { checkHref, openNewCheck, type CheckKind } from './checkHref';

export interface OpenChecksCardProps {
  source: SnapshotResult | null;
  checks: readonly DecideCheckRow[]; // the open checks (checks in any other status are ignored)
  today: string;
  whole: Money;
  currency: string;
  /** 05-113 (D-99): the pushed screen keeps the heading links with no checks; the home hides the card at 0. */
  showWhenEmpty?: boolean;
}

interface RowView {
  row: DecideCheckRow;
  chip: ChipComputation | null;
  hasPriceAndMethod: boolean;
  price: number | null;
  method: ReturnType<typeof effectiveMethod>;
  /** The month's left on this row counts the other open checks too (stacked), not this check alone. */
  withOthers: boolean;
}

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

export function OpenChecksCard({ source, checks, today, whole, currency, showWhenEmpty = false }: OpenChecksCardProps) {
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
        const others = source === null || view === null ? [] : selectOtherChecks({ checks: open, excludeId: row.id, source, today }).otherChecks;
        const chip = source === null || view === null ? null : computeChip(sourceFor(source, view), inputs, others, row.id);
        const shown = view?.kind === 'missing' ? null : inputs.advertised;
        const withOthers = inputs.combine !== false && others.length > 0;
        return { row, chip, hasPriceAndMethod: inputs.advertised !== null && method !== null, price: shown, method, withOthers };
      }),
    [open, source, today]
  );

  const start = (kind: CheckKind) => {
    if (open.length > 0 && !canUse('multipleOpenChecks')) return;
    openNewCheck(kind);
  };

  const onDelete = (row: DecideCheckRow) => {
    const stepId = abandon(row, 'deleted');
    showToast({ kind: 'destructive', text: { key: 'decide.delete.toastCheck', params: { name: row.name } }, stepId });
    getAnalytics().track('check_abandoned', {});
  };

  // D-72: with no saved open check the card (heading included) is gone; the add row on home replaces it.
  if (views.length === 0 && !showWhenEmpty) return null;

  const link = { ...textRole(pairing, 'label'), color: colors.accent };

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        {/* R6 rule W: the heading never wraps (flexShrink 0); when the links do not fit beside it they wrap below it as a group. */}
        <Text testID="open-checks-heading" accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, flexShrink: 0 }}>
          {t('decide.open.heading')}
        </Text>
        <View style={styles.links}>
          <Pressable accessibilityRole="button" onPress={() => start('buy')} style={styles.link}>
            <Text style={[link, styles.noShrink]}>{t('decide.open.purchase')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => start('invest')} style={styles.link}>
            <Text style={[link, styles.noShrink]}>{t('decide.open.investment')}</Text>
          </Pressable>
        </View>
      </View>
      {views.length === 0 ? null : (
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
                ? t(v.withOthers ? 'decide.open.subWithOthers' : 'decide.open.sub', { price: whole(price), method: methodText, left: refText(t, monthFigure(left, whole)) })
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

          // The full name is read aloud even when the visible one is clamped to two lines.
          const a11y = [name, badge?.label, changed, sub].filter((p): p is string => p != null && p !== '').join(', ');
          const onOpen = () => pushOnce(checkHref(row.id, { step: v.hasPriceAndMethod ? '3' : '1' }));
          return (
            <View key={row.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null}>
              <DeletableRow
                name={name}
                accessibilityLabel={a11y}
                onOpen={onOpen}
                menu={[{ key: 'open', label: t('decide.delete.menuOpen'), onSelect: onOpen }]}
                confirm={{ title: t('decide.delete.checkTitle'), body: t('decide.delete.checkBody') }}
                onDelete={() => onDelete(row)}
              >
                <View style={styles.text}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                    {name}
                  </Text>
                  {badge !== null ? (
                    <View style={styles.chipRow}>
                      <StateChip tone={badge.tone} label={badge.label} />
                    </View>
                  ) : null}
                  {changed !== null ? (
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{changed}</Text>
                  ) : null}
                  {sub !== null ? (
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
                  ) : null}
                </View>
              </DeletableRow>
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
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.gapSm },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.gapMd },
  noShrink: { flexShrink: 0 },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  text: { gap: 4, paddingVertical: space.rowPad, paddingLeft: 18, minHeight: space.touchMin, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
