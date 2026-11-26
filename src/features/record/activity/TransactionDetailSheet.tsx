// Read-only transaction detail sheet (ACT-13, CONTEXT D-01, UI-SPEC section 5). It never
// writes: every button hands back to the screen, which owns the mutations and the
// confirm / scope prompts.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAccounts } from '@/data/queries/accounts';
import type { ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useLinkedFees } from '@/data/queries/transactions';
import { flowOf, rowTag } from '@/engine/activity';
import { expandParts } from '@/engine/parts';
import { monthOf } from '@/engine/time';
import { toParts } from '@/db/categoryParts';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { CategorySplitSheet } from '@/features/record/split/CategorySplitSheet';
import { ReceiptSheet } from '@/features/record/receipt/ReceiptSheet';
import { ReceiptStrip } from '@/features/record/receipt/ReceiptStrip';
import { ReceiptViewer } from '@/features/record/receipt/ReceiptViewer';
import { ScanSheet } from '@/features/record/receipt/ScanSheet';
import { copiesForReading, discardFiles, type ReadingImage } from '@/features/record/receipt/scanFiles';
import { useReceiptActions, type ReceiptActions } from '@/features/record/receipt/useReceiptActions';
import { WarningCard } from '@/ui/WarningCard';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { currencyExponent, knownCurrencyExponent, money } from '@/engine/money';
import { impliedRate } from '@/engine/statement';
import { categoryName } from '@/features/record/categoryName';
import { useWriteGate } from '@/features/plans/useWriteGate';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { TransactionRow } from '@/db/rows';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CategorySwatchKey } from '@/theme/tokens';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { DetailRow, DetailSheet } from '@/ui/DetailSheet';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { RateAttribution } from '@/ui/RateAttribution';
import { detailRowsFor, statusActionFor } from './detailRows';
import { kindNameKey } from './IncomeTagChip';
import { PartsView } from './PartsView';
import { LinkRow, RefundOfRow, RefundsGroup, type RefundDetailCallbacks } from './RefundDetailRows';
import { formatStatementMoney } from './statementMoney';

type SharedModule = typeof import('@/features/household/sharing/SharedLineDetail');

/** 08-19: loaded the first time a shared line is opened, so personal lines never touch the household data layer. */
function sharedModule(): SharedModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load (see above)
  return require('@/features/household/sharing/SharedLineDetail') as SharedModule;
}

function SharedGate({ row, action, children }: { row: TransactionRow; action: 'edit' | 'delete'; children: React.ReactNode }) {
  if (row.is_shared !== true) return <>{children}</>;
  const { SharedActionGate } = sharedModule();
  return (
    <SharedActionGate row={row} action={action}>
      {children}
    </SharedActionGate>
  );
}

function SharedDetail({ row, onMakeChangeAgain }: { row: TransactionRow; onMakeChangeAgain: () => void }) {
  const { SharedLineDetail } = sharedModule();
  return <SharedLineDetail row={row} onMakeChangeAgain={onMakeChangeAgain} />;
}

export interface TransactionDetailSheetProps {
  row: ActivityRowView | null;
  visible: boolean;
  today: string;
  onDismiss: () => void;
  onStatus: (next: 'paid' | 'pending') => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  /** 05.2-33: opens the refund picker / income tag sheet / another row. Without it (or with the Decide switch off) the rows do not exist. */
  refundCallbacks?: RefundDetailCallbacks;
}

/**
 * 10.1-23 (RCP-01, D-09; UI-SPEC section 3): with receipts on (level 2) and a non-transfer line, the receipts of the line are
 * read (stored ones and those still on the phone) and the body gains the Receipt row, the thumbnail strip, the Receipt sheet
 * and the viewer. Below level 2 nothing about receipts is read or drawn.
 */
export function TransactionDetailSheet(props: TransactionDetailSheetProps) {
  const receiptsOn = useFeatureAccess('receipts').visible;
  const ctx = useRecordContext();
  const row = props.row;
  if (!receiptsOn || row === null || row.transfer_id !== null || ctx.householdId === null) return <DetailBody {...props} receipts={null} />;
  return <DetailWithReceipts {...props} householdId={ctx.householdId} lineId={row.id} />;
}

function DetailWithReceipts({ householdId, lineId, ...props }: TransactionDetailSheetProps & { householdId: string; lineId: string }) {
  const receipts = useReceiptActions(householdId, lineId);
  return <DetailBody {...props} receipts={receipts} />;
}

