/**
 * 08-12: the household.* namespace, merged into en.household. One file per area so parallel UI plans never edit the same
 * copy file. Source: 08-UI-SPEC.md. Declarative, never advice; guarded by src/i18n/__tests__/householdCopy.test.ts.
 */
import { account } from './account';
import { home } from './home';
import { join } from './join';
import { leave } from './leave';
import { members } from './members';
import { notices } from './notices';
import { rules } from './rules';
import { settle } from './settle';
import { sharing } from './sharing';

export const household = {
  home,
  members,
  join,
  sharing,
  rules,
  settle,
  leave,
  account,
  notices,
} as const;
