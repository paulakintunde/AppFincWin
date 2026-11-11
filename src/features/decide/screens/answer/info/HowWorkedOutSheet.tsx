// 06.1-35 (CO-D-57, D57): "How this was worked out". The month picture's lines in order (balance on the day, after bills due before
// payday, expected at month end), the unused overdraft on its own line, then where the figures came from. Figures are read from
// the engine's MonthPicture, never recomputed here.
import React from 'react';
import { useT } from '@/i18n';
import type { MonthPicture } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Block, Body, InfoSheet, SectionTitle } from './infoUi';

export interface WorkedSources {
  /** Activity records the pay and bills lines came from. */
  readonly activityFrom: string | null;
  readonly activityTo: string | null;
  /** Grow: the safety net's size in minor units, and whether it is locked. */
  readonly netSize: number | null;
  readonly netLocked: boolean;
  /** Decide: how many money rules are set. */
  readonly rulesCount: number;
}

export interface HowWorkedOutSheetProps {
  picture: MonthPicture;
  currency: string;
  sources: WorkedSources;
  recordsUpTo?: string | null;
  onClose: () => void;
}

export function HowWorkedOutSheet({ picture, currency, sources, recordsUpTo = null, onClose }: HowWorkedOutSheetProps) {
  const t = useT();
  const { formatMoney, formatDate } = useMoneyFormatter(true);
  const m = (minor: number): string => formatMoney(makeMoney(minor, currency));
  const range =
    sources.activityFrom !== null && sources.activityTo !== null
      ? t('decide.screens.answer.worked.range', { from: formatDate(sources.activityFrom), to: formatDate(sources.activityTo) })
      : '';
  const state = sources.netLocked ? t('decide.screens.answer.worked.locked') : t('decide.screens.answer.worked.unlocked');
  const net = sources.netSize === null ? state : `${m(sources.netSize)} · ${state}`;
  return (
    <InfoSheet title={t('decide.screens.answer.worked.title')} onClose={onClose}>
      <Body muted>{t('decide.screens.answer.worked.sub')}</Body>
      <Block>
        <LabelValueRow label={t('decide.screens.answer.worked.balanceOn', { date: formatDate(picture.asOf) })} value={m(picture.balanceOn)} />
        <LabelValueRow label={t('decide.screens.answer.worked.afterBills')} value={m(picture.afterBillsBeforePayday)} />
        <LabelValueRow label={t('decide.screens.answer.worked.expectedEnd')} value={m(picture.monthEnd)} />
        {picture.unusedOverdraft > 0 ? (
          <LabelValueRow label={t('decide.screens.answer.worked.unusedOverdraft')} sub={t('decide.screens.answer.worked.notCountedAbove')} value={m(picture.unusedOverdraft)} />
        ) : null}
      </Block>
      <Block>
        <SectionTitle>{t('decide.screens.answer.worked.sources')}</SectionTitle>
        <LabelValueRow label={t('decide.screens.answer.worked.payAndBills')} sub={t('decide.screens.answer.worked.fromActivity')} value={range} />
        <LabelValueRow label={t('decide.screens.answer.worked.netAndGoals')} sub={t('decide.screens.answer.worked.fromGrow')} value={net} />
        <LabelValueRow label={t('decide.screens.answer.worked.rules')} value={t('decide.screens.answer.worked.rulesCount', { count: sources.rulesCount })} />
      </Block>
      {recordsUpTo !== null ? <Body muted>{t('decide.screens.answer.worked.recordsDate', { date: recordsUpTo })}</Body> : null}
      <Body muted>{t('legal.decideAnswer.footer')}</Body>
    </InfoSheet>
  );
}
