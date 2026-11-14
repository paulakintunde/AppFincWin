/**
 * 06.2-04 (D-06, D-12, D-14): the appLife.* namespace, merged into en.appLife. Every new 06.2 word is a typed key here,
 * split into area files with one owner plan each, so same-wave plans never edit the same copy file. Calm and confident
 * voice; guarded by src/i18n/__tests__/appLifeCopy.test.ts. Not a locked root: no Decide wording lives here.
 */
import { accounts } from './accounts';
import { activity } from './activity';
import { calendar } from './calendar';
import { categories } from './categories';
import { debts } from './debts';
import { empty } from './empty';
import { grow } from './grow';
import { home } from './home';
import { importDone } from './importDone';
import { status } from './status';
import { toast } from './toast';
import { you } from './you';

export const appLife = {
  status,
  activity,
  calendar,
  home,
  toast,
  you,
  accounts,
  categories,
  empty,
  grow,
  debts,
  importDone,
} as const;
