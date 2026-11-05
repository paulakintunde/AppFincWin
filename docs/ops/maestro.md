# Maestro robot flows (05.4-34, BO-03)

Three flows in `.maestro/` drive the real app on an Android phone or emulator:

| Flow | Checks |
|------|--------|
| `back-stays-short.yaml` | APP-11: a sheet closes on Back, a screen opened twice from the same control leaves on one Back each, and Back returns to Activity. Read-only |
| `save-offline.yaml` | A line added in airplane mode shows "queued", saves once the network is back, and leaves nothing under "Changes that couldn’t save" |
| `record-as-bought.yaml` | The dev harness records a sample purchase as bought; Activity shows it; the change is undone |

There is one Supabase project and it is production. The two flows that write undo what they add (History > Undo to here), so no test rows stay.
Sign in as the **sample (demo) data account** (owner, D-129) before running.

CI does not run these flows in 05.4: they need a device and a dev client.

## Install (Windows)

1. Java 17 must be on PATH (`java -version`).
2. Download the latest CLI zip: https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip
3. Unzip to `%USERPROFILE%` so the CLI is `%USERPROFILE%\maestro\bin\maestro.bat`.
4. Put it on PATH for the session (Git Bash: `export PATH="$PATH:$USERPROFILE/maestro/bin"`), then `maestro --version` (2.12.1 on 2026-11-05).

## Device and dev client

1. `adb devices` lists the phone (Pixel 9: 55240DLAQ000EQ) or a running emulator.
2. Install a development build (EAS profile `development`, built from a checkout with its own real node_modules, e.g. `C:/dev/fincwin-w1`).
   `adb install -r <apk>` keeps the app's data when the signing key matches. On a signature mismatch, stop: do not uninstall.
3. Start Metro from the worktree with `--clear` (the Windows file watcher goes stale in long sessions):
   `npx expo start --dev-client --port 8076 --clear`
4. `adb -s <serial> reverse tcp:8076 tcp:8076`, then open the dev client at 127.0.0.1 (never `localhost`):
   `MSYS_NO_PATHCONV=1 adb -s <serial> shell am start -a android.intent.action.VIEW -d "exp+fincwin://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8076" com.fincwin.app`
5. Sign in as the sample data account and wait for Home to load.

## Run

```
maestro --device <serial> test .maestro/
```

One flow: `maestro --device <serial> test .maestro/save-offline.yaml`. Shared steps live in `.maestro/common/` and are not run on their own.

## Engine timing (APP-04)

The same dev harness screen (`fincwin://decide/dev-harness`, dev or `EXPO_PUBLIC_PERF=1` builds only) times the engine.
For figures close to a store build, load release-mode JS into the dev client:

```
EXPO_PUBLIC_PERF=1 npx expo start --dev-client --port 8076 --clear --no-dev --minify
```

Open the harness, tap "Run 200 checks" three times, and read p50 / p95 for each run on screen (read them with
`maestro hierarchy` or a screenshot). The `[perf] judgeCheck ...` line goes to the Metro log in dev mode only; release-mode JS
did not forward it on 2026-11-05. Budget: judgeCheck p95 under 8 ms. The Record-as-bought harness does not show in this mode
(`__DEV__` is false), by design.

When done, stop Metro's node process by its port (stopping the shell task leaves node running).
