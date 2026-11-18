---
status: resolved
trigger: "FincWin's Android app has never delivered an event to Sentry (project still shows onboarding page), although 00-16 wiring is merged on origin/main."
created: 2026-09-25
updated: 2026-11-17
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "(1) Sentry.init never ran because getEnv() threw on quoted EXPO_PUBLIC_SUPABASE_URL and the catch swallowed it. (2) Even once init runs, fatal JS errors are lost on Android because Sentry's global handler calls the RN default handler as soon as JS flush resolves, but sentry-java persists the envelope asynchronously on a busy single-thread executor, and the default handler crashes the process first."
  confirming_evidence:
    - "logcat: [FINCWIN_DIAG] getEnv threw on: EXPO_PUBLIC_SUPABASE_URL; status=enabled with error-tracking-only reader; caught probe Envelope sent successfully"
    - "logcat: fatal captured in JS at 00.590, default handler 00.613, process died 01.006, no offline-storage write; launch 2 replayed only the pre-crash session envelope"
    - "sentry-java AsyncHttpTransport.send enqueues; storeEnvelope runs in EnvelopeSender.run"
  falsification_test: "With a delayed default handler, if the fatal event still never shows 'Adding Envelope to offline storage'/'Envelope sent' before death or on next launch, (2) is wrong"
  fix_rationale: "(1) remove the unrelated dependency; (2) give the native executor a bounded window before teardown - Sentry wraps whatever handler exists at init, so installing a delaying wrapper before Sentry.init puts the delay exactly between Sentry's flush and the crash"
  blind_spots: "delay is time-bounded, not a completion signal; a very slow in-flight send could still exceed it. iOS not tested (out of scope)."
hypothesis: H1 + H2 both confirmed (see checkpoint)
test: one EAS preview build with temp diag log (getEnv ok / problem key names) + fixed init + caught probe (3s) + fatal probe (6s)
expecting: diag shows getEnv fails on SUPABASE_URL; with fix, Sentry debug logs show envelope sent for caught probe, fatal cached then sent
next_action: none. Closed 2026-11-17 after the owner's dashboard check (see last Evidence entry).

## Symptoms

expected: Caught and fatal JS errors on Android preview builds appear in Sentry
actual: Sentry project never received any event (onboarding page still shown)
errors: none visible; spike build 00838470 threw FINCWIN_SPIKE_ERROR 12345 then died via expo-updates fatal path
reproduction: install preview build, trigger error, check Sentry dashboard
started: always (never worked)

## Eliminated

## Evidence

- timestamp: 2026-09-25
  checked: orchestrator-established facts
  found: DSN ingest works via hand-built envelope (200); DSN set in EAS envs; source maps uploaded in build 00838470
  implication: problem is on-device SDK path, not DSN/project

- timestamp: 2026-09-25
  checked: docs/decisions/error-tracking.md live proof
  found: only "io.sentry.auto-init read: false" observed in logcat; this is native manifest read at Application start, independent of JS Sentry.init
  implication: no evidence that JS Sentry.init() ever ran in that build

- timestamp: 2026-09-25
  checked: scrub.ts scrubMessage
  found: "FINCWIN_SPIKE_ERROR 12345" becomes "FINCWIN_SPIKE_ERROR <n>" before send
  implication: dashboard searches must use the scrubbed form

- timestamp: 2026-09-25
  checked: @sentry/react-native 7.11.0 reactnativeerrorhandlers.js + RNSentryModuleImpl.captureEnvelope; expo-updates ErrorRecovery.kt
  found: Sentry wraps the previous global handler, captures, awaits client.flush (native captureEnvelope -> sentry-java writes to disk cache) and only then calls default handler. expo-updates hooks only at native onReactInstanceException, i.e. after the RN default handler reports the fatal - after Sentry's flush.
  implication: H2 structurally unlikely; to be confirmed on device

- timestamp: 2026-09-25
  checked: EAS env vars (names + shape only, values never printed) for preview/production/development
  found: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_POSTHOG_KEY are stored WITH literal wrapping double quotes in all three environments (e.g. `"https://...`). DSN, APP_ENV etc. are unquoted and well-formed.
  implication: at bundle time readClientEnv sees a Supabase URL not starting with https:// -> throws EnvError -> initErrorReporting's catch swallows -> Sentry.init never called. Strong H1 candidate.

