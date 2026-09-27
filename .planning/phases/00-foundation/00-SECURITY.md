---
phase: 00
slug: foundation
status: open
threats_open: 2
threats_total: 81
threats_closed: 79
asvs_level: 1
block_on: high
created: 2026-09-26
audited_plans: [00-01, 00-02, 00-03, 00-04, 00-05, 00-06, 00-08, 00-09, 00-10, 00-11, 00-12, 00-13, 00-14, 00-15, 00-16, 00-17, 00-18, 00-19]
not_yet_executed: [00-07, 00-20]
---

# Phase 00: Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Scope: the 18 executed plans (each has a SUMMARY.md). Plans 00-07 and 00-20 are not executed, so their threats are listed under "Not yet executed" and are not counted.
> Method: each `mitigate` threat was checked against code, tests, config, CI and, where needed, read-only live state: the Supabase Management API (read-only queries), the public REST endpoint with the publishable key, `gh api` branch protection, `eas env:list` (names and visibility only), the PostHog project API, and public DNS. No secret value was printed. No implementation file was modified.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| repo -> public GitHub / history | Anything tracked, now or in the past, may leak | Docs, config, possible secrets |
| npm registry -> repo | Third-party packages enter the supply chain | Code |
| app bundle -> device | Every EXPO_PUBLIC_* value, and everything else in app.config.ts `extra`, ships in the binary | Public config |
| client (anon/authenticated) -> PostgREST -> Postgres | Untrusted callers. RLS and grants are the only authorisation boundary | Household, profile and money rows |
| auth.users insert -> security-definer trigger | Code that runs with elevated privilege at signup | Identity metadata |
| internet / pg_cron -> fx-sync Edge Function (service role) | Public URL, secret-gated, bypasses RLS | FX rates |
| Frankfurter -> fx-sync | Untrusted third-party JSON | FX rates |
| device storage (AsyncStorage / SecureStore) | Readable on rooted or jailbroken devices and in some backups | Session, caches, theme |
| native identity SDK / system browser -> app -> Supabase Auth | ID tokens and OAuth codes | Credentials |
| device -> PostHog EU / Sentry (US) | Analytics after consent. Crash data always (D-18) | Behavioural and technical telemetry |
| EAS environments / EAS Update -> installed apps | Inlined env and OTA code | Config, JS code |
| operator -> production Supabase | Schema and config changes on the only project, which is production | Schema, secrets |
| contributor -> main | Code entering the protected branch | Code |

---

## Threat Register

*Status: open · closed. Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party).*

### 00-01: Enrolment and email

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-01-01 | I | docs/enrolment/email-setup.md | mitigate | Record types and names only. No values, keys or SMTP passwords | closed | `grep -E "re_[A-Za-z0-9]{10,}\|p=MIG\|v=spf1\|v=DKIM1\|k=rsa"` over docs/enrolment, dependency-register and docs/ops returns nothing. email-setup.md:48-50 states the rule |
| T-00-01-02 | I | docs/dependency-register.md | mitigate | Personal inbox never written | closed | dependency-register.md and email-setup.md contain no personal address, only "owner's personal inbox" (email-setup.md:35,63,64). Observation: a personal Google test-account address appears in docs/acceptance/phase-00-android.md:80 and phase-01-money-core.md:138. This is outside the threat's cited file, but consider redacting it |
| T-00-01-03 | S | Work email domain | mitigate | SPF + DKIM + DMARC (`p=none` to start) published | **open** | Live DNS on 2026-09-26: fincwin.com has SPF (root and `send.`) and a DKIM key (`resend._domainkey`), but **`_dmarc.fincwin.com` has no TXT record** (NXDOMAIN/SOA only, checked on 8.8.8.8 and 1.1.1.1). email-setup.md:44 says "DMARC not confirmed as added". leadstrategy.ca has SPF and `DMARC p=none` (inbound only, so no DKIM is needed). fincwin.com is the domain that sends `no-reply@` and publishes `support@` in both store listings |
| T-00-01-04 | R | D-U-N-S / D&B mismatch | accept | Human check recorded with date. Fixed at D&B, not in code | closed | See Accepted Risks AR-01. apple-org-checklist.md:7 records the "Checked 2026-09-22: not yet verifiable" check |

