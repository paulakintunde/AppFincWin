// 05.4-37 APP-20 compile-time check: not a jest test (excluded from testMatch and coverage), only checked via `tsc --noEmit`.
// Every key in the Decide v3 engine's copy tables must be a real en.ts leaf, so a missing or misspelt key fails typecheck.
import type { DecideV3CopyKey } from '../decideV3Keys';
import type {
  ABOUT_KEYS,
  AFTER_BUY_KEYS,
  BASIS_KEYS,
  BASIS_REASON_KEYS,
  CAVEAT_FIGURE_KEYS,
  CAVEAT_KEYS,
  CAVEAT_WRONG_FIGURE_KEY,
  DISCLAIMER_KEYS,
  FACT_ACTION_KEYS,
  FACT_KEYS,
  INTRO_KEYS,
  MISSING_KEYS,
  NEXT_STEP_KEYS,
  NOTICE_KEYS,
  READINESS_KEYS,
  TAX_KEYS,
  VERDICT_TABLE,
} from '../../engine/decide/v3';

type Is<T extends DecideV3CopyKey> = T;
type Values<T> = T extends readonly (infer E)[] ? E : T[keyof T];
type Flat<T> = T extends string ? T : T extends readonly (infer E)[] ? E : Values<{ [K in keyof T]: Flat<T[K]> }>;
type Row = (typeof VERDICT_TABLE)[keyof typeof VERDICT_TABLE];

export type DecideV3KeyChecks = [
  Is<Row['chipKey'] | Row['titleKey'] | Row['bodyKey']>,
  Is<Values<typeof NOTICE_KEYS>>,
  Is<Values<typeof FACT_KEYS>>,
  Is<Values<typeof MISSING_KEYS>>,
  Is<Values<typeof READINESS_KEYS>>,
  Is<Values<typeof BASIS_KEYS>>,
  Is<Values<typeof BASIS_REASON_KEYS>>,
  Is<Values<typeof NEXT_STEP_KEYS>>,
  Is<Values<typeof AFTER_BUY_KEYS>>,
  Is<Values<typeof TAX_KEYS>>,
  Is<Flat<typeof FACT_ACTION_KEYS>>,
  Is<Flat<typeof DISCLAIMER_KEYS>>,
  Is<Flat<typeof ABOUT_KEYS>>,
  Is<Flat<typeof INTRO_KEYS>>,
  Is<Values<typeof CAVEAT_KEYS>>,
  Is<Values<typeof CAVEAT_FIGURE_KEYS>>,
  Is<typeof CAVEAT_WRONG_FIGURE_KEY>,
];

// The check bites: a misspelt key is rejected.
// @ts-expect-error not a key in en.ts
export type DecideV3KeyMisspelt = Is<'decide.v3.verdict.fitsMonth.chipp'>;
