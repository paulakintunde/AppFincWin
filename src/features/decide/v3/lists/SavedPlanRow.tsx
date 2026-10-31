/**
 * 05.3-36 (UI-SPEC "Saved plans and unfinished checks", D-13, D-16): one row for a saved plan or an unfinished check.
 * The chip is the stored answer_v3 (read, never written); a live answer that differs adds "Changed since you saved".
 * A saved row opens the answer and can be deleted (Undo toast, D-23); an unfinished row opens the check and can be deleted (Undo toast).
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAbandonCheck } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { DeletableRow } from '../../ui/DeletableRow';
import { refundHint } from '../model/refundHint';
import { savedPlanRow } from '../model/savedPlanRow';
import { answerHref, purchaseHref } from '../nav/hrefs';
import { useV3Format } from '../shared/useV3Format';
import { useDeleteRow } from './useRowActions';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const ROW_RADIUS = 16;
const ROW_MIN = 60;
const PAD_V = 10;
const PRICE_FIT = 0.8;

export interface SavedPlanRowProps {
  row: DecideCheckRow;
  /** The live evaluation of this row, when computed. */
  live: Evaluation | undefined;
  /** The same row judged with refunds left out (D-13), when it has refund links. */
  without: Evaluation | undefined;
}

export function SavedPlanRow({ row, live, without }: SavedPlanRowProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const { abandon } = useAbandonCheck();
  const del = useDeleteRow();

  const model = useMemo(() => {
    const refundBetter = refundHint({ stored: row.answer_v3, live: live?.result, without: without?.result });
    return savedPlanRow({ row, live, refundBetter });
  }, [row, live, without]);

  const item = model.item === '' ? t('decide.quick.unnamed') : model.item;
  const price = model.price === null ? null : f.money(Number(model.price));
  const priceA11y = model.price === null ? '' : f.moneyA11y(Number(model.price));
  const unfinished = model.kind === 'unfinished';
  const chip = t(model.chipKey);

  const a11y = t(model.a11yKey, { item, price: priceA11y, chip }).replace(/, \./g, '.');

  let toneColor: string = colors.inkDim;
  if (model.tone === 'fits') toneColor = colors.accent;
  else if (model.tone === 'caution') toneColor = colors.warn1;
  else if (model.tone === 'short') toneColor = colors.danger;

  const line2 = unfinished
    ? t(model.lineKey ?? 'decide.v3.ui.home.unfinishedLine')
    : model.coveredByMonth !== null
      ? t('decide.v3.ui.home.coveredBy', { chip, month: f.month(model.coveredByMonth) })
      : chip;

  const body = (
    <View style={styles.text}>
      <View style={styles.titleRow}>
        <Text style={[{ ...textRole(pairing, 'body'), color: colors.ink }, styles.item]}>{item}</Text>
        {price !== null ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={PRICE_FIT}
            style={[{ ...textRole(pairing, 'body'), color: colors.ink }, styles.price]}
          >
            {`· ${price}`}
          </Text>
        ) : null}
      </View>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: unfinished ? colors.inkMuted : toneColor }}>{line2}</Text>
      {model.changed ? (
        <View style={[styles.changed, { backgroundColor: warnTint }]}>
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>
            {t('decide.v3.ui.home.changedSinceSaved')}
          </Text>
        </View>
      ) : null}
      {model.refundLine ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{t('decide.v3.ui.home.refundLine')}</Text>
      ) : null}
    </View>
  );

  const surface = { backgroundColor: colors.surface, borderColor: colors.line2 };

  if (unfinished) {
    const onOpen = () => pushOnce(purchaseHref(row.id));
    const onDelete = () => {
      const stepId = abandon(row, 'deleted');
      showToast({ kind: 'destructive', text: { key: 'decide.delete.toastCheck', params: { name: item } }, stepId });
      getAnalytics().track('check_abandoned', {});
    };
    return (
      <View style={[styles.row, surface]}>
        <DeletableRow
          name={item}
          accessibilityLabel={a11y}
          onOpen={onOpen}
          menu={[{ key: 'open', label: t('decide.delete.menuOpen'), onSelect: onOpen }]}
          confirm={{ title: t('decide.v3.ui.home.deleteCheckTitle'), body: t('decide.v3.ui.home.deleteCheckBody') }}
          onDelete={onDelete}
        >
          <View style={styles.pad}>{body}</View>
        </DeletableRow>
      </View>
    );
  }

  const onOpenAnswer = () => pushOnce(answerHref(row.id));
  const onDeletePlan = () => del.remove(row);
  return (
    <View style={[styles.row, surface]}>
      <DeletableRow
        name={item}
        accessibilityLabel={a11y}
        onOpen={onOpenAnswer}
        menu={[{ key: 'open', label: t('decide.delete.menuOpen'), onSelect: onOpenAnswer }]}
        confirm={{ title: t('decide.v3.ui.home.deletePlanTitle'), body: t('decide.v3.ui.home.deletePlanBody') }}
        onDelete={onDeletePlan}
      >
        <View style={[styles.pad, styles.pressRow]}>
          {body}
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ color: colors.inkMuted }}>
            {'›'}
          </Text>
        </View>
      </DeletableRow>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: ROW_RADIUS, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minHeight: ROW_MIN },
  pad: { paddingHorizontal: space.cardPad, paddingVertical: PAD_V, justifyContent: 'center' },
  pressRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  text: { flex: 1, gap: 4, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapSm },
  item: { flexShrink: 1 },
  price: { flexShrink: 0 },
  changed: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: space.gapMd, paddingVertical: 4 },
});