### 00-02: Scaffold and dependencies

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-02-01 | T | package installs | mitigate | Exact pins for security-relevant libraries, a committed lockfile, `npm ci` in CI | closed | package.json has `@supabase/supabase-js: "2.117.0"`, `aes-js: "3.1.2"` and `posthog-react-native: "4.76.0"`, all exact. The versions were bumped after the plan but are still exact pins. package-lock.json is tracked. ci.yml `npm ci --legacy-peer-deps`. fx-sync/index.ts imports `npm:@supabase/supabase-js@2.116.0`, also exact |
| T-00-02-02 | I | app.config.ts | mitigate | Only non-secret build values read from env | closed | app.config.ts reads only EXPO_OWNER, EAS_PROJECT_ID, GOOGLE_IOS_URL_SCHEME, SENTRY_ORG and SENTRY_PROJECT. The Sentry `authToken` is deliberately not passed (comment at lines 30-38) |
| T-00-02-03 | I | session replay | mitigate | Replay plugin never installed | closed | No `session-replay` package in package.json or node_modules. Test services/analytics/__tests__/config.test.ts:10-15 asserts this |
| T-00-02-04 | E | native folders | accept | /android and /ios gitignored (CNG) | closed | See AR-02. .gitignore lines `/android` and `/ios`. No native folder in `git ls-files` |

### 00-03: Supabase project

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-03-01 | I | Access token, DB password, service_role keys | mitigate | Only in .env.local, which is gitignored. No `.env*` tracked. gitleaks in CI | closed | `git check-ignore -v .env.local` resolves to .gitignore:4. `git ls-files` shows only `.env.example` (no values). The `secret-scan` job runs gitleaks over full history and is a required check |
| T-00-03-02 | E | Accidental prod changes | mitigate | Migrations only, with preflight ref assertion | closed | scripts/supabase-preflight.mjs compares config.toml `project_id` against SUPABASE_PROD_PROJECT_REF and exits 1 on mismatch. `npm run supabase:db:push` chains it. Live: remote `schema_migrations` has exactly the 11 tracked migration versions |
| T-00-03-03 | I | Data residency | accept | US West deliberately (D-22). DPA/SCCs | closed | See AR-03. docs/decisions/supabase-environments.md:14-18 |
| T-00-03-04 | S | Weak DB password | mitigate | 24 random bytes, base64url, from Node crypto (CSPRNG) | **open** | No evidence that the password was generated this way. Checked without printing the value: SUPABASE_DB_PASSWORD in .env.local is **16 characters** of base64url charset. A 24-byte base64url value would be 32 characters. The plan text (00-03 step 4) says it "was set at creation", meaning Dashboard-generated, and the SUMMARY records no CSPRNG generation step. If it is random, the entropy is about 96 bits (not trivially weak), but the declared control is absent and its origin cannot be verified |

### 00-04: Dev machine toolchain

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-04-01 | I | debug keystore | accept | Debug SHA-1 is public. The debug key never signs store builds | closed | See AR-04. dev-setup.md:170-194. eas.json profiles use EAS-managed credentials (00-14 SUMMARY:69) |
| T-00-04-02 | T | toolchain supply chain | mitigate | Android Studio from winget or the official site. SDK from Google's SDK Manager | closed | docs/dev-setup.md:12-13 (winget `Google.AndroidStudio` / developer.android.com), :51 and :64-71 (SDK Manager / sdkmanager) |

