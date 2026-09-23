// ANL-04: defence-in-depth proof that session replay is unreachable from this codebase, not
// just disabled at runtime — the plugin package is never even a dependency.
import fs from 'fs';
import path from 'path';

const packageJson = fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8');
const posthogSource = fs.readFileSync(path.resolve(__dirname, '../posthog.ts'), 'utf8');

describe('analytics config (ANL-04, ANL-02 defence in depth)', () => {
  it('has no session-replay or react-native-plugin dependency in package.json', () => {
    expect(packageJson).not.toMatch(/session-replay|react-native-plugin/);
  });

  it('posthog.ts source disables session replay and app-lifecycle autocapture', () => {
    expect(posthogSource).toContain('enableSessionReplay: false');
    expect(posthogSource).toContain('captureAppLifecycleEvents: false');
  });
});
