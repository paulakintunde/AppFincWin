/**
 * 06.2-04 (D-12, D-14): StatusBadge words for every status, and the change and freshness lines. Owner plan: 04 only; later
 * plans read these keys. Board source: L06 (status badges). Existing per-screen words stay where they are
 * (activity.tag.paid, activity.section.paid, record.sheet.status.*, record.recurring.overdue, grow.goals.detail.reached);
 * StatusBadge reads appLife.status.* so every badge says the same word.
 */
export const status = {
  paid: 'Paid',
  received: 'Received',
  due: 'Due',
  dueOn: 'Due {{date}}',
  dueSoon: 'Due soon',
  overdue: 'Overdue',
  overCap: 'Over cap',
  overCapBy: '{{amount}} over cap',
  pending: 'Pending',
  onTrack: 'On track',
  behind: 'Behind',
  reached: 'Reached',
  draft: 'Draft',
  notYet: 'Not yet',
  safetyNet: 'Safety net locked',
  up: 'up {{percent}}%',
  down: 'down {{percent}}%',
  updatedAgo_one: 'Updated 1 day ago',
  updatedAgo_other: 'Updated {{count}} days ago',
  cleared: 'Cleared',
} as const;
