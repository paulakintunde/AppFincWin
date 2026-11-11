/**
 * 06.1-24: the route containers for setup items 1 and 2. They live in the shell because the decide feature may not import the series
 * write path (it reaches the exchange-rate fetch door); the one write the screens need from it is passed in as a prop.
 * Plan 25's item routes follow the same pattern.
 */
import React from 'react';
import { useEditSeriesFrom } from '@/data/mutations/recurringSeries';
import { BillsSetup } from '@/features/decide/screens/setup/items/BillsSetup';
import { PaySetup } from '@/features/decide/screens/setup/items/PaySetup';

export function SetupPayRoute() {
  const { editFrom } = useEditSeriesFrom();
  return <PaySetup editSeriesFrom={editFrom} />;
}

export function SetupBillsRoute() {
  const { editFrom } = useEditSeriesFrom();
  return <BillsSetup editSeriesFrom={editFrom} />;
}
