// The review step (REC-15, REC-16, D-14, D-46, D-47, D-48): the reconciliation result as a plain
// sentence, every line with its tick, duplicate and can't-verify tags and issues, editable
// categories, the statement's limit offer, and the commit action.
//
// UI-SPEC colour rule: nothing here is colour-coded. Reconciliation, "Can't verify" and
// "Possible duplicate" are words on a fill1 chip, and a negative balance is never shown as a
// problem. The accent belongs to the commit action alone.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { CategoryPicker } from '@/features/record/entry/pickers/CategoryPicker';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { Actions, Heading, SuggestionCard, T, Tag, useDynamicT, useFormatAmount } from './importUi';
import { DisclosureRow } from './ReconcileChoice';
import { useExtrasDetail } from './ExtrasDetail';
import { buildReviewItems, EXTRAS_PAGE, type ReviewItem } from './reconcileView';
import type { DraftRowIssue } from '@/engine/statement';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

const ISSUE_KEY: Partial<
  Record<
    DraftRowIssue,
    | 'badDate'
    | 'badAmount'
    | 'zeroAmount'
    | 'emptyDescription'
    | 'unknownCurrency'
    | 'amountTooLarge'
    | 'conflictingMarkers'
    | 'badBalance'
    | 'pdfWrappedDescription'
    | 'pdfNoDate'
    | 'pdfAmbiguousColumn'
    | 'pdfAmbiguousDate'
  >
> = {
  'bad-date': 'badDate',
  'bad-amount': 'badAmount',
  'zero-amount': 'zeroAmount',
  'empty-description': 'emptyDescription',
  'unknown-currency': 'unknownCurrency',
  'amount-too-large': 'amountTooLarge',
  'conflicting-markers': 'conflictingMarkers',
  'bad-balance': 'badBalance',
  // Review LO-06: the PDF uncertainty codes (D-23) say what the reader was unsure of.
  'pdf-wrapped-description': 'pdfWrappedDescription',
  'pdf-no-date': 'pdfNoDate',
  'pdf-ambiguous-column': 'pdfAmbiguousColumn',
  'pdf-ambiguous-date': 'pdfAmbiguousDate',
};

function Reconciliation({ file }: { file: string | null }) {
  const t = useT();
  switch (file) {
    case 'all-verified':
      return <T>{t('importCsv.reconcile.allVerified')}</T>;
    case 'partial':
      return (
        <View>
          <T>{t('importCsv.reconcile.partialHeading')}</T>
          <T tone="inkMuted">{t('importCsv.reconcile.partialBody')}</T>
        </View>
      );
    case 'ends-only-mismatch':
      return (
        <View>
          <T>{t('importCsv.reconcile.endsOnlyHeading')}</T>
          <T tone="inkMuted">{t('importCsv.reconcile.endsOnlyBody')}</T>
        </View>
      );
    case 'none-in-file':
      return <T>{t('importCsv.reconcile.noneInFile')}</T>;
    default:
      return null;
  }
}

