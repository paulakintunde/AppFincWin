---
phase: 01-money-core
decision: RD-09
date: 2026-09-24
---

# RD-09 — CI Supply-Chain Pinning Report

Implements `01-REVIEW-DECISIONS.md` RD-09: pin every GitHub Action in
`.github/workflows/*.yml` by full 40-char commit SHA (tag kept as a trailing
comment), pin the gitleaks container by digest, and add
`.github/dependabot.yml` for `github-actions` (and `npm`, since the repo is
public).

Only workflow file in the repo: `.github/workflows/ci.yml`. No other files
under `.github/workflows/` exist.

## Actions pinned

| Action | Tag in workflow | Resolved to | SHA | How verified |
|---|---|---|---|---|
| `actions/checkout` | `@v4` | `v4.4.0` (current commit `v4` moving tag points to) | `11d5960a326750d5838078e36cf38b85af677262` | `git ls-remote --tags https://github.com/actions/checkout 'refs/tags/v4' 'refs/tags/v4^{}'` and cross-checked with `gh api repos/actions/checkout/git/ref/tags/v4` — both returned the same SHA. `git ls-remote --tags` also confirmed `refs/tags/v4.4.0` points to the identical SHA, so `v4` and `v4.4.0` are the same commit. |
| `actions/setup-node` | `@v4` | `v4.4.0` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | Same method: `git ls-remote --tags https://github.com/actions/setup-node 'refs/tags/v4' 'refs/tags/v4^{}'` cross-checked against `gh api repos/actions/setup-node/git/ref/tags/v4`. `refs/tags/v4.4.0` confirmed identical SHA. |
| `supabase/setup-cli` | `@v1` | `v1.7.3` | `1dedf2c611547ede7232d26866dd3c56ab903bbb` | `supabase/setup-cli` has no `refs/tags/v1` — its major-version alias is a **branch**, not a tag (`refs/heads/v1`). Resolved via `git ls-remote --heads https://github.com/supabase/setup-cli` and cross-checked with `gh api repos/supabase/setup-cli/git/ref/heads/v1`; both returned the same SHA. Confirmed via `git ls-remote --tags` that this SHA is identical to the `v1.7.3` release tag, i.e. the `v1` branch currently points at the latest v1.x release. The `version: 2.117.0` input (pinning the Supabase CLI binary itself, per the WR-C05 comment already in the workflow) was left untouched — it is asserted against `package.json`'s `supabase` devDependency (also `2.117.0`) by `scripts/verify-migration-gate.mjs` and is unrelated to the action's own commit pin. |

None of the three actions used an annotated tag (`^{}` peeled ref), so the direct `refs/tags/<tag>` SHA is already the commit SHA in every case.

## Container image pinned

| Image | Tag in workflow | How verified | Digest |
|---|---|---|---|
| `ghcr.io/gitleaks/gitleaks` | `:v8.30.1` | `docker manifest inspect ghcr.io/gitleaks/gitleaks:v8.30.1 --verbose` (Docker Desktop, authenticated pull) to enumerate the per-platform manifests (`linux/amd64` → `sha256:b109bc5f...`, `linux/arm64` → `sha256:6b2d5224...`), then `docker buildx imagetools inspect ghcr.io/gitleaks/gitleaks:v8.30.1` to read the top-level OCI image **index** digest that wraps both platform manifests plus their attestations. The two commands' per-platform digests agreed, confirming a stable read. | Pinned to the index digest: `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` |

The workflow now runs:
```
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo --config /repo/.gitleaks.toml --redact --no-banner --exit-code 1 # v8.30.1
```
Pinning to the manifest-list (index) digest rather than a single-platform manifest digest was a deliberate choice: `ubuntu-latest` runners are amd64 today, but the index digest still resolves correctly if the runner architecture ever changes, whereas a single-platform manifest digest would not.

## Dependabot

Added `.github/dependabot.yml` with two ecosystems:

- `github-actions`, weekly — keeps the SHA pins above current; Dependabot opens a PR with the new SHA and updates the trailing version comment automatically when the actions used here cut a new release. Each such PR's SHA should still be spot-checked against upstream before merge (the report's verification method above is the reference), consistent with the rest of this phase's build-vs-trust posture.
- `npm`, weekly, `open-pull-requests-limit: 5`, with a `minor-and-patch` group so routine dependency bumps land as one grouped PR instead of a flood — added because the repo is public (`paulakintunde/AppFincWin`, confirmed via `gh repo view --json isPrivate` → `isPrivate: false`).

## Scope check

- No job logic, step ordering, `permissions`, triggers, or `concurrency` block was changed — only the `uses:` refs, the gitleaks image ref, and the addition of `.github/dependabot.yml`.
- No versions were upgraded: every action and the gitleaks image remain pinned to the exact same release the workflow already used (`v4`→v4.4.0, `v4`→v4.4.0, `v1`→v1.7.3, `v8.30.1` unchanged), just expressed as an immutable SHA/digest with the original tag preserved as a comment.
- `.github/workflows/ci.yml` was validated to still parse as YAML (`python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → OK) after the edits, and again for the new `.github/dependabot.yml`.
- No GitHub repository settings were changed via API — only files under `.github/` in this repo were touched.