- timestamp: 2026-09-25T13:28 (EAS build f81838b1, emulator-5554, launch 1)
  checked: logcat with [FINCWIN_DIAG] + Sentry debug:true
  found: "[FINCWIN_DIAG] getEnv threw on: EXPO_PUBLIC_SUPABASE_URL"; with fix "errorReporting status=enabled". Caught probe: "Captured error event `FINCWIN_SENTRY_PROBE_CAUGHT`" 13:28:57.744 -> "Envelope sent successfully." 57.939. Fatal probe: "Captured error event `FINCWIN_SENTRY_PROBE_FATAL`" 13:29:00.590, default handler ran 00.613 (23ms later), expo-updates "could not recover from error, crashing" 00.675, native "Event was dropped as the exception class com.facebook.react.common.JavascriptException is ignored" 00.679, process died 01.006. No "Adding Envelope to offline storage" for the fatal event.
  implication: H1 CONFIRMED on device. H2 CONFIRMED pending launch 2.

- timestamp: 2026-09-25T13:30 (launch 2)
  checked: cached-envelope replay at startup
  found: "Processing 1 items from cache dir" -> only f2539...envelope (the pre-crash session, status ok, written 00.446). outbox: 0 items. No fatal event replayed.
  implication: fatal JS event was never persisted - H2 CONFIRMED.

- timestamp: 2026-09-25
  checked: sentry-java 8.31.0 AsyncHttpTransport.send / InternalSentrySdk.captureEnvelope; RNSentryModuleImpl.captureEnvelope (7.11, 7.13, 8.28 identical)
  found: send() only executor.submit()s an EnvelopeSender on a 1-thread QueuedThreadPoolExecutor; the disk write (envelopeCache.storeEnvelope, line 274) happens inside EnvelopeSender.run. RN resolves the JS promise right after enqueue, so JS client.flush() resolves before the envelope is on disk, and Sentry's handler then calls the default handler -> native crash. The executor was busy sending a session envelope at the time. iOS has "store envelopes immediately during a fatal crash" (#3031); Android has no equivalent upstream, even in 8.28.
  implication: app-side fix needed: delay the pre-Sentry default handler on fatals so the native executor can persist/send first.

- timestamp: 2026-09-25T13:59-14:00 (EAS build 2d0acb0c, both fixes, 2 launches)
  checked: logcat
  found: fatal "Captured error event `FINCWIN_SENTRY_PROBE_FATAL`" 13:59:52.810 -> "Adding Envelope to offline storage ...80aa..." 53.204 (level fatal + session status crashed) -> "Envelope sent successfully." 54.344 -> expo-updates crash 56.254. Launch 2: same (stored +11ms, sent +852ms, crash +3s); cache empty at startup. Caught probe sent both launches.
  implication: both fixes verified on device

- timestamp: 2026-11-17
  checked: owner's manual Sentry dashboard check (org fincwin, project fincwin, US region; the API token cannot read events)
  found: the two 2026-09-25 probe issues are no longer listed (past the 30-day event retention), but the project shows real issues/data, not the "set up your first event" page
  implication: events from release builds reach Sentry; the fix holds in normal use. Closed.

## Resolution

root_cause: "(1) initErrorReporting used whole-app getEnv(); EAS vars EXPO_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/POSTHOG_KEY are stored with literal quotes in all envs, so getEnv threw and Sentry.init never ran (silently). (2) Android fatal JS events: Sentry's handler calls the RN default handler once JS flush resolves, but sentry-java only enqueues the envelope; disk write happens later on a busy single-thread executor, so expo-updates' crash kills the process first."
fix: "error-tracking-only env reader + observable skip status/warn; installFatalPersistDelay (3000ms, release only, fatals only) installed before Sentry.init"
verification: "unit tests (red then green), full jest 1110/1110, lint 0 errors, tsc, depcruise; on-device logcat build 2d0acb0c shows caught + fatal envelopes sent"
files_changed: [src/config/env.ts, src/config/__tests__/env.test.ts, src/services/errors/errorReporter.ts, src/services/errors/__tests__/errorReporter.test.ts, docs/decisions/error-tracking.md]
verification_dashboard: "2026-11-17 owner: project has live data (option B); probe events expired under retention"