### 00-05: Env module, engine boundary, gates

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-05-01 | I | src/config/env.ts | mitigate | Only EXPO_PUBLIC_ keys are read. No service-role or access token in src/ | closed | env.ts getEnv() and getErrorTrackingEnv() use only literal `process.env.EXPO_PUBLIC_*`. `grep -rnE "SERVICE_ROLE\|service_role\|sb_secret_\|SUPABASE_ACCESS_TOKEN" src app` finds nothing. CI step "Service-role key never referenced by client code (ENV-04)" |
| T-00-05-02 | I | PostHog host | mitigate | Reject any host but https://eu.i.posthog.com | closed | env.ts `EU_POSTHOG_HOST` check in readClientEnv throws EnvError. The returned `posthogHost` is the constant |
| T-00-05-03 | T | engine boundary bypass | mitigate | eslint + depcruise (incl. `reachable`) + self-test | closed | eslint.config.js:29-97 (boundaries + engine import bans). .dependency-cruiser.cjs rules `engine-only-internal-src` and `engine-no-reach-impure` (`reachable: true`). scripts/verify-gates.mjs Probes 1-3 prove both tools fail. CI runs lint, depcruise and verify:gates |
| T-00-05-04 | T | coverage-ignore bypass | mitigate | `-- reason:` required on every ignore in 100% folders | closed | scripts/check-coverage-ignores.mjs:15-16 regex (reason of 10+ characters). verify-gates.mjs:126-131 probe. CI `npm run check:ignores` |
| T-00-05-05 | S | plaintext Supabase URL | mitigate | https:// required except loopback in development | closed | env.ts `isValidSupabaseUrl`: https, or `127.0.0.1` / `10.0.2.2` only when EXPO_PUBLIC_APP_ENV=development |

### 00-06: Household-of-one schema and RLS

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-06-01 | E/I | RLS on households/household_members/profiles | mitigate | RLS on all three. Select policies `to authenticated`. No insert/delete policies. pgTAP isolation | closed | 20260922000100:125-146. 02_rls_isolation.test.sql (A cannot see or update B, inserts return 42501, anon returns 42501). Live: relrowsecurity=true on all public tables. anon has no privileges and authenticated has select only |
| T-00-06-02 | E | handle_new_user / user_household_ids (definer) | mitigate | `search_path=''`, qualified names, execute revoked. pgTAP | closed | Migration lines 77-121. 01_household_of_one.test.sql:59-92 asserts prosecdef, proconfig and has_function_privilege |
| T-00-06-03 | T | profiles column tampering | mitigate | Table-level update revoked. Column grants only. `with check (id = auth.uid())` | closed | Migration lines 141-146. The test "A cannot update profiles.version (column not granted)" gives 42501. Note: Phase 1 (20260924000200:29) adds a column grant for four money-pref columns, which is outside this phase |
| T-00-06-04 | E | app_config writes | mitigate | Writes revoked. Select-only policy. pgTAP 42501 | closed | 20260922000200:16-18. 03_app_config.test.sql throws_ok 42501 ×3. Live: anon and authenticated have insert/update/delete = false |
| T-00-06-05 | D | Signup blocked by trigger failure | mitigate | Three constant inserts. Blank full_name becomes null | closed | handle_new_user uses `nullif(coalesce(...),'')`, and all other columns are defaulted or nullable. 02_rls_isolation provisions user B with `'{}'` metadata successfully |
| T-00-06-06 | D | RLS performance cliff | mitigate | `(select auth.uid())` initPlan form, index, policy-shape pgTAP | closed | Every policy uses `(select auth.uid())` or the helper. `household_members_user_id_idx`. 01_household_of_one.test.sql:102-117 shape assertion |
| T-00-06-07 | I | Recursive RLS / membership leak | mitigate | Lookup centralised in `user_household_ids()` | closed | Migration lines 77-89. Policies call `public.user_household_ids()` rather than self-referencing |

### 00-08: CI and branch protection

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-08-01 | I | Committed secrets | mitigate | gitleaks over full history with custom rules and redacted output | closed | ci.yml secret-scan: `fetch-depth: 0`, `gitleaks git ... --redact --exit-code 1`. .gitleaks.toml `useDefault = true` plus supabase-secret-key, service-role JWT, `sbp_` token and PostHog `phx_` rules. A manual `git grep` for GOCSPX-, sb_secret_, sbp_, phx_ and sntrys_ in the tree and history found only grep patterns inside planning files |
| T-00-08-02 | I | Service-role in client | mitigate | CI grep on src/ and app/ | closed | ci.yml final `checks` step `! grep -rnE 'SERVICE_ROLE\|service_role\|sb_secret_' src app`. Passes locally |
| T-00-08-03 | T | Gate bypass | mitigate | Required status checks on main. verify:gates | closed | `gh api .../branches/main/protection`: required contexts `checks`, `secret-scan`, `rls`, `strict: true`, **`enforce_admins: true`**, force-push and deletion disabled. The last 3 main runs succeeded |
| T-00-08-04 | E | Workflow token scope | mitigate | `permissions: contents: read` | closed | ci.yml:6-7. No `secrets.*` referenced by any job |
| T-00-08-05 | T | Third-party action supply chain | mitigate | First-party actions only. gitleaks pinned | closed | actions/checkout, actions/setup-node and supabase/setup-cli are pinned to full commit SHAs. gitleaks is pinned by image **digest** (`@sha256:c00b6b…`), which is stronger than a tag |

