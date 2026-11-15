// 06.1-20 (D58 / N14): "Your month after buying". Left before this purchase, left this month with it and, once payments start, a usual
// month. All three come from Result.afterBuy (homeFigure is "before"); the bars share one figure (what is left) and grow down below zero.
import React from 'react';
import type { AfterBuy } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { DetailShell, SignedBars, useDetailFormat, type BarItem } from './detailKit';

export interface MonthAfterSheetProps {
  afterBuy: AfterBuy;
  currency: string;
  onClose: () => void;
}

export function MonthAfterSheet({ afterBuy, currency, onClose }: MonthAfterSheetProps) {
  const t = useT();
  const f = useDetailFormat(currency);
  const k = (key: string): string => String(t(`decide.screens.answerDetail.monthAfter.${key}` as never));
  const items: BarItem[] = [
    { key: 'before', label: k('before'), value: afterBuy.before },
    { key: 'now', label: `${k('leftThisMonth')}, ${f.month(afterBuy.monthName)}`, value: afterBuy.month },
  ];
  if (afterBuy.usualMonth !== null) items.push({ key: 'usual', label: k('usualAfter'), value: afterBuy.usualMonth });
  return (
    <DetailShell title={k('title')} footer={t('legal.decideAnswer.footer')} onClose={onClose}>
      <SignedBars items={items} currency={currency} chartLabel={k('chartA11y')} testID="monthafter" />
    </DetailShell>
  );
}
