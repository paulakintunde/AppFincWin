---
quick_id: 261115-kog
type: quick
---

# Quick 261115-kog: PR auto-merge with a one-at-a-time update queue

Owner decisions (2026-11-15):
- Every ready PR merges itself once required checks pass, except drafts, PRs labelled `hold`, PRs from forks, and Dependabot major-version bumps.
- Keep main's "branches must be up to date" rule and add a queue rather than dropping the rule.

## Task 1: repo settings
- Turn on "Allow auto-merge" and "Allow update branch". Create the `hold` label.
- Done: `gh api repos/...` shows both true. The label exists.

## Task 2: `.github/workflows/auto-merge.yml`
- A sweep runs on push to main, PR open/label/draft events, every 15 min and by hand. It turns auto-merge on or off by the rules above. When no auto-merge PR is mid-test, it updates the oldest PR that is behind main and has no failed checks, trying the next one if an update fails.
- It uses the `AUTOMERGE_TOKEN` secret, because work done with GITHUB_TOKEN does not start CI. It does nothing if the secret is missing, and it never checks out PR code.
- Verify: the YAML parses, and a dry run against live PRs (writes replaced by echo) gives the expected on/off and queue decisions. `is_major` handles major, minor, 0.x and grouped titles.
