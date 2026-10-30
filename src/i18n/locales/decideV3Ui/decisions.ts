// 05.3 decide.v3.ui.decisions: UI-SPEC Past decisions
export const decisions = {
  title: 'Past decisions',
  empty: 'Nothing decided yet',
  kept: 'You kept {{price}}',
  bought: 'Bought · {{date}}',
  planned: 'Planned · {{date}}',
  passed: 'Not buying · {{date}}',
  checkAgain: 'Check again',
  rowA11y: '{{item}}, {{price}}. {{status}}. Opens the check.',
} as const;
