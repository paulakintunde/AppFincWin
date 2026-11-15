/**
 * 06.2-04: Overview due-soon and overdue lines. Owner plan: 13. Board source: L01.
 */
export const home = {
  dueIn_one: 'Due tomorrow',
  dueIn_other: 'Due in {{count}} days',
  dueToday: 'Due today',
  overdueBy_one: 'Overdue 1 day',
  overdueBy_other: 'Overdue {{count}} days',
  // 06.2-13: the Pay bills quick action speaks the month's unpaid count (board L01 aria-label).
  payBillsUnpaid_one: 'Pay bills, {{count}} unpaid',
  payBillsUnpaid_other: 'Pay bills, {{count}} unpaid',
  // 06.2-13: a Coming up row with a badge speaks name, amount, the badge words, then one of these.
  rowDue: 'due {{date}}',
  rowWasDue: 'was due {{date}}',
} as const;
