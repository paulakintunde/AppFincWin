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