export function ReviewStep({ state, onClose }: { state: ImportState; onClose?: () => void }) {
  const t = useT();
  const tx = useDynamicT();
  const fmt = useFormatAmount();
  const rc = useRecordContext();
  const { colors } = useTheme();
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data ?? [];
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [recordedOpen, setRecordedOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasShown, setExtrasShown] = useState(EXTRAS_PAGE);
  const accountName = (id: string): string => accounts.find((a) => a.id === id)?.name ?? '';
  const extrasDetail = useExtrasDetail(state.extraRows, accountName);

  const preview = state.preview;
  const account = accounts.find((a) => a.id === state.accountId) ?? null;

  const back = (
    <Actions>
      <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
      <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
    </Actions>
  );
  if (preview === null) return <View>{back}</View>;

  const rows = preview.rows;
  const mode = state.mode ?? 'new';
  const reconcile = mode === 'reconcile';
  const missingCount = rows.filter((r) => r.duplicate === null).length;
  const items = buildReviewItems({ rows, mode, recordedOpen, extrasOpen, extrasShown, extras: state.extras });
  const extrasCurrency = account?.currency ?? rc.homeCurrency;
  const nothingToAdd = reconcile && missingCount === 0;
  const included = state.counts.included;
  const checkedLabel = t('importCsv.pdf.checkedRows', { count: state.reviewGate.count });
  const gated = state.reviewGate.required && !state.rowsChecked;
  const hasMatches = state.transferRows.length > 0 || state.payMatchRows.length > 0;
  const ratesPending = rows.some((r) => {
    const s = state.rowState(r.index);
    return s.included && r.converted.currency !== rc.homeCurrency && r.converted.localDate !== null && r.converted.localDate < rc.today;
  });

  const categoryLabel = (id: string | null): string => {
    const category = id === null ? undefined : categories.byId.get(id);
    return category === undefined ? t('record.sheet.uncategorised') : categoryName(category, t);
  };

  const header = (
    <View style={styles.header}>
      <Heading>{reconcile ? (missingCount === 0 ? t('importCsv.missing.none') : t('importCsv.missing.heading', { count: missingCount })) : t('importCsv.reviewHeading', { count: rows.length })}</Heading>
      <Reconciliation file={state.reconcile?.file ?? null} />
      {ratesPending ? <T tone="inkMuted">{t('importCsv.ratesPending')}</T> : null}
      {state.limitOffer !== null && account !== null ? (
        <SuggestionCard>
          <T>
            {t('importCsv.limit.offer', {
              limit: fmt.amount(state.limitOffer.amount, account.currency),
              account: account.name,
            })}
          </T>
          <Actions>
            <Pill label={t('importCsv.limit.add')} variant="secondary" disabled={state.limitAccepted} onPress={() => state.acceptLimit(true)} />
            <Pill label={t('importCsv.limit.skip')} variant="secondary" onPress={() => state.acceptLimit(false)} />
          </Actions>
        </SuggestionCard>
      ) : null}
    </View>
  );

  const footer = (
    <View>
      {state.commitProblem === 'failed' ? <T tone="inkMuted">{t('importCsv.commitFailed')}</T> : null}
      {state.reviewGate.required ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={checkedLabel}
          accessibilityState={{ checked: state.rowsChecked }}
          onPress={() => state.setRowsChecked(!state.rowsChecked)}
          style={styles.gateRow}
        >
          <View style={styles.tickHit}>
            <View
              style={[
                styles.tick,
                { borderColor: state.rowsChecked ? colors.ink : colors.inkFaint, backgroundColor: state.rowsChecked ? colors.ink : 'transparent' },
              ]}
            >
              {state.rowsChecked ? <View style={[styles.tickDot, { backgroundColor: colors.surface }]} /> : null}
            </View>
          </View>
          <View style={styles.text}>
            <T>{checkedLabel}</T>
          </View>
        </Pressable>
      ) : null}
      <Actions>
        {hasMatches ? (
          <Pill label={t('importCsv.continue')} variant="secondary" disabled={included === 0 || gated} onPress={() => void state.continue()} />
        ) : nothingToAdd && included === 0 ? (
          <Pill label={t('importCsv.missing.close')} variant="secondary" onPress={() => (onClose ?? state.cancel)()} />
        ) : (
          <Pill
            label={reconcile ? t('importCsv.missing.commit', { count: included }) : t('importCsv.commit', { count: included })}
            variant="primary"
            disabled={included === 0 || gated}
            onPress={state.commit}
          />
        )}
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );

  const renderRow = ({ item: entry }: { item: Extract<ReviewItem, { kind: 'row' }> }) => {
    const item = entry.row;
    const s = state.rowState(item.index);
    const nearId = state.nearByIndex.get(item.index);
    const near = nearId === undefined ? undefined : state.extras.find((e) => e.id === nearId);
    const c = item.converted;
    const name = c.description;
    const amountText = c.amount === null ? '' : fmt.amount(c.amount, c.currency);
    const label = categoryLabel(s.categoryId);
    return (
      <View style={[styles.row, { borderBottomColor: colors.line1 }]}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={t('a11y.selectRow', { name })}
            accessibilityState={{ checked: s.included, disabled: s.locked }}
            disabled={s.locked}
            onPress={() => state.toggleRow(item.index)}
            style={styles.tickHit}
          >
            <View
              style={[
                styles.tick,
                { borderColor: s.included ? colors.ink : colors.inkFaint, backgroundColor: s.included ? colors.ink : 'transparent' },
              ]}
            >
              {s.included ? <View style={[styles.tickDot, { backgroundColor: colors.surface }]} /> : null}
            </View>
          </Pressable>
          <View style={styles.text}>
            <T numberOfLines={1}>{name}</T>
            <T role="label" tone="inkMuted" numberOfLines={1}>
              {c.localDate === null ? '' : fmt.date(c.localDate)}
            </T>
          </View>
          <T>{amountText}</T>
        </View>
        <View style={styles.below}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('importCsv.categoryA11y', { name })}
            accessibilityValue={{ text: label }}
            onPress={() => setPickerFor(item.index)}
            style={[styles.chip, { backgroundColor: colors.fill1 }]}
          >
            <T role="label">{label}</T>
          </Pressable>
          {entry.tag === 'duplicate' ? <Tag label={t('importCsv.duplicate')} /> : null}
          {entry.tag === 'missing' ? <Tag label={t('importCsv.missing.tag')} /> : null}
          {entry.tag === 'recorded' ? <Tag label={t('importCsv.missing.recordedTag')} /> : null}
          {item.check === 'cannot-verify' ? (
            <Tag label={t('importCsv.reconcile.rowTag')} accessibilityLabel={t('importCsv.reconcile.rowTagA11y')} />
          ) : null}
          {c.issues.map((issue) =>
            issue === 'unknown-currency' || ISSUE_KEY[issue] !== undefined ? (
              <T key={issue} role="label" tone="inkMuted">
                {issue === 'unknown-currency' ? t('importCsv.issue.unknownCurrency', { code: c.currency }) : tx(`importCsv.issue.${ISSUE_KEY[issue]}`)}
              </T>
            ) : null
          )}
          {near !== undefined ? (
            <T role="label" tone="inkMuted">
              {t('importCsv.missing.nearMatch', { name: near.name ?? fmt.amount(near.amount, extrasCurrency), date: fmt.date(near.localDate) })}
            </T>
          ) : null}
        </View>
      </View>
    );
  };

  const renderExtra = (extra: Extract<ReviewItem, { kind: 'extra' }>['extra']) => {
    const name = extra.name ?? fmt.amount(extra.amount, extrasCurrency);
    const date = fmt.date(extra.localDate);
    const amountText = fmt.amount(extra.amount, extrasCurrency);
    const nearRow = extra.nearIndex === null ? undefined : rows.find((r) => r.index === extra.nearIndex);
    const nearDate = nearRow?.converted.localDate ?? null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${date}, ${amountText}`}
        onPress={() => extrasDetail.open(extra.id)}
        style={[styles.row, { borderBottomColor: colors.line1 }]}
      >
        <View style={styles.top}>
          <View style={styles.text}>
            <T numberOfLines={1}>{name}</T>
            <T role="label" tone="inkMuted" numberOfLines={1}>
              {date}
            </T>
            {nearDate !== null ? (
              <T role="label" tone="inkMuted">
                {t('importCsv.missing.nearMatchExtra', { date: fmt.date(nearDate) })}
              </T>
            ) : null}
          </View>
          <T>{amountText}</T>
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: ReviewItem }) => {
    switch (item.kind) {
      case 'row':
        return renderRow({ item });
      case 'recordedSummary':
        return (
          <View style={styles.disclosure}>
            <DisclosureRow label={t('importCsv.missing.recorded', { count: item.count })} expanded={item.open} onPress={() => setRecordedOpen(!recordedOpen)} />
          </View>
        );
      case 'extrasHeader':
        return (
          <View style={styles.disclosure}>
            <DisclosureRow label={t('importCsv.missing.extras', { count: item.count })} expanded={item.open} onPress={() => setExtrasOpen(!extrasOpen)} />
          </View>
        );
      case 'extrasNote':
        return <T tone="inkMuted">{t('importCsv.missing.extrasNote')}</T>;
      case 'extra':
        return renderExtra(item.extra);
      case 'showMore':
        return <Pill label={t('importCsv.missing.showMore', { count: item.count })} variant="secondary" onPress={() => setExtrasShown(extrasShown + EXTRAS_PAGE)} />;
    }
  };

  return (
    <View style={styles.flex}>
      <FlashList
        data={items}
        keyExtractor={(i) => i.key}
        getItemType={(i) => i.kind}
        extraData={state.rowState}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
      />
      {extrasDetail.element}
      <CategoryPicker
        visible={pickerFor !== null}
        categories={categories.active}
        selectedId={pickerFor === null ? null : state.rowState(pickerFor).categoryId}
        onSelect={(id) => {
          if (pickerFor !== null) state.setRowCategory(pickerFor, id);
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.gapSm, paddingBottom: space.gapMd },
  disclosure: { paddingTop: space.groupGap },
  row: { paddingVertical: space.gapSm, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  text: { flex: 1 },
  gateRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  tickHit: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickDot: { width: 8, height: 8, borderRadius: 4 },
  below: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapSm, paddingLeft: space.touchMin },
  chip: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill, justifyContent: 'center' },
});
