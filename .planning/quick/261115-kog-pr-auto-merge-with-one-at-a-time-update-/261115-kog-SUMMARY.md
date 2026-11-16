---
quick_id: 261115-kog
status: complete
---

# Quick 261115-kog summary

- **Repo settings:** auto-merge and update-branch are on, and the `hold` label exists. Both were done with the API on 2026-11-15.
- **`.github/workflows/auto-merge.yml`:** adds the sweep and the queue. Filtering uses gh's built-in `--jq`, so the workflow does not depend on a separate jq.
- **Dry run on live PRs:** #136 and #135 → turn auto-merge on. #134 → draft, left. #127–#130 → Dependabot major, left. Queue: nothing behind, as expected in a dry run.
- **`is_major` checks:** 26→27 major, 4.3→4.4 ok, 0.4→0.5 major, grouped title ok, 4→6 major.
- **Owner step still needed:** create the fine-grained token and add it as the `AUTOMERGE_TOKEN` Actions secret. Until then the sweep logs a notice and does nothing.
- **Not tested live:** the update-branch path and real merges, which need the token.
