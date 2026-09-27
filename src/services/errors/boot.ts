// D-18, WR-04: always-on error reporting, initialised as an import side effect so it can be
// the very FIRST import of app/_layout.tsx. ES imports are hoisted and evaluated before the
// importing module's body, and several of the root layout's imports (AuthProvider ->
// services/supabase/client.ts) call getEnv() at load time, which throws on a misconfigured
// environment. A body-level initErrorReporting() call would never run in that case, so the
// boot crash would go unreported. errorReporter only reads getErrorTrackingEnv(), which never
// throws, and initErrorReporting() itself never throws, so this module is safe to load first.
import { initErrorReporting } from './errorReporter';

initErrorReporting();
