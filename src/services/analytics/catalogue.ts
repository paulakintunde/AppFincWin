// ANL-03: the one place every analytics event name and its property shape is declared.
// `track()` (src/services/analytics/posthog.ts) is generic over `EventName` and constrains its
// second argument to `EventProps<E>`, so calling it with an unknown event name, a missing
// property, an excess property, or a value outside a property's literal union is a compile
// error — see __tests__/catalogue.typecheck.ts for the proof fixture. Nothing that identifies
// a specific transaction, a specific household member's spending, or any loosely typed string
// or numeric field may ever be added as a property here: the AssertAll guard below (via
// CATALOGUE_IS_FINITE) makes such a property type fail to compile, so a future edit smuggling
// financial detail in is caught at review time, not by discipline alone.
export type EventCatalogue = {
  app_opened: Record<string, never>;
  sign_in_completed: { provider: 'apple' | 'google' };
  sign_in_failed: { provider: 'apple' | 'google'; stage: 'native' | 'supabase' | 'cancelled' };
  theme_accent_changed: { accent: 'green' | 'navy' | 'rust' | 'slate' };
  theme_font_changed: { pairing: 'bold' | 'modern' | 'grotesk' | 'neutral' };
  analytics_opted_in: Record<string, never>;
  signed_out: { had_pending_writes: boolean };
  update_required_shown: Record<string, never>;
  // ANL-05 widened: funnel = first sign_in_completed -> first transaction_added -> first
  // statement import (import_committed, any format); no amounts, payees, bank names, file
  // names or free text.
  account_created: { context: 'onboarding' | 'later' };
  onboarding_history_choice: { choice: 'import' | 'fresh' | 'sample' };
  transaction_added: { kind: 'expense' | 'income' | 'transfer'; recurring: boolean };
  import_started: { entry: 'onboarding' | 'you' | 'account' };
  import_file_rejected: {
    reason: 'too_many_rows' | 'unreadable' | 'no_rows' | 'too_big' | 'unsupported_format' | 'unsupported_statement'
      | 'pdf_offline' | 'pdf_too_large' | 'pdf_scanned' | 'pdf_unreadable';
  };
  import_format_confirmed: {
    format: 'csv' | 'ofx' | 'qfx' | 'pdf';
    decided_by: 'labels' | 'reconciliation' | 'remembered' | 'user';
    flipped: boolean;
  };
  import_mapping_confirmed: { corrected: boolean };
  import_committed: {
    entry: 'onboarding' | 'you' | 'account';
    size: '1-50' | '51-500' | '501-5000';
    format: 'csv' | 'ofx' | 'qfx' | 'pdf';
    reconciliation: 'all_verified' | 'partial' | 'none_in_file' | 'ends_only_mismatch';
  };
  import_abandoned: {
    stage: 'pick' | 'format' | 'mapping' | 'review' | 'matches' | 'consent' | 'password' | 'balance';
  };
  // D-14: the only record kept of a statement that couldn't be read — anonymous layout shape,
  // no text, headers, bank names, amounts or file names; consent-gated like every event.
  import_pdf_unread: {
    failed_step: 'no_text_layer' | 'no_table' | 'no_rows';
    pages: '1' | '2-5' | '6-10' | '11-25';
    has_date: boolean;
    has_description: boolean;
    has_amount: boolean;
    has_debit_credit: boolean;
    has_balance: boolean;
  };
  recurring_suggestion_answered: { accepted: boolean };
  transfer_suggestion_answered: { accepted: boolean; kind: 'pair' | 'orphan' };
  pay_match_answered: { accepted: boolean };
  refund_suggestion_answered: { accepted: boolean };
  // ANL-06 / 05 D-20: Decide lifecycle and verdict state only. No amounts, item names, size codes, methods or kinds; step is a string because the guard rejects numbers.
  quick_check_run: { state: 'fits' | 'adjust' | 'no' | 'missing' };
  check_started: Record<string, never>;
  check_step_viewed: { step: '1' | '2' | '3' | '4' | '5' };
  check_completed: { state: 'fits' | 'adjust' | 'no' | 'missing' };
  check_abandoned: Record<string, never>;
  decision_recorded: { decision: 'go' | 'wait' | 'pass' };
  first_read_shown: { state: 'fits' | 'adjust' | 'no' | 'missing' };
};

export type EventName = keyof EventCatalogue;
export type EventProps<E extends EventName> = EventCatalogue[E];

// ANL-03 guard: every property must be `boolean` or a finite string-literal union.
// `string extends T` is only true when T is the bare `string` type (not a literal union),
// which is how this rejects a loosely typed string field while accepting
// `provider: 'apple' | 'google'`. Numbers are rejected on purpose too: a count needs a banded
// literal union such as `'0' | '1-5' | '6+'` instead of a raw number, which is a deliberate
// catalogue change, not a silent allow.
type IsFinite<T> = [T] extends [boolean] ? true : string extends T ? false : [T] extends [string] ? true : false;
type AllFinite<O> = { [K in keyof O]: IsFinite<O[K]> }[keyof O] extends true | never ? true : false;
type AssertAll<C> = { [E in keyof C]: AllFinite<C[E]> }[keyof C] extends true ? true : never;

// This line only compiles when every event's every property satisfies IsFinite. Temporarily
// adding a bare `string`-typed field to an entry above and re-running `npx tsc --noEmit`
// makes this assignment fail with a type error, proving the guard is live rather than
// decorative.
export const CATALOGUE_IS_FINITE: AssertAll<EventCatalogue> = true;
