# Auth providers

ACC-01/ACC-02, ENV-06/ENV-07, D-11: Apple and Google sign-in configuration. Client
IDs only below — never a secret value. Secrets live in `.env.local` (gitignored)
and in the Supabase production project's auth config (set via the Management API,
never the dashboard, so the change is auditable through this repo's history and
session logs rather than a UI click nobody recorded).

## Google Cloud project

One Google Cloud project ("FincWin", company org, D-08), OAuth consent screen
External, app name FincWin, scopes `openid`/`email`/`profile`.

Three OAuth clients:

| Client | Type | Identifier | Notes |
|---|---|---|---|
| FincWin Supabase | Web application | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`.env.local`) | Authorized redirect URI: `https://cohmcbdfgqmiwykztrdg.supabase.co/auth/v1/callback`. Configured in `google.ts` as `GoogleSignin.configure({ webClientId })` — the Google Sign-In SDK issues both iOS's and Android's ID token audienced to this client, so this is the *primary* client ID Supabase's Google provider validates against |
| FincWin iOS | iOS | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (`.env.local`) | Bundle ID `com.fincwin.app`. Drives the native iOS presentation; `GOOGLE_IOS_URL_SCHEME` (`.env.local`) is its reversed-DNS form, wired into `app.config.ts`'s iOS URL scheme |
| FincWin Android | Android | `GOOGLE_ANDROID_CLIENT_IDS` (`.env.local`) — **one client created so far** | Package `com.fincwin.app`. Registered against one of the two SHA-1s below; **a second Android client for the other SHA-1 is still pending** (see below) |

### Android signing fingerprints (not secret)

Two Android signing certificates need their own OAuth client (Google's Android
client registration is keyed to package + SHA-1, one client per certificate):

- **Debug** (local `expo run:android`): `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (`docs/dev-setup.md`)
- **EAS development-profile keystore**: `0C:D1:82:F5:0B:1A:C9:C7:14:F0:06:B6:00:B3:D9:CC:53:01:B6:3B` (`docs/ops/ota-policy.md`)

**Status: one Android OAuth client exists, covering one of the two SHA-1s above
(not confirmed which in this record — see the TODO comment next to
`GOOGLE_ANDROID_CLIENT_IDS` in `.env.local`). The client for the other SHA-1 is
still pending** — create it in Google Cloud Console (same package, the
not-yet-covered SHA-1), then append its client ID to `GOOGLE_ANDROID_CLIENT_IDS`
in `.env.local` (comma-separated) and re-run the Supabase auth PATCH below with
the updated `external_google_additional_client_ids` value. Until then, Google
sign-in on whichever build variant used the not-yet-registered SHA-1 will fail
at the OAuth consent step (a `DEVELOPER_ERROR`/`10` from the native SDK, not a
Supabase-side failure).

## Supabase Google provider (production)

Set via the Supabase Management API (`PATCH /v1/projects/{ref}/config/auth`),
never the dashboard:

```bash
set -a; source .env.local; set +a
curl -X PATCH "https://api.supabase.com/v1/projects/${SUPABASE_PROD_PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"external_google_enabled\":true,\"external_google_client_id\":\"${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}\",\"external_google_additional_client_ids\":\"${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID},${GOOGLE_ANDROID_CLIENT_IDS}\",\"external_google_secret\":\"${GOOGLE_WEB_CLIENT_SECRET}\",\"uri_allow_list\":\"fincwin://auth-callback\"}"
```

Live as of this record:
- `external_google_enabled`: `true`
- `external_google_client_id`: the web client ID (primary audience)
- Google's own SDK merges the `external_google_additional_client_ids` input into
  the same underlying accepted-audience list at write time — a GET afterward
  returns the full merged list back under `external_google_client_id` alone, and
  `external_google_additional_client_ids` reads back empty. This is normal:
  verified live against the Management API in this session, not assumed from
  docs. Re-run the PATCH above (full body, not a partial one) whenever any
  client ID changes, rather than trying to append incrementally.
- `external_google_secret`: set to the **rotated** web client secret (the
  original was briefly visible in an executor session's tool-call transcript —
  see Deviations in `00-15-SUMMARY.md` — so it was rotated in Google Cloud
  Console and the old value is no longer valid; Supabase holds only the new one)
- `uri_allow_list`: `fincwin://auth-callback` — the one redirect URI the D-11
  Android Apple-sign-in web-OAuth flow and any Google web-OAuth fallback are
  allowed to return to (T-00-15-04, open-redirect mitigation)

## Nonce decision (T-00-15-01 / T-00-15-02)

- **Apple**: a fresh 256-bit nonce per attempt (`src/services/auth/nonce.ts`).
  The SHA-256 hash goes to Apple's native `signInAsync`; the raw value goes to
  `supabase.auth.signInWithIdToken` (it hashes and compares server-side). GoTrue
  verifies the nonce and signature; nothing is verified client-side
  (T-00-15-01, mitigated).
- **Google**: the installed `@react-native-google-signin/google-signin` version
  (16.1.5)'s "Original Google Sign In" `signIn()` takes a `SignInParams` that
  only carries `loginHint` — verified directly against the installed package's
  own `.d.ts`, not assumed from docs. It has no nonce parameter, so `google.ts`
  sends no nonce to either Google or Supabase. This is the accepted residual
  risk **T-00-15-02**: the ID token is still short-lived (~1h), audience-bound
  to the client IDs configured above, and verified server-side by GoTrue: replay
  is bounded by the token's own lifetime, not by a nonce. No "Skip nonce checks"
  toggle was needed on the Supabase side — Supabase accepts an ID token with no
  `nonce` claim when the sign-in call itself passes no `nonce` parameter, which
  is exactly what `google.ts` does.

## Redirect URLs in use

- `fincwin://auth-callback` — the app's own deep link, used by `apple.ts`'s
  Android web-OAuth flow (`Linking.createURL('auth-callback')`) and allow-listed
  above.
- `https://cohmcbdfgqmiwykztrdg.supabase.co/auth/v1/callback` — Supabase's own
  GoTrue callback, registered on the **Web** Google OAuth client only (Google
  redirects here first; GoTrue then completes the exchange and, for the native
  ID-token flows this app actually uses, this URI is never hit by the client at
  all — it exists because Google's Cloud Console requires a Web client to
  declare at least one authorized redirect URI).
