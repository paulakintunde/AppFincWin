// D-18, D-19: public surface for this module. Plan 01-15's write queue calls
// captureError(error, { area: 'sync' }) — keep this export shape stable.
export { initErrorReporting, captureError, type ErrorArea } from './errorReporter';
export { scrubMessage, scrubStackFrame } from './scrub';
