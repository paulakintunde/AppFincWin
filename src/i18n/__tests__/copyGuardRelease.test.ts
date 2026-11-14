// 05.5-03 (CMP-F09): the copy-guard allowlist must be empty before any public release. Run with RELEASE_GATE=1.
import allowlist from '../copyGuard/allowlist.json';

(process.env.RELEASE_GATE === '1' ? it : it.skip)('copy-guard allowlist is empty before a public release', () => {
  expect(allowlist.entries).toHaveLength(0);
});