### 00-09: FX sync

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-09-01 | S/D | fx-sync endpoint | mitigate | Constant-time shared-secret header. 403 otherwise | closed | fx-sync/index.ts `safeEqual` plus 403 when the secret is missing or mismatched. Live: POST with a wrong secret returns **403**. The cron reads the secret from `vault.decrypted_secrets` (20260922000400:14-17), so no value is in git |
| T-00-09-02 | T | Frankfurter payload | mitigate | Validate shape, ISO codes, dates and positive finite rates. Reject v1. No write on failure | closed | parse.ts:18-54 (v1 rejection, DATE_RE, CURRENCY_RE, `Number.isFinite && rate > 0`). sync.ts parses before any upsert. sync.test.ts:144-158 "writing nothing" |
| T-00-09-03 | E | service-role key | mitigate | Only in the function runtime. Never in client code or git | closed | index.ts reads `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. The CI grep covers src and app. **Removed from EAS entirely** (the `eas env:list` names show no SERVICE_ROLE var in any environment) |
| T-00-09-04 | T | fx_rates writes by clients | mitigate | Writes revoked. pgTAP 42501 | closed | 20260922000300:24-25. 04_fx_rates.test.sql throws_ok 42501. Live: anon has no privileges and authenticated has select only |
| T-00-09-05 | D | Frankfurter outage | accept | Job fails and retries the next day | closed | See AR-05. Since then, Phase 1 added a fallback source (sync.ts:66-75, open.er-api) |

### 00-10: Session storage and wipe

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-10-01 | I | Session at rest | mitigate | AES-256-CTR. Key in SecureStore WHEN_UNLOCKED_THIS_DEVICE_ONLY | closed | largeSecureStore.ts: 32-byte key, `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, ciphertext in AsyncStorage. client.ts uses `storage: new LargeSecureStore()` |
| T-00-10-02 | I | CTR nonce reuse | mitigate | Fresh 16-byte CSPRNG IV per write. Test | closed | setItem uses `new Uint8Array(16)` with `crypto.getRandomValues`. largeSecureStore.test.ts:58-72 asserts different ciphertexts and IVs |
| T-00-10-03 | T | CTR malleability | accept | Needs local device compromise. A corrupt blob returns null. GoTrue rejects mangled tokens | closed | See AR-06. getItem format check plus catch leads to removeItem and null |
| T-00-10-04 | I | Residual data after sign-out | mitigate | wipeDeviceData clears SecureStore keys, `fincwin:` keys and handlers | closed | services/storage/wipe.ts wipeDeviceData. Every AsyncStorage key in src uses the `fincwin:` prefix (auth, query-cache, failed-writes, last-synced-at, pending-apple-profile, theme). wipe.test.ts |
| T-00-10-05 | S | Weak randomness | mitigate | react-native-get-random-values before crypto. Never Math.random | closed | Imported first in largeSecureStore.ts:8 and client.ts:4. No `Math.random` in src or app outside tests. The nonce uses expo-crypto |

### 00-11: Theme

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-11-01 | T | fincwin:theme cache | mitigate | Validate against enums. Invalid values fall back to defaults | closed | theme/themeCache.ts readThemeCache: isAccentKey / isFontPairingKey, try/catch returns DEFAULTS |
| T-00-11-02 | I | theme cache contents | accept | Two enum values only. Wiped via the prefix | closed | See AR-07. Key `fincwin:theme` |

### 00-12: i18n copy

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-12-01 | R | Catalogue copy | mitigate | Test forbids advice/recommend/"you should" and on-device claims | closed | i18n/__tests__/catalogue.test.ts:35 `FORBIDDEN_VOICE`, applied to every leaf (:46-48) |
| T-00-12-02 | T | Interpolation injection | mitigate | Only numeric {{count}}. RN Text renders no HTML, so escapeValue:false is safe | closed | i18n/index.ts:29 `escapeValue: false`. No WebView, `dangerouslySetInnerHTML` or react-native-webview in src, app or package.json, so there is no HTML sink. Drift: Phase 1 added string interpolations ({{code}}, {{example}}, {{reference}} and others), so the invariant "only {{count}}" no longer holds. The load-bearing control (no HTML rendering) does. Re-assess if a WebView or rich-text renderer is ever added |

