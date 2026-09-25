// D-18, D-19: public surface for this module. Plan 01-15's write queue calls
// captureError(error, { area: 'sync' }) — keep this export shape stable.
export { initErrorReporting, captureError, type ErrorArea } from './errorReporter';
export { scrubMessage, scrubStackFrame } from './scrub';

// T-00-16-05 (STRIDE, mitigate): the D-19 spike trigger. Gated behind a literal env-var access
// (so Metro can inline and dead-code-eliminate it from any bundle where the var isn't '1'),
// and only ever throws when a build was deliberately started with EXPO_PUBLIC_ERROR_SPIKE=1 for
// Task 2's live EAS spike. Removed entirely in Task 3, once D-19 is decided — see
// docs/decisions/error-tracking.md.
export function maybeFireSpikeError(): void {
  if (process.env.EXPO_PUBLIC_ERROR_SPIKE === '1') {
    setTimeout(() => {
      throw new Error('FINCWIN_SPIKE_ERROR 12345');
    }, 3000);
  }
}
