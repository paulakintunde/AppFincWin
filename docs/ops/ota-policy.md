# OTA update policy

FND-11: a JS-only OTA update can never reach a binary built with different native code, and a bad update can always be rolled back. This document is the runbook.

## Runtime version policy: fingerprint

`app.config.ts` sets:

```ts
runtimeVersion: { policy: 'fingerprint' }
```

The runtime version is a hash of the native project (installed native modules, config plugins, Expo SDK version, and other inputs that would require a new binary). Any native change — a new native module, a config plugin change, an SDK bump — produces a new runtime version fingerprint. EAS Update only serves an update to a running app whose embedded runtime version fingerprint matches the update's. A JS-only fix can go out immediately as `eas update`; anything that changes native code needs a new store/internal build.

This is the reason `eas.json` has no `runtimeVersion` overrides in any build profile — the policy lives once, in `app.config.ts`, and applies identically to every profile.

## Channels

Channels map 1:1 to the three build profiles, and each channel's branch name equals the channel name:

| Build profile | Channel | Branch | EAS environment |
|---|---|---|---|
| `development` | `development` | `development` | `development` |
| `preview` | `preview` | `preview` | `preview` |
| `production` | `production` | `production` | `production` |

A build made with a given profile only ever receives updates published to the matching channel.

## Publishing an update

```bash
eas update --channel production --environment production --message "<why>"
```

Always pass `--environment` explicitly — SDK 55+ requires it for the server-side EAS environment variables used during the JS bundling step (confirmed via `eas update --help` on eas-cli 24.7.0). Use the matching channel name (`development` / `preview` / `production`) for `--channel`, and its identically-named EAS environment for `--environment`.

### Staged rollout

For a risky change, roll it out gradually rather than to 100% of the channel's users at once:

```bash
eas update --channel production --environment production --message "<why>" --rollout-percentage 10
```

Confirmed available on eas-cli 24.7.0 (`eas update --help`). Users not yet in the rollout keep receiving the previous update on the branch until the rollout completes or is adjusted.

## Rolling back a bad update

Two mechanisms, in order of preference:

### (a) Republish the last known-good update group

```bash
eas update:list --branch production --json --non-interactive
# find the last good group's id, then:
eas update:republish --group <last-good-group-id> --message "rollback: <reason>"
```

This publishes a new update group with the same content as the good one, so `update:list` shows it as the latest entry on the branch. Clients pick it up on next launch (see below).

### (b) Roll back to the embedded update

If no prior published update is safe to return to (e.g. the first update on a channel was the bad one), send users back to the JS bundle that was embedded in their binary at build time:

```bash
eas update:roll-back-to-embedded --branch production --runtime-version <fingerprint>
```

`<fingerprint>` is the runtime version fingerprint of the affected binary (visible via `eas build:view <id>` or `eas channel:view production`).

### How clients pick up a rollback

`app.config.ts` sets `checkAutomatically: 'ON_LOAD'` and `fallbackToCacheTimeout: 0`, so every cold launch checks the channel for a newer update before rendering and applies it before the next launch if found. There is no manual "check for updates" step for the user — the rollback reaches every device on its next app open.

## Compatibility rule

Server/schema changes must stay compatible with the oldest app version still in the wild, because users are never forced to update. When compatibility can no longer be preserved, raise `app_config.min_supported_version` (the Supabase table from D-25, FND-09) through a migration, gating access below that version rather than breaking it silently.

## Signing fingerprints (not secret)

The EAS-managed Android development-profile keystore's SHA-1, used to register the corresponding Google OAuth Android client (00-15):

```
0C:D1:82:F5:0B:1A:C9:C7:14:F0:06:B6:00:B3:D9:CC:53:01:B6:3B
```

(Recorded by plan 00-14, Task 3: extracted from the first development build's signed APK with `apksigner verify --print-certs`, since `eas credentials -p android` is an interactive-only command with no non-interactive/JSON output and no terminal was available to drive it. The APK's V2 signing certificate is the same EAS-managed keystore `eas build` used, confirmed via `eas credentials:configure-build -p android -e development`, which reported the same default keystore (`Build Credentials YtgRmMpKrz`) already in use for the profile. Build id `fd9507cd-c285-454b-925e-582ae57766c8`.)

## OTA rollback rehearsal log (00-14, Task 3)

Rehearsed on the `preview` channel only — production was never touched. `eas update` publishes one update group per runtime version present in the project (iOS and Android currently have different fingerprints), so each rehearsal step below produced two groups.

| Step | Platform | Runtime version (fingerprint) | Update group ID | Published |
|---|---|---|---|---|
| A: `eas update --channel preview --environment preview --message "ota rehearsal A"` | iOS | `a174a964a565615a210545c5ba600a516b6265f0` | `fce7ed96-383e-4154-881f-a8669f2d885b` | 2026-09-25 08:01 UTC |
| A | Android | `fd79e9f41968c777aabe6dde888595cab674463d` | `b81a6c20-8f95-471d-9c4d-d900cdfe5a10` | 2026-09-25 08:01 UTC |
| B (bad): `eas update --channel preview --environment preview --message "ota rehearsal B (bad)"` | iOS | `a174a964a565615a210545c5ba600a516b6265f0` | `2903787c-3a46-46b8-9a55-b08e5720ca41` | 2026-09-25 08:03 UTC |
| B (bad) | Android | `fd79e9f41968c777aabe6dde888595cab674463d` | `96e1149e-31b2-4ecf-b045-ffb4ba05909c` | 2026-09-25 08:03 UTC |
| Rollback: `eas update:republish --group <A> --message "rollback to A"` | iOS | `a174a964a565615a210545c5ba600a516b6265f0` | `2b314aab-b6c3-4911-8153-750c2792a496` | 2026-09-25 08:05 UTC |
| Rollback | Android | `fd79e9f41968c777aabe6dde888595cab674463d` | `17cb2042-7a44-4e88-bb4d-51edd89b6335` | 2026-09-25 08:05 UTC |

Confirmed with `eas update:list --branch preview --json --non-interactive`: the most recent entry on each platform is `"rollback to A"`, published after the deliberately-bad `"ota rehearsal B (bad)"` update — proving a bad update on this channel can always be superseded by republishing the last known-good group.
