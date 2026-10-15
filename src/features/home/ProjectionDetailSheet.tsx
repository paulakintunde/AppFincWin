// HOME-03 / D-34: read-only detail for a projected recurring bill. It has no actions: a projected
// bill cannot be paid until the series records it.
import React from 'react';
import type { ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { DetailRow, DetailSheet } from '@/ui/DetailSheet';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface ProjectionDetailSheetProps {
  projection: ProjectionView | null;
  visible: boolean;
  onDismiss: () => void;
  formatter: MoneyFormatter;
  homeCurrency: string;
  categories: CategoryLookup;
  accountName: (id: string) => string;
}

export function ProjectionDetailSheet({
  projection,
  visible,
  onDismiss,
  formatter,
  homeCurrency,
  categories,
  accountName,
}: ProjectionDetailSheetProps) {
  const t = useT();
  if (projection === null) return null;
  const category = projection.categoryId !== null ? categories.byId.get(projection.categoryId) : undefined;
  const native = formatter.formatMoney(money(projection.amount, projection.currency));
  const amountText =
    projection.currency !== homeCurrency && projection.amountHome !== null
      ? `${native} · ${formatter.formatMoney(money(projection.amountHome, homeCurrency))}`
      : native;
  const empty = t('activity.detail.empty');
  return (
    <DetailSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel={projection.name}
      title={projection.name}
      subtitle={t('record.recurring.projected')}
    >
      <DetailRow label={t('record.sheet.field.amount')} value={amountText} emptyText={empty} />
      <DetailRow label={t('record.sheet.field.date')} value={formatter.formatDate(projection.date, 'medium')} emptyText={empty} />
      <DetailRow
        label={t('record.sheet.field.category')}
        value={category ? categoryName(category, t) : null}
        emptyText={empty}
      />
      <DetailRow
        label={t('record.sheet.field.account')}
        value={accountName(projection.accountId) || null}
        emptyText={empty}
      />
    </DetailSheet>
  );
}
