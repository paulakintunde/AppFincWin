// ANL-03: compile-time-only fixture proving the typed event catalogue rejects free-form
// properties. Never executed by Jest (jest.config.js's testMatch only picks up *.test.ts?(x));
// this file is a `tsc --noEmit` target only. Each `// @ts-expect-error` line documents one
// invalid call that must fail to compile; if the catalogue's typing regresses to accept it,
// `tsc --noEmit` starts failing (an unused @ts-expect-error is itself a compile error).
import type { EventName, EventProps } from '../catalogue';

declare function track<E extends EventName>(e: E, p: EventProps<E>): void;

// Valid: compiles cleanly.
track('sign_in_completed', { provider: 'google' });
track('app_opened', {});
track('theme_accent_changed', { accent: 'navy' });
track('import_committed', { entry: 'you', size: '51-500', format: 'ofx', reconciliation: 'partial' });

// Invalid: excess property not in the literal union for this event.
// @ts-expect-error
track('sign_in_completed', { provider: 'google', amount: 12 });

// Invalid: provider value outside the finite literal union.
// @ts-expect-error
track('sign_in_completed', { provider: 'paypal' });

// Invalid: event name not present in the catalogue at all.
// @ts-expect-error
track('not_an_event', {});

// Invalid: size must be a banded literal union, not a raw number.
// @ts-expect-error
track('import_committed', { entry: 'you', size: 42, format: 'ofx', reconciliation: 'partial' });

// Invalid: format outside the finite literal union.
// @ts-expect-error
track('import_committed', { entry: 'you', size: '51-500', format: 'xls', reconciliation: 'partial' });

track('import_committed', { entry: 'you', size: '1-50', format: 'pdf', reconciliation: 'partial' });
track('import_pdf_unread', {
  failed_step: 'no_table',
  pages: '2-5',
  has_date: true,
  has_description: true,
  has_amount: false,
  has_debit_credit: false,
  has_balance: false,
});

// Invalid: pages must be a banded literal, not a number.
// @ts-expect-error
track('import_pdf_unread', { failed_step: 'no_rows', pages: 3, has_date: true, has_description: true, has_amount: true, has_debit_credit: false, has_balance: false });

// Invalid: no extra free-form properties.
// @ts-expect-error
track('import_pdf_unread', { failed_step: 'no_rows', pages: '1', has_date: true, has_description: true, has_amount: true, has_debit_credit: false, has_balance: false, header: 'Date' });

// ANL-06 (05-01): Decide events carry enums only.
track('check_step_viewed', { step: '3' });
track('decision_recorded', { decision: 'wait' });

// Invalid: step is a string union, not a number.
// @ts-expect-error
track('check_step_viewed', { step: 3 });

// Invalid: no amounts on Decide events.
// @ts-expect-error
track('quick_check_run', { state: 'fits', amount: 100 });

// 05.2 (DSU-24): setup events carry a literal step key only.
track('decide_setup_started', {});
track('decide_setup_step_saved', { step: 'accountUse' });
track('decide_setup_finished', {});
track('decide_setup_left', { step: 'welcome' });

// Invalid: a free string is not a step key.
// @ts-expect-error
track('decide_setup_step_saved', { step: 'Your regular pay' });

// Invalid: no amounts or names on setup events.
// @ts-expect-error
track('decide_setup_left', { step: 'pay', amount: 4000 });

// 05.3: v3 Decide events.
track('decide_check_started', {});
track('decide_answer_shown', { code: 'fits_month', variant: 'none' });
track('decide_answer_shown', { code: 'not_yet', variant: 'payday' });

// Invalid: 05.4 CMP-F03 (05.4-38), no price band on an answer.
// @ts-expect-error
track('decide_answer_shown', { code: 'not_yet', variant: 'payday', band: '15' });
track('decide_question_answered', { missing: 'pay_arrival_question' });
track('decide_recorded', { outcome: 'planned' });
track('decide_instead_opened', {});
track('decide_help_used', {});
track('decide_refine_choice', { kind: 'under_logged_month', choice: 'kept' });
track('decide_not_ready_shown', { first: 'past_month_missing', count: '2' });

// Invalid: no amounts or names on v3 Decide events.
// @ts-expect-error
track('decide_recorded', { outcome: 'planned', amount: 4000 });

// Invalid: a free string is not an outcome.
// @ts-expect-error
track('decide_recorded', { outcome: 'Laptop' });

// 09-12 (D-38, ANL-08): level, plan and offer events carry enums only. Levels are the strings '1' to '4'.
track('onboarding_started', { mode: 'first_run' });
track('onboarding_question_answered', { step: 'goal', skipped: false });
track('onboarding_finished', { mode: 'rerun', skipped_all: false });
track('onboarding_level_assigned', { level: '2', source: 'skipped' });
track('level_changed', { from: '2', to: '3', source: 'features' });
track('feature_switch_changed', { feature: 'hh.settleUp', on: true });
track('paywall_shown', { trigger: 'sample_bar' });
track('trial_started', { plan: 'solo', period: 'month' });
track('plan_changed', { plan: 'household', period: 'year', timing: 'renewal' });
track('plan_restored', { result: 'nothing' });
track('offer_shown', { feature: 'debts' });
track('offer_accepted', { feature: 'debts' });
track('offer_dismissed', { feature: 'debts', choice: 'never' });
track('offer_dismissed', { feature: 'debts', choice: 'not_now' });
// @ts-expect-error choice is required (ANL-03 finite guard rejects optional props)
track('offer_dismissed', { feature: 'debts' });
track('csv_exported', { locked: true });

// Invalid: no amount on a plan event.
// @ts-expect-error
track('plan_changed', { plan: 'solo', period: 'month', timing: 'now', amount: 699 });

// Invalid: the level is a literal string, not a number.
// @ts-expect-error
track('onboarding_level_assigned', { level: 2, source: 'answers' });

// Invalid: a feature id outside the signed map, so no free text.
// @ts-expect-error
track('offer_shown', { feature: 'my groceries' });

// Invalid: no price on the trial event.
// @ts-expect-error
track('trial_started', { plan: 'solo', period: 'month', price: 'six ninety-nine' });
