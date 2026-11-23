// 10-24 (UI-SPEC 4b): one archived month on the Archive list: '{Month YYYY}', 'In {$} · Out {$}', trailing arrow. The figures
// come from engine/activity monthTotals over the month's recorded rows, the same maths Activity uses (the same row mapping
// as the Activity view model's totals), so they match Activity exactly.
import React, { useMemo } from 'react';
import { monthTotals } from '@/engine/activity';
import { isSettlement } from '@/engine/household/settlement';
import { money } from '@/engine/money';
import { useMonthView } from '@/data/queries/activity';
import { paidOutText } from '@/features/record/activity/monthFigureInputs';
import { useRecordContext } from '@/features/record/useRecordContext';
import { i18n, useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { monthLabel } from './monthLabel';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface ArchiveMonthRowProps {
  month: string;
  onPress: (month: string) => void;
}

export function ArchiveMonthRow({ month, onPress }: ArchiveMonthRowProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const view = useMonthView(rc, month);
  const totals = useMemo(
    () =>
      monthTotals(
        view.rows.map((r) => ({
          amountHome: r.amountHome,
          status: r.status,
          isTransfer: r.transfer_id !== null,
          isRefund: r.is_refund,
          ratePending: r.rate_pending,
          isSettlement: isSettlement({ isSettlement: r.is_settlement === true }),
        })),
        [],
      ),
    [view.rows],
  );
  const fmt = (minor: number): string => formatter.formatMoney(money(minor, rc.homeCurrency));
  const label = monthLabel(month, i18n.language || 'en');
  const sub = view.isLoading ? undefined : t('system.archive.rowTotals', { income: fmt(totals.paidIn), spend: paidOutText(totals.paidOut, fmt) });
  return (
    <Row
      label={label}
      sublabel={sub}
      emphasis
      chevron
      onPress={() => onPress(month)}
      accessibilityLabel={sub === undefined ? label : `${label}. ${sub}`}
    />
  );
}
