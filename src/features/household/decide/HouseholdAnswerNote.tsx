// 08.1-10 (D-37, UX-21): the shared-bills caveat on a Household answer. Shown only when the check is a Household check and another
// member has not logged a shared line for more than 30 days; a member who never logged one has no date to name, so nothing shows
// for them (owner 2026-11-20). The couples note is the engine's own shared_money sentence (the same words), so it is not drawn twice.
import React from 'react';
import { SharedBillsCaveat, useStaleSharedBills } from './SharedBillsCaveat';

export function HouseholdAnswerNote({ householdId, today }: { householdId: string | null | undefined; today: string }) {
  const stale = useStaleSharedBills(householdId, today);
  if (stale === null) return null;
  return <SharedBillsCaveat householdId={householdId} partnerId={stale.partnerId} lastDate={stale.lastDate} />;
}
