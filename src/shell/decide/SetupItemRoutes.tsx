/**
 * 06.1-24: the route containers for setup items 1 and 2. They live in the shell because the decide feature may not import the series
 * write path (it reaches the exchange-rate fetch door); the one write the screens need from it is passed in as a prop.
 * Plan 25 adds items 3 to 6 below.
 */
import React from 'react';
import { useEditGoal } from '@/data/mutations/growGoals';
import { useSaveGrowDebt } from '@/data/mutations/growDebts';
import { useEditSeriesFrom, useSetSeriesStatus } from '@/data/mutations/recurringSeries';
import { useSafetyNetAnswer } from '@/data/mutations/safetyNetAnswer';
import { useSkipOccurrence } from '@/data/mutations/transactions';
import { BillsSetup } from '@/features/decide/screens/setup/items/BillsSetup';
import { DebtsSetup } from '@/features/decide/screens/setup/items/DebtsSetup';
import { NetSetup } from '@/features/decide/screens/setup/items/NetSetup';
import { PaySetup } from '@/features/decide/screens/setup/items/PaySetup';
import { RecordsSetup } from '@/features/decide/screens/setup/items/RecordsSetup';
import { RulesSetup } from '@/features/decide/screens/setup/items/RulesSetup';
import { useRecordContext } from '@/features/record/useRecordContext';

export function SetupPayRoute() {
  const { editFrom } = useEditSeriesFrom();
  return <PaySetup editSeriesFrom={editFrom} />;
}

// 06.1-75 (OQ-75-1 A, DC-6): the bill stop is the Activity Stopped writer (end_date only, past entries stay, Undo), bound here too.
export function SetupBillsRoute() {
  const { editFrom } = useEditSeriesFrom();
  const status = useSetSeriesStatus();
  return <BillsSetup editSeriesFrom={editFrom} onStopBill={(series, from, ownerId) => status.stop(series, from, ownerId)} />;
}

// 06.1-25: items 3 and 4. Debts saves a due day on the Grow debt; the safety net saves its account on the Grow goal, or answers
// the first-answer net question. All three are Grow's own writers, passed down as props.
export function SetupDebtsRoute() {
  const grow = useSaveGrowDebt();
  return <DebtsSetup saveDueDay={(debt, day, ownerId) => grow.save({ ownerId, existing: debt, fields: { due_day: day } }).stepId} />;
}

export function SetupNetRoute() {
  const rc = useRecordContext();
  const net = useSafetyNetAnswer(rc.userId ?? '', rc.householdId ?? '');
  const goal = useEditGoal();
  return <NetSetup answer={net.answer} setAccount={(row, accountId, ownerId) => goal.edit(row, { account_id: accountId }, ownerId, 0)} />;
}

export function SetupRulesRoute() {
  return <RulesSetup />;
}

// 06.1-45 (G-1, C-4): Records lists the readiness items with their fixes, so it needs Grow's goal writer (envelope account, D-54)
// and the line skip, both bound here as on the answer route.
export function SetupRecordsRoute() {
  const goal = useEditGoal();
  const skipper = useSkipOccurrence();
  return (
    <RecordsSetup
      writes={{
        setEnvelopeAccount: (row, accountId, ownerId) => goal.edit(row, { account_id: accountId }, ownerId, 0),
        skipLine: (row, ownerId) => skipper.skip(row, ownerId),
      }}
    />
  );
}