function DetailBody({
  row,
  visible,
  today,
  onDismiss,
  onStatus,
  onEdit,
  onClone,
  onDelete,
  refundCallbacks,
  receipts,
}: TransactionDetailSheetProps & { receipts: ReceiptActions | null }) {
  const t = useT();
  const gate = useWriteGate('editRecord'); // 09-17 (TIER-09): reading stays; changing a record names the lock
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const formatter = useMoneyFormatter(ctx.showCents);
  const accounts = useAccounts(ctx.householdId ?? undefined);
  const categories = useCategoryLookup(ctx.userId ?? undefined);
  const series = useRecurringSeries(ctx.householdId ?? undefined);
  const linkedFees = useLinkedFees(ctx.householdId, row);
  const { v3 } = useDecideAccess();
  const splitOn = useFeatureAccess('splitLine').visible;
  // 10.1-20: the Categories row expands in place; the split sheet opens from Edit split or Place it (highlightGap).
  const [partsOpen, setPartsOpen] = useState(false);
  const [splitSheet, setSplitSheet] = useState<{ highlightGap: boolean } | null>(null);
  // 10.1-23: the Receipt row opens the Receipt sheet; with files the detail shows the thumbnail strip and a thumbnail opens the viewer.
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);
  const [viewerAt, setViewerAt] = useState<string | null>(null);
  // 10.1-25 (D-13, T-10.1-25-01): "Read this receipt" copies the stored pages into the cache, closes the Receipt sheet and opens
  // the scan sheet for this line. The downloaded copies are deleted when the scan closes, or when the detail goes away.
  const [reading, setReading] = useState<ReadingImage[] | null>(null);
  const readingTemps = useRef<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      discardFiles(readingTemps.current);
      readingTemps.current = [];
    };
  }, []);
  const readReceipt = (pages: ReadingImage[]) => {
    setReceiptSheetOpen(false);
    void copiesForReading(pages).then((copies) => {
      if (!alive.current || copies.images.length === 0) {
        discardFiles(copies.temps);
        return;
      }
      discardFiles(readingTemps.current);
      readingTemps.current = copies.temps;
      // The Receipt sheet closes first; the scan opens on the next frame (02.3 Pattern 4).
      requestAnimationFrame(() => {
        if (alive.current) setReading(copies.images);
      });
    });
  };
  const endReading = () => {
    discardFiles(readingTemps.current);
    readingTemps.current = [];
    setReading(null);
  };

  if (row === null) return null;
  const parts = splitOn && row.transfer_id === null ? toParts(row.category_parts ?? null) : null;
  const isSplit = parts !== null && parts.length >= 2;
  const openSplit = (highlightGap: boolean) => gate.run(() => setSplitSheet({ highlightGap }));

  const accountName = (id: string | null) => (id === null ? null : (accounts.data?.find((a) => a.id === id)?.name ?? null));
  const isTransfer = row.transfer_id !== null;
  const category = isTransfer
    ? categories.all.find((c) => c.id === categories.transferCategoryId)
    : row.category_id !== null
      ? categories.byId.get(row.category_id)
      : undefined;
  const categoryLabel = category ? categoryName(category, t) : null;
  const seriesRow = row.recurring_series_id !== null ? series.data?.find((s) => s.id === row.recurring_series_id) : undefined;
  const repeatsLabel = seriesRow ? t(`record.repeats.${seriesRow.freq}`) : null;
  const paymentTypeLabel = row.payment_type !== null ? t(`record.paymentType.${row.payment_type}`) : null;
  const name = row.name ?? categoryLabel ?? '';

  const specs = detailRowsFor({
    row,
    today,
    accountName: accountName(row.account_id),
    counterpartName: accountName(row.counterpartAccountId),
    categoryName: categoryLabel,
    paymentTypeLabel,
    repeatsLabel,
    decideV3: v3 && refundCallbacks !== undefined,
    parts,
    splitOn,
    receiptState:
      receipts === null
        ? null
        : { count: receipts.groups.length, waiting: receipts.groups.some((g) => g.state !== 'stored') },
    incomeTypeLabel: (row.income_kind ?? seriesRow?.income_kind) ? t(kindNameKey((row.income_kind ?? seriesRow?.income_kind)!)) : null,
    t: (key, params) => String(t(key as never, params as never)),
  });

  const tag = rowTag(row, today);
  const flow = flowOf(row);
  const amountText = formatter.formatMoney(money(row.original_amount, row.original_currency));
  const amountShown = !isTransfer && row.original_amount > 0 ? `+${amountText}` : amountText;
  const amountColor = isTransfer ? colors.inkDim : flow === 'in' || tag.refund ? colors.accent : colors.ink;
  const swatchKey: CategorySwatchKey = (category?.color_key as CategorySwatchKey | undefined) ?? 'slate';

  const foreign = !isTransfer && row.original_currency !== row.home_currency;
  const fxNote =
    foreign && row.rate !== null
      ? t('activity.detail.fxNote', {
          native: amountText,
          unit: `1 ${row.original_currency}`,
          rate: `${row.rate} ${row.home_currency}`,
        })
      : null;

  // D-33 / D-32: the bank's own conversion, from stored figures only. No market rate is read or
  // compared here (D-31).
  const hasStatement = !isTransfer && row.stmt_orig_amount != null && row.stmt_orig_currency != null;
  let statementLine: string | null = null;
  if (hasStatement) {
    const origMag = Math.abs(row.stmt_orig_amount as number);
    const original = formatStatementMoney(formatter, origMag, row.stmt_orig_currency as string);
    const chargedMag = Math.abs(row.original_amount);
    const charged = formatter.formatMoney(money(chargedMag, row.original_currency));
    // Review IN-01: the account currency is always one the app holds; the statement's code gets an
    // implied rate only when it is a currency the app knows, never a guessed scale.
    const chargedExp = knownCurrencyExponent(row.original_currency) ?? currencyExponent(row.original_currency);
    const foreignExp = knownCurrencyExponent(row.stmt_orig_currency as string);
    statementLine =
      chargedExp === null || foreignExp === null
        ? t('activity.detail.statementConversionNoRate', { original, charged })
        : t('activity.detail.statementConversion', {
            original,
            charged,
            rate: impliedRate({ magnitude: chargedMag, exponent: chargedExp }, { magnitude: origMag, exponent: foreignExp }),
          });
  }
  const feeLines = hasStatement
    ? (linkedFees.data ?? []).map((fee) => ({
        id: fee.id,
        text: t('activity.detail.statementFee', { fee: formatter.formatMoney(money(Math.abs(fee.original_amount), fee.original_currency)) }),
      }))
    : [];

  const action = statusActionFor(row);

  // D-03: a split line whose parts no longer add up to its total (the total was edited) says so and offers to place the rest.
  const gapRow = isSplit ? expandParts({ id: row.id, amount: row.original_amount, categoryId: row.category_id, parts }).find((r) => r.isGap) : undefined;
  const fmtMinor = (minor: number) => formatter.formatMoney(money(minor, row.original_currency));
  const partsSum = isSplit ? parts.reduce((sum, p) => sum + Math.abs(p.amount), 0) : 0;
  const leftToPlace = Math.abs(row.original_amount) - partsSum;
  const gapCard =
    gapRow !== undefined && leftToPlace > 0 ? (
      <View style={styles.gapCard} testID="parts-gap-card">
        <WarningCard
          tone="soft"
          title={t('split.gap.badge')}
          value={fmtMinor(leftToPlace)}
          body={[
            t('split.gap.info', {
              parts: fmtMinor(partsSum),
              total: fmtMinor(Math.abs(row.original_amount)),
              amount: fmtMinor(leftToPlace),
            }),
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('split.gap.place')}
          hitSlop={LINK_HIT_SLOP}
          onPress={() => openSplit(true)}
          style={styles.place}
        >
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.accent }}>{t('split.gap.place')}</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <DetailSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel={name}
      leading={<CategoryGlyph colorKey={swatchKey} icon={iconForCategory(category)} letter={(name.trim().charAt(0) || '?').toUpperCase()} />}
      title={name}
      subtitle={[categoryLabel, formatter.formatDate(row.local_date, 'short')].filter((p) => p !== null && p !== '').join(' · ')}
      trailing={<Text style={{ ...textRole(pairing, 'body'), color: amountColor }}>{amountShown}</Text>}
      note={
        statementLine !== null || fxNote !== null ? (
          <View>
            {statementLine !== null ? (
              <View style={styles.fx}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{statementLine}</Text>
                {feeLines.map((fee) => (
                  <Text key={fee.id} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{fee.text}</Text>
                ))}
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.detail.statementConversionNote')}</Text>
              </View>
            ) : null}
            {fxNote !== null ? (
              <View style={styles.fx}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{fxNote}</Text>
                <RateAttribution rateDate={row.rate_date} rateSource={row.rate_source} ratePending={row.rate_pending} />
              </View>
            ) : null}
          </View>
        ) : undefined
      }
      actions={
        <>
          {action !== null ? <Pill label={t(`activity.detail.${action.key}`)} variant="primary" locked={gate.gated} onPress={() => gate.run(() => onStatus(action.next))} /> : null}
          <SharedGate row={row} action="edit">
            <Pill label={t('activity.detail.edit')} variant="secondary" locked={gate.gated} onPress={() => gate.run(onEdit)} />
          </SharedGate>
          {!isTransfer ? <Pill label={t('activity.detail.clone')} variant="secondary" locked={gate.gated} onPress={() => gate.run(onClone)} /> : null}
          <SharedGate row={row} action="delete">
            <Pill label={t('activity.detail.delete')} variant="danger" locked={gate.gated} onPress={() => gate.run(onDelete)} />
          </SharedGate>
        </>
      }
    >
      {gapCard}
      {row.is_shared === true ? <SharedDetail row={row} onMakeChangeAgain={onEdit} /> : null}
      {specs.map((spec) => {
        const label = t(spec.labelKey as never);
        if (spec.action === 'parts' && isSplit) {
          return (
            <View key={spec.key}>
              <LinkRow
                label={label}
                value={spec.value}
                a11y={`${label}, ${spec.value ?? ''}`}
                onPress={() => setPartsOpen((o) => !o)}
              />
              {partsOpen ? (
                <PartsView line={row} parts={parts} categories={categories} formatter={formatter} onEdit={() => openSplit(false)} />
              ) : null}
            </View>
          );
        }
        if (spec.action === 'receipt' && receipts !== null) {
          return (
            <View key={spec.key}>
              <LinkRow label={label} value={spec.value} a11y={`${label}, ${spec.value ?? ''}`} onPress={() => gate.run(() => setReceiptSheetOpen(true))} />
              {receipts.groups.length > 0 ? (
                <View style={styles.strip} testID="detail-receipt-strip">
                  <ReceiptStrip
                    groups={receipts.groups}
                    showCents={ctx.showCents}
                    onOpen={(groupId) => {
                      // A failed upload's Try again / Remove live in the Receipt sheet; everything else opens the viewer.
                      if (receipts.groups.find((g) => g.groupId === groupId)?.state === 'failed') gate.run(() => setReceiptSheetOpen(true));
                      else setViewerAt(groupId);
                    }}
                  />
                </View>
              ) : null}
            </View>
          );
        }
        if (spec.action !== undefined && refundCallbacks !== undefined) {
          if (spec.action === 'refundOf') {
            return <RefundOfRow key={spec.key} row={row} formatter={formatter} callbacks={refundCallbacks} label={label} />;
          }
          if (spec.action === 'refundsGroup') {
            return <RefundsGroup key={spec.key} row={row} formatter={formatter} callbacks={refundCallbacks} />;
          }
          return (
            <LinkRow
              key={spec.key}
              label={label}
              value={spec.value}
              a11y={`${label}, ${spec.value ?? ''}`}
              onPress={() => refundCallbacks.onIncomeType(row)}
            />
          );
        }
        return <DetailRow key={spec.key} label={label} value={spec.value} tone={spec.tone} emptyText={t('activity.detail.empty')} />;
      })}
      {receipts !== null && ctx.householdId !== null ? (
        <>
          <ReceiptSheet visible={receiptSheetOpen} line={row} householdId={ctx.householdId} onClose={() => setReceiptSheetOpen(false)} onRead={readReceipt} />
          <ScanSheet
            visible={reading !== null}
            mode="existing"
            line={row}
            householdId={ctx.householdId}
            images={reading ?? []}
            onClose={endReading}
            onDone={endReading}
            onRetake={() => {
              endReading();
              requestAnimationFrame(() => setReceiptSheetOpen(true));
            }}
          />
          <ReceiptViewer
            visible={viewerAt !== null}
            groups={receipts.groups}
            startGroupId={viewerAt ?? undefined}
            onClose={() => setViewerAt(null)}
            onRemove={(groupId) => gate.run(() => void receipts.removeGroup(groupId))}
          />
        </>
      ) : null}
      {isSplit && ctx.householdId !== null ? (
        <CategorySplitSheet
          visible={splitSheet !== null}
          line={row}
          householdId={ctx.householdId}
          month={monthOf(row.local_date)}
          currency={row.original_currency}
          highlightGap={splitSheet?.highlightGap ?? false}
          onClose={() => setSplitSheet(null)}
        />
      ) : null}
    </DetailSheet>
  );
}

const styles = StyleSheet.create({
  fx: { gap: 2, paddingBottom: space.gapMd },
  gapCard: { gap: space.gapSm, paddingBottom: space.gapMd },
  strip: { paddingBottom: space.gapMd },
  place: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