### 00-13: Analytics

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-13-01 | I | Pre-consent capture | mitigate | defaultOptIn:false, optOut() at init, service gate. Test | closed | posthog.ts: `defaultOptIn: false`, `void client.optOut()`, `if (!enabled) return`. consentGate.test.ts:44-50 |
| T-00-13-02 | I | Financial data in events | mitigate | Compile-time finite-literal guard | closed | analytics/catalogue.ts `CATALOGUE_IS_FINITE: AssertAll<EventCatalogue>`. The typecheck fixture is catalogue.typecheck.ts, and CI runs typecheck |
| T-00-13-03 | I | Identity leakage | mitigate | identify(uuid) only, validated by regex, no properties | closed | posthog.ts `SUPABASE_UUID` regex, then `client.identify(userId)` with one argument. consentGate.test.ts:53-64 |
| T-00-13-04 | I | Session replay | mitigate | No plugin. enableSessionReplay:false. Project replay off | closed | posthog.ts `enableSessionReplay: false`. No plugin installed. Live PostHog project API: `session_recording_opt_in = false` |
| T-00-13-05 | I | Cross-user identity | mitigate | disable() resets identity. Sign-out calls it | closed | posthog.ts disable() runs `optOut()` then `reset()`. signOut.ts performSignOut calls `analytics.disable()` first |
| T-00-13-06 | I | Data residency | mitigate | EU host enforced | closed | env.ts EU_POSTHOG_HOST enforcement (see T-00-05-02) |

### 00-14: EAS

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-14-01 | I | Service-role key in EAS | mitigate | Secret visibility, no EXPO_PUBLIC_ prefix, no client reads | closed | Stronger than planned: the key was **removed from EAS** on 2026-09-25 (.env.example comment). Live `eas env:list` shows no service-role var in development, preview or production. The CI grep covers client code |
| T-00-14-02 | T | Incompatible OTA | mitigate | Fingerprint runtime policy | closed | app.config.ts `runtimeVersion: { policy: 'fingerprint' }` |
| T-00-14-03 | D | Bad OTA shipped | mitigate | Documented, rehearsed rollback runbook | closed | docs/ops/ota-policy.md:37 (staged), :51-56 (republish), :61-66 (roll-back-to-embedded), :89 rehearsal log |
| T-00-14-04 | T | Signing key loss or leak | mitigate | EAS-held keystore. `*.keystore` gitignored | closed | .gitignore `*.keystore`, `*.p8`, `*.p12`. None tracked. 00-14 SUMMARY:69 EAS remote-generated keystore |
| T-00-14-05 | E | Wrong env config in a build | mitigate | Each profile bound to one EAS environment | closed | eas.json development, preview and production each set `environment` to match. Live: `EXPO_PUBLIC_APP_ENV` is scoped to exactly one environment each. Other vars are shared by design, because there is a single (production) Supabase project |

### 00-15: Sign-in (Apple / Google)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-15-01 | S | Apple ID-token replay | mitigate | Fresh nonce per attempt. Hashed to Apple, raw to Supabase. GoTrue verifies | closed | apple.ts: `createNonce()` per call, `nonce: hashed` to Apple, `nonce: raw` to signInWithIdToken. No client-side token verification. Note: nonce.ts concatenates two v4 UUIDs, which gives **~244 bits** of randomness, not the 256 that auth-providers.md:71 states. Adequate for replay protection, but correct the doc |
| T-00-15-02 | S | Google ID-token replay without nonce | accept | Short-lived, audience-bound, verified by GoTrue | closed | See AR-08. google.ts header comment. auth-providers.md:69-85. Live: `external_google_skip_nonce_check = null` (not enabled) |
| T-00-15-03 | S | Code interception on the Android deep link | mitigate | PKCE | closed | client.ts `flowType: 'pkce'`. apple.ts Android uses `exchangeCodeForSession` |
| T-00-15-04 | T | Open redirect | mitigate | `uri_allow_list` = `fincwin://auth-callback` | closed | Live Management API: `uri_allow_list = "fincwin://auth-callback"` |
| T-00-15-05 | I | Loss of Apple name/email | mitigate | Written before sign-in resolves, persisted and retried, never nulled | closed | firstAuthProfile.ts (patch includes only non-empty fields, queued on failure). apple.ts awaits it. AuthProvider.tsx:46 retries at launch |
| T-00-15-06 | I | Google web client secret | mitigate | Only in .env.local and Supabase config | closed | .env.example has an empty `GOOGLE_WEB_CLIENT_SECRET=`. Not in EAS (env:list). No `GOCSPX-` in the tree or history. Live: the secret is set in Supabase. The secret was exposed in a session transcript and **rotated** (00-15 SUMMARY:143) |

