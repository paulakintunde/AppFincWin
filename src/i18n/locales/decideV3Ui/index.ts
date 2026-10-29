// 05.3: screen copy for the v3 Decide screens, mounted at decide.v3.ui by en.ts. Area files are added by 05.3-09 / 05.3-09b.
// Every leaf passes the DCU-09 and v3 guards in src/i18n/__tests__/decideCopy.test.ts.
import { partA } from './partA';
import { partB } from './partB';
export const decideV3Ui = { ...partA, ...partB } as const;
