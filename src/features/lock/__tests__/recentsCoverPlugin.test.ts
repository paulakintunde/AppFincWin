// 10-30 (D-04): the Android recents cover config plugin edits the generated MainActivity correctly and only once.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addRecentsCover } = require('../../../../plugins/withRecentsCover') as { addRecentsCover: (s: string) => string };

const MAIN = `package com.fincwin.app
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}
`;

describe('withRecentsCover (10-30, D-04)', () => {
  it('turns off the recents picture on Android 13+ right after super.onCreate', () => {
    const out = addRecentsCover(MAIN);
    expect(out).toMatch(/super\.onCreate\(null\)\n\s*\/\/ 10-30[^\n]*\n\s*if \(Build\.VERSION\.SDK_INT >= 33\) setRecentsScreenshotEnabled\(false\)/);
  });

  it('uses FLAG_SECURE only while paused, and only before Android 13', () => {
    const out = addRecentsCover(MAIN);
    expect(out).toContain('import android.view.WindowManager');
    expect(out).toMatch(/override fun onPause\(\) \{\n\s*if \(Build\.VERSION\.SDK_INT < 33\) window\.addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
    expect(out).toMatch(/override fun onResume\(\) \{\n\s*super\.onResume\(\)\n\s*if \(Build\.VERSION\.SDK_INT < 33\) window\.clearFlags/);
    expect(out).not.toMatch(/onCreate[\s\S]*addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)[\s\S]*getMainComponentName/);
  });

  it('is idempotent', () => {
    const once = addRecentsCover(MAIN);
    expect(addRecentsCover(once)).toBe(once);
  });

  it('adds the Build import when the template lacks it', () => {
    const out = addRecentsCover(MAIN.replace('import android.os.Build\n', ''));
    expect(out).toContain('import android.os.Build');
  });

  it('fails loudly when the template changes shape', () => {
    expect(() => addRecentsCover(MAIN.replace('super.onCreate(null)', 'foo()'))).toThrow(/super\.onCreate/);
    expect(() => addRecentsCover(MAIN.replace('class MainActivity : ReactActivity() {', 'class Other {'))).toThrow(/class/);
  });
});