### 00-16: Error reporting

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-16-01 | I | Financial data in errors | mitigate | scrubMessage redaction. Locals dropped. Tested | closed | errors/scrub.ts (emails, quoted strings, currency amounts, decimals, 4+ digit runs, 200-character cap; frame allow-list excludes `vars` and context lines). errorReporter.ts `beforeSend` and `beforeBreadcrumb` (which drops `data`). scrub.test.ts. Residual: bare integers of up to 3 digits without a currency symbol pass through |
| T-00-16-02 | I | Crash data tied to identity | mitigate | Never identify/setUser. sendDefaultPii false | closed | errorReporter.ts `sendDefaultPii: false`. No `setUser` anywhere in src or app (errorReporter.test.ts:39-41 asserts it). Separate from the PostHog analytics client |
| T-00-16-03 | R | Always-on crash reports without consent | accept | Legitimate interest (D-18). Re-verify at Compliance | closed | See AR-09. docs/decisions/error-tracking.md:42 |
| T-00-16-04 | I | Source-map upload token | mitigate | Only in .env.local and secret EAS vars | closed | Live `eas env:list`: `SENTRY_AUTH_TOKEN` has SECRET visibility in all three environments. app.config.ts does not pass authToken. Hygiene: a leftover `POSTHOG_CLI_API_KEY` (SECRET) plus `POSTHOG_CLI_HOST` and `POSTHOG_CLI_PROJECT_ID` remain in the **preview** environment from the abandoned PostHog source-map path. They are compliant with the control but unused, so delete them and revoke the key |
| T-00-16-05 | T | Spike code shipped | mitigate | Env-flag gate, env var deleted, code removed with a grep gate | closed | `grep EXPO_PUBLIC_ERROR_SPIKE\|maybeFireSpikeError` in src and app finds only a scrub test fixture string. EXPO_PUBLIC_ERROR_SPIKE is absent from all EAS environments. No FINCWIN_SENTRY_PROBE code remains |

### 00-17: App shell, version gate, sign-in UI

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-17-01 | D | Version gate blocking on network failure | mitigate | Fail open, 3 s timeout | closed | features/system/minVersion.ts `DEFAULT_TIMEOUT_MS = 3000`. Every failure path returns null (header comment and minVersionGate.test.ts) |
| T-00-17-02 | T | Client bypass of the version gate | accept | UX enforcement only | closed | See AR-10 |
| T-00-17-03 | D | Stuck splash | mitigate | 5 s hard timeout, then render and report | closed | app/_layout.tsx:30 `SPLASH_TIMEOUT_MS = 5000`, :53-57 captureError on timeout |
| T-00-17-04 | S | Double sign-in submissions | mitigate | Buttons disabled while in flight | closed | WelcomeScreen.tsx `busy` state, `disabled={busy}` (Google) and `busy={busy}` (Apple: `disabled = !enabled \|\| busy`). This is React-state based, so a same-frame double tap is theoretically possible. The native auth sheets are modal |
| T-00-17-05 | I | Error text leaking provider details | mitigate | Generic localised error. Details go to the scrubbed reporter | closed | WelcomeScreen.tsx:37-41 `captureError(e, { area: 'auth' })` and shows only `t('auth.error.signInFailed')` |

