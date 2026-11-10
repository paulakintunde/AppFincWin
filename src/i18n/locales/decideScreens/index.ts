/**
 * 06.1-05 (D-18): the decide.screens.* namespace, merged into en.decide.screens. Every new Decide screen string is a typed key
 * here; answer sentences stay on decide.v3.* and legal.decide*. Each area file has one owner plan, so same-wave plans never edit
 * the same copy file. decide.screens is a locked root (wordingScope.ts LOCKED_ROOTS): it is signed under D-08 and guarded by
 * the Decide copy tests (banned words, the 25-word / 3-number sentence rule).
 */
import { answer } from './answer';
import { answerActions } from './answerActions';
import { answerDetail } from './answerDetail';
import { common } from './common';
import { home } from './home';
import { past } from './past';
import { safetyNet } from './safetyNet';
import { setup } from './setup';
import { setupOthers } from './setupOthers';
import { setupPayBills } from './setupPayBills';
import { sheetsCosts } from './sheetsCosts';
import { sheetsHome } from './sheetsHome';
import { sheetsInput } from './sheetsInput';
import { stepper } from './stepper';

export const decideScreens = {
  common,
  home,
  sheetsHome,
  stepper,
  answer,
  answerDetail,
  answerActions,
  setup,
  setupPayBills,
  setupOthers,
  sheetsInput,
  sheetsCosts,
  past,
  safetyNet,
} as const;
