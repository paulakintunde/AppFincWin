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

// Invalid: format outside the finite Phase 2 literal union.
// @ts-expect-error
track('import_committed', { entry: 'you', size: '51-500', format: 'pdf', reconciliation: 'partial' });