### 00-18: Sign-out, consent, profile

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-18-01 | I | Residual data after sign-out | mitigate | performSignOut wipes everything, even offline | closed | signOut.ts performSignOut: signOut errors are caught, then wipeDeviceData() runs. signOut.test.ts:68-72 covers the offline case |
| T-00-18-02 | I | Analytics identity carried over | mitigate | disable() before signOut. Consent re-read per user | closed | signOut.ts runs `analytics.disable()` before `auth.signOut`. useConsent reads the profile of the current user |
| T-00-18-03 | R | Proof of consent | mitigate | analytics_consent + _at stored server-side | closed | profiles columns (20260922000100:50-51). useConsent.ts:46 `.update({ analytics_consent, analytics_consent_at })` |
| T-00-18-04 | T | Tampering with other profiles | mitigate | RLS own-row + column grants. Send only changed columns | closed | See T-00-06-03. useProfile.ts:119 and :135 send single-column updates. useConsent sends two columns |
| T-00-18-05 | R | Dark-pattern consent | mitigate | Equal buttons, no pre-selection, changeable in settings. Test | closed | ConsentScreen.test.tsx:67-81 (equal width, minHeight and padding; none selected). YouScreen.tsx:100 AnalyticsToggle |

### 00-19: Production acceptance

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-00-19-01 | T | Prod schema drift | mitigate | Git migrations only, preflight, dry-run | closed | Preflight script (T-00-03-02). Live `supabase_migrations.schema_migrations` matches the 11 tracked files exactly, so there is no drift. The FND-10 migration-compat gate runs in CI |
| T-00-19-02 | E | FX_SYNC_SECRET | mitigate | Single 32-byte random secret, never in git | closed | Checked without printing: .env.local value is 64 hex characters (32 bytes). The Vault reference is only in the migration. gitleaks and CI |
| T-00-19-03 | D | min_supported_version left raised | mitigate | Test update reverted in the same step | closed | Live public REST with the publishable key: `min_supported_version = "0.1.0"` (matches app.config.ts `version`) |
| T-00-19-04 | I | Test account data | accept | Test user on prod. No real financial data in Phase 0 | closed | See AR-11 (rationale drift noted) |

---

## Open Threats

| Threat ID | Category | Severity | Missing Mitigation | Where Checked | Suggested Action |
|-----------|----------|----------|--------------------|---------------|------------------|
| T-00-01-03 | S | Medium | No DMARC record on **fincwin.com**, the product domain that sends `no-reply@` and publishes `support@` in both store listings. SPF and DKIM are present | Public DNS (`_dmarc.fincwin.com` TXT on 8.8.8.8 and 1.1.1.1), docs/enrolment/email-setup.md:44 | Add `_dmarc.fincwin.com TXT "v=DMARC1; p=none; rua=..."` in Cloudflare, as already done for leadstrategy.ca, then update email-setup.md |
| T-00-03-04 | S | Low | The DB password is not the declared 24-byte CSPRNG value (16 characters of base64url) and its generation cannot be verified | .env.local length and charset only (value never printed), 00-03 PLAN and SUMMARY | Reset the DB password to `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` through Dashboard or the Management API, and update .env.local. Otherwise re-disposition to `accept` with a rationale |

