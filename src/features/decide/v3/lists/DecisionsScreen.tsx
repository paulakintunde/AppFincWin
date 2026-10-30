/**
 * 05.3-36 (DSV-03, D-13): Past decisions under v3. Bought and passed checks, newest first, each opening its answer.
 * Prices come from the live evaluation; nothing here reads the old snapshot or writes a stored answer.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDecideLinks } from '@/data/queries/decide';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { writtenCount } from '../../past/useDeleteDecision';
import { DeletableRow } from '../../ui/DeletableRow';
import { refundHint } from '../model/refundHint';
import { answerHref } from '../nav/hrefs';
import { V3NotFound } from '../nav/V3NotFound';
import { V3Skeleton } from '../nav/V3Skeleton';
import { useV3Format } from '../shared/useV3Format';
import { useCheckAgain, useDeleteRow } from './useRowActions';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const K = 'decide.v3.ui.decisions.';
const ROW_RADIUS = 16;
const ROW_MIN = 60;
const PAD_V = 10;
const PRICE_FIT = 0.8;

function stamp(r: DecideCheckRow): string {
  return r.decided_at ?? r.updated_at;
}

export function DecisionsScreen(): React.JSX.Element {
  const { status, rows, byId, withoutRefunds } = useChecksV3();
  const t = useT() as unknown as Translate;
  if (status === 'loading') return <V3Skeleton />;
  if (status === 'error') return <V3NotFound />;
  return <DecisionsBody rows={rows} byId={byId} withoutRefunds={withoutRefunds} title={t(`${K}title`)} />;
}

interface BodyProps {
  rows: readonly DecideCheckRow[];
  byId: ReturnType<typeof useChecksV3>['byId'];
  withoutRefunds: ReturnType<typeof useChecksV3>['withoutRefunds'];
  title: string;
}

function DecisionsBody({ rows, byId, withoutRefunds, title }: BodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const decided = useMemo(
    () => rows.filter((r) => r.status === 'bought' || r.status === 'passed').slice().sort((a, b) => stamp(b).localeCompare(stamp(a))),
    [rows],
  );

  const rc = useRecordContext();
  const ids = useMemo(() => decided.map((r) => r.id), [decided]);
  const links = useDecideLinks(rc.userId ?? undefined, rc.householdId ?? undefined, ids).data;
  const written = (id: string) => writtenCount((links ?? []).filter((l) => l.check_id === id));

  return (
    <DetailScreen title={title}>
      {decided.length === 0 ? (
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t(`${K}empty`)}</Text>
      ) : (
        <View style={styles.list}>
          {decided.map((r) => (
            <DecisionRow key={r.id} row={r} live={byId.get(r.id)} without={withoutRefunds.get(r.id)} written={written(r.id)} />
          ))}
        </View>
      )}
    </DetailScreen>
  );
}

function DecisionRow({
  row,
  live,
  without,
  written,
}: {
  row: DecideCheckRow;
  live: Evaluation | undefined;
  without: Evaluation | undefined;
  written: number;
}): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const del = useDeleteRow();
  const checkAgain = useCheckAgain();

  const item = row.name === '' ? t('decide.quick.unnamed') : row.name;
  const whole = live?.purchase?.whole;
  const price = whole === undefined ? null : f.money(Number(whole));
  const priceA11y = whole === undefined ? '' : f.moneyA11y(Number(whole));
  const date = f.date(stamp(row).slice(0, 10));
  const bought = row.status === 'bought';
  const lines = bought
    ? [t(`${K}bought`, { date })]
    : [...(price !== null ? [t(`${K}kept`, { price })] : []), t(`${K}passed`, { date })];
  const refund = refundHint({ stored: row.answer_v3, live: live?.result, without: without?.result });
  const a11y = t(`${K}rowA11y`, { item, price: priceA11y, status: lines.join('. ') }).replace(/, \./g, '.');

  const onOpen = () => pushOnce(answerHref(row.id));
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <DeletableRow
        name={item}
        accessibilityLabel={a11y}
        onOpen={onOpen}
        menu={[
          { key: 'open', label: t('decide.delete.menuOpen'), onSelect: onOpen },
          { key: 'again', label: t(`${K}checkAgain`), onSelect: () => checkAgain(row) },
        ]}
        confirm={del.confirmCopy(row, written)}
        onDelete={() => del.remove(row)}
      >
        <View style={styles.pad}>
          <View style={styles.text}>
            <View style={styles.titleRow}>
              <Text style={[{ ...textRole(pairing, 'body'), color: colors.ink }, styles.item]}>{item}</Text>
              {price !== null && bought ? (
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
            {lines.map((line) => (
              <Text key={line} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
                {line}
              </Text>
            ))}
            {refund ? (
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{t('decide.v3.ui.home.refundLine')}</Text>
            ) : null}
          </View>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ color: colors.inkFaint }}>
            {'›'}
          </Text>
        </View>
      </DeletableRow>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  row: { borderRadius: ROW_RADIUS, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minHeight: ROW_MIN },
  pad: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, paddingHorizontal: space.cardPad, paddingVertical: PAD_V, minHeight: ROW_MIN },
  text: { flex: 1, gap: 4, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapSm },
  item: { flexShrink: 1 },
  price: { flexShrink: 0 },
});
