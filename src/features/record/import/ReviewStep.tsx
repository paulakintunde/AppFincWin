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
import type { PreviewRow } from './importPipeline';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

const ISSUE_KEY = {
  'bad-date': 'badDate',
  'bad-amount': 'badAmount',
  'zero-amount': 'zeroAmount',
  'empty-description': 'emptyDescription',
  'unknown-currency': 'unknownCurrency',
  'amount-too-large': 'amountTooLarge',
  'conflicting-markers': 'conflictingMarkers',
  'bad-balance': 'badBalance',
} as const;

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

export function ReviewStep({ state }: { state: ImportState }) {
  const t = useT();
  const tx = useDynamicT();
  const fmt = useFormatAmount();
  const rc = useRecordContext();
  const { colors } = useTheme();
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data ?? [];
  const [pickerFor, setPickerFor] = useState<number | null>(null);

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
  const included = state.counts.included;
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
      <Heading>{t('importCsv.reviewHeading', { count: rows.length })}</Heading>
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
      <Actions>
        {hasMatches ? (
          <Pill label={t('importCsv.continue')} variant="secondary" disabled={included === 0} onPress={() => void state.continue()} />
        ) : (
          <Pill label={t('importCsv.commit', { count: included })} variant="primary" disabled={included === 0} onPress={state.commit} />
        )}
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );

  const renderRow = ({ item }: { item: PreviewRow }) => {
    const s = state.rowState(item.index);
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
          {item.duplicate !== null ? <Tag label={t('importCsv.duplicate')} /> : null}
          {item.check === 'cannot-verify' ? (
            <Tag label={t('importCsv.reconcile.rowTag')} accessibilityLabel={t('importCsv.reconcile.rowTagA11y')} />
          ) : null}
          {c.issues.map((issue) => (
            <T key={issue} role="label" tone="inkMuted">
              {issue === 'unknown-currency' ? t('importCsv.issue.unknownCurrency', { code: c.currency }) : tx(`importCsv.issue.${ISSUE_KEY[issue]}`)}
            </T>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <FlashList
        data={rows}
        keyExtractor={(r) => String(r.index)}
        extraData={state.rowState}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
      />
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
  row: { paddingVertical: space.gapSm, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  text: { flex: 1 },
  tickHit: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickDot: { width: 8, height: 8, borderRadius: 4 },
  below: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapSm, paddingLeft: space.touchMin },
  chip: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill, justifyContent: 'center' },
});
