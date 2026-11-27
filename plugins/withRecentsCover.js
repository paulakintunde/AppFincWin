// 10-30 (DSG-08, D-04; 10-RESEARCH Pattern 2 native fallback): the JS AppCover loses the race on Android. The
// app-switcher picture is taken before React draws the cover (seen on the Pixel 9, device check steps 1-2), so the
// phone would show the person's figures. Android 13+ (API 33): Activity.setRecentsScreenshotEnabled(false), so no
// picture is kept at all and screenshots still work. Older Android: FLAG_SECURE only while the app is paused (never
// permanent; 10-RESEARCH: a permanent FLAG_SECURE blocks the person's own screenshots and store captures).
// iOS keeps the JS AppCover ('inactive' arrives before the snapshot there).
const { withMainActivity } = require('expo/config-plugins');

const MARK = '// 10-30 (D-04): recents cover';

const IMPORTS = ['import android.view.WindowManager'];

const ON_CREATE = `    ${MARK}: no app-switcher picture on Android 13+.
    if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false)`;

const PAUSE_RESUME = `
  ${MARK}: before Android 13, hide the window only while paused.
  override fun onPause() {
    if (Build.VERSION.SDK_INT < 33) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    if (Build.VERSION.SDK_INT < 33) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
  }
`;

/** Pure text change on the generated Kotlin MainActivity. Idempotent; throws if the anchors are gone. */
function addRecentsCover(src) {
  if (src.includes(MARK)) return src;
  let out = src;
  for (const line of IMPORTS) {
    if (!out.includes(line)) out = out.replace(/^(package [^\n]+\n)/, `$1${line}\n`);
  }
  if (!out.includes('import android.os.Build')) out = out.replace(/^(package [^\n]+\n)/, '$1import android.os.Build\n');
  const superCall = /(\n[ \t]*super\.onCreate\([^)]*\)\n)/;
  if (!superCall.test(out)) throw new Error('withRecentsCover: super.onCreate(...) not found in MainActivity');
  out = out.replace(superCall, `$1${ON_CREATE}\n`);
  const classOpen = /(class MainActivity\s*:\s*ReactActivity\(\)\s*\{\n)/;
  if (!classOpen.test(out)) throw new Error('withRecentsCover: MainActivity class not found');
  out = out.replace(classOpen, `$1${PAUSE_RESUME}\n`);
  return out;
}

function withRecentsCover(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error('withRecentsCover: expected a Kotlin MainActivity');
    cfg.modResults.contents = addRecentsCover(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withRecentsCover;
module.exports.addRecentsCover = addRecentsCover;