Neither open threat is rated High, so under `block_on: high` neither blocks the phase. Both remain open until fixed or formally accepted.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-00-01-04 | D&B record mismatches are corrected at D&B, not in code. The check is recorded with a date (apple-org-checklist.md:7, "Checked 2026-09-22: not yet verifiable, D-U-N-S has not been issued"). Still holds, but the check must be redone once the D-U-N-S issues (ETA 2026-10-13) | Plan 00-01 threat model (owner) | 2026-09-22 |
| AR-02 | T-00-02-04 | Continuous Native Generation: /android and /ios are gitignored, so native code comes only from config plugins. This is the standard Expo managed risk profile. Holds (.gitignore, `git ls-files`) | Plan 00-02 | 2026-09-26 |
| AR-03 | T-00-03-03 | Database hosted in US West (D-22). EU users are covered by Supabase's DPA/SCCs, which the privacy policy must state (supabase-environments.md:14-18). Holds. The privacy-policy disclosure is a Compliance-phase deliverable | Plan 00-03 / D-22 | 2026-09-26 |
| AR-04 | T-00-04-01 | The debug SHA-1 is public by nature (the Expo template keystore). Store builds are signed by the EAS-managed keystore (00-14). Holds | Plan 00-04 | 2026-09-26 |
| AR-05 | T-00-09-05 | A Frankfurter outage means the daily job fails and retries. Phase 1 has since added an open.er-api fallback (MON-12), so this is lower risk than when accepted | Plan 00-09 | 2026-09-26 |
| AR-06 | T-00-10-03 | AES-CTR has no MAC. Tampering requires local device compromise that already defeats the app sandbox. A malformed blob is discarded, and GoTrue rejects any mangled token server-side. Holds | Plan 00-10 | 2026-09-26 |
| AR-07 | T-00-11-02 | The theme cache holds two enum values, no personal data, and is wiped via the `fincwin:` prefix. Holds | Plan 00-11 | 2026-09-26 |
| AR-08 | T-00-15-02 | The installed Google Sign-In SDK has no nonce parameter. The ID token is short-lived (~1h), audience-bound, and verified by GoTrue. Documented in auth-providers.md:69-85. Skip-nonce-check is not enabled. Holds. Revisit if the SDK gains nonce support | Plan 00-15 / auth-providers.md | 2026-09-26 |
| AR-09 | T-00-16-03 | Always-on scrubbed crash reporting under legitimate interest (D-18). Must be disclosed in the privacy policy and re-verified at Compliance (error-tracking.md:42). Holds pending Compliance | Plan 00-16 / D-18 | 2026-09-26 |
| AR-10 | T-00-17-02 | The minimum-version gate is UX enforcement only. The real guarantee is schema compatibility with the oldest supported version (PROJECT.md key decision, FND-10 migration-compat gate in CI). Holds | Plan 00-17 | 2026-09-26 |
| AR-11 | T-00-19-04 | The test user lives on the production project. **Rationale drift:** "no real financial data exists" was true for Phase 0, but Phase 1 (money core) has since run acceptance on production with the same account. The data is still test data, not a real person's finances, so the acceptance holds. Purge test accounts before public launch | Plan 00-19 | 2026-09-26 |

---

## Unregistered Flags

No executed SUMMARY.md contains a `## Threat Flags` section. The items below came from SUMMARY deviations and live checks, and no Phase 0 threat ID covers them:

| Flag | Source | Mapping | Note |
|------|--------|---------|------|
| Sentry org is **US region**, not EU | 00-16 SUMMARY:157, error-tracking.md:40,76 | None. T-00-13-06 covers PostHog residency only | Owner decision 2026-09-25 to keep US under DPA/SCCs, recorded in dependency-register.md:26. Add a threat or accepted-risk entry and list Sentry as a US sub-processor at Compliance |
| Google web client secret surfaced in an executor transcript | 00-15 SUMMARY:143 | T-00-15-06 (informational) | Rotated. Supabase holds only the new value |
| Supabase Auth email provider enabled (`external_email_enabled = true`, `site_url = http://localhost:3000`) on production | Live auth config (read-only) | None | The app offers only Apple and Google. Email signup is an unused public signup path (confirmation required, `mailer_autoconfirm = false`). Consider disabling it and setting a real site_url |
| Stale `POSTHOG_CLI_*` vars (one SECRET) in the EAS preview environment | Live `eas env:list` | T-00-16-04 (informational) | Delete them and revoke the PostHog key |

---

## Not Yet Executed (excluded from counts)

| Plan | Threats | Status |
|------|---------|--------|
| 00-07 | T-00-07-01 (R, website claims), T-00-07-02 (I, enrolment docs), T-00-07-03 (S, entity type) | Plan not executed. Audit when its SUMMARY exists |
| 00-20 | T-00-20-01 (I, SIWA .p8), T-00-20-02 (D, client-secret expiry), T-00-20-03 (S, audience confusion), T-00-20-04 (T, provisioning profile), T-00-20-05 (I, private-relay email, accept) | Plan not executed. Live check shows `external_apple_enabled = false`. `*.p8` is already gitignored |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-26 | 81 (70 mitigate, 11 accept) | 79 | 2 (T-00-01-03 Medium, T-00-03-04 Low) | gsd-security-auditor (Claude) |

Count note: the plan threat models declare **11** `accept` dispositions and **70** `mitigate` (total 81), not 13/68. Every accept row across 00-01…00-19 was enumerated.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending (2 open threats, neither at or above the `block_on: high` threshold)
