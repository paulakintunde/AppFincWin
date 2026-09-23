---
quick_id: 260922-tsn
type: quick
mode: quick
autonomous: true
files_modified:
  - .planning/phases/00-foundation/00-03-PLAN.md
  - .planning/phases/00-foundation/00-05-PLAN.md
  - .planning/phases/00-foundation/00-06-PLAN.md
  - .planning/phases/00-foundation/00-09-PLAN.md
  - .planning/phases/00-foundation/00-15-PLAN.md
  - .planning/phases/00-foundation/00-19-PLAN.md
  - .planning/phases/00-foundation/00-20-PLAN.md
  - .planning/ROADMAP.md

must_haves:
  truths:
    - "No Phase 0 plan references a Supabase dev project, a dev env var, or the name fincwin-dev"
    - "Every step that previously targeted dev now says plainly that its target is the one production project"
    - "00-03 adopts and links the existing production project rather than creating two projects"
    - "Every automated gate touched by this change passes against the real working tree"
    - "The user's uncommitted us-west-2 edits survive, with the two defects they introduced fixed"
    - "Nothing under .planning/quick/ is modified"
  artifacts:
    - path: ".planning/phases/00-foundation/00-03-PLAN.md"
      provides: "Single-production-project provisioning plan"
      contains: "cohmcbdfgqmiwykztrdg"
    - path: ".planning/ROADMAP.md"
      provides: "Corrected 00-03 plan line and Phase 0 success criterion 8"
      contains: "us-west-2"
  key_links:
    - from: ".planning/phases/00-foundation/00-03-PLAN.md"
      to: "supabase/config.toml"
      via: "automated gate asserting project_id"
      pattern: "project_id = \"cohmcbdfgqmiwykztrdg\""
    - from: ".planning/phases/00-foundation/00-19-PLAN.md"
      to: ".env.local"
      via: "SUPABASE_PROD_PROJECT_REF / SUPABASE_DB_PASSWORD"
      pattern: "SUPABASE_PROD_PROJECT_REF"
---

<objective>
Collapse the Phase 0 plans from a two-Supabase-project model (dev + prod) to the single
production project that actually exists: `Fincwin United`, ref `cohmcbdfgqmiwykztrdg`,
region `us-west-2`, already ACTIVE_HEALTHY and already pinned in `supabase/config.toml`.

Purpose: Sixteen surviving `SUPABASE_DEV_*` references now resolve to an empty string,
silently producing URLs like `https://.supabase.co` and `supabase link --project-ref ""`.
Several plan steps also change *meaning*, not just a variable — migrations, Edge Function
deploys and auth-provider config now land on production. The plans must say so plainly so
whoever executes them is not surprised.

Output: 7 corrected Phase 0 plan files and a corrected ROADMAP.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/ops/accounts.md
</context>

<ground_truth>
Verified live this session. Treat as fact; do not re-derive.

1. **One Supabase project exists and it is production.** Name `Fincwin United`, ref
   `cohmcbdfgqmiwykztrdg`, region `us-west-2`, ACTIVE_HEALTHY, empty `public` schema.
   There is no dev project and none will be created.
2. **`.env.local` (gitignored) contains exactly:** `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROD_PROJECT_REF=cohmcbdfgqmiwykztrdg`, `SUPABASE_DB_PASSWORD`,
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. There is **no** `SUPABASE_DEV_PROJECT_REF`, no
   `SUPABASE_DEV_DB_PASSWORD`, and **no `.env.production.local` file at all**. The
   password var is deliberately the plain `SUPABASE_DB_PASSWORD`, because that is the
   exact name `supabase db push` reads non-interactively.
3. **`supabase/config.toml` already exists** with `project_id = "cohmcbdfgqmiwykztrdg"`
   on line 5.
4. **`scripts/supabase-preflight.mjs` already exists and passes.** It asserts
   config.toml's `project_id` equals `SUPABASE_PROD_PROJECT_REF`. npm scripts
   `supabase:preflight` and `supabase:db:push` are wired in `package.json` (lines 67-68).
   CLAUDE.md mandates running preflight before any `supabase db push`.
5. **The working tree is dirty and that is intentional.** `00-03-PLAN.md` and
   `00-19-PLAN.md` hold the user's uncommitted edits. Preserve them. `00-19` renamed
   `SUPABASE_DEV_DB_PASSWORD` → `SUPABASE_DB_PASSWORD` (correct). `00-03` got a
   region-only replace of us-east-1 → us-west-2 which introduced two defects, fixed in
   Task 1.
6. The user has already accepted that migrations go straight to production. Do **not**
   re-litigate it, do **not** add confirmation gates, warnings or "are you sure" prompts
   that the plans do not already have. Honesty of wording only.
</ground_truth>

<hard_constraints>
- **Never edit anything under `.planning/quick/`.** Those are historical records of
  completed work; their `us-east-1` / `fincwin-dev` / `SUPABASE_DEV_PROJECT_REF` mentions
  are accurate descriptions of what was true then.
- **Never edit** `.env.local`, `CLAUDE.md`, `docs/ops/accounts.md`,
  `scripts/supabase-preflight.mjs`, `supabase/config.toml`. All already correct.
- **Out of scope, do not touch:** `00-01-PLAN.md`, `00-02-PLAN.md`, `00-13-PLAN.md`,
  `00-14-PLAN.md`, `00-CONTEXT.md`, `00-RESEARCH.md`, `00-DISCUSSION-LOG.md`, any
  `*-SUMMARY.md`. Residual inconsistencies in those are reported, not fixed.
- Preserve each plan's frontmatter, task IDs, threat IDs, heading levels, `<task>` /
  `<verify>` / `<automated>` structure. Do not renumber tasks. Do not reflow prose that
  is unrelated to the dev/prod collapse.
- Use Edit for surgical changes. Line numbers below are anchors from the current tree —
  match on text, not on line number, since earlier edits shift later lines.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Restructure 00-03-PLAN.md from "create two projects" to "adopt the one that exists"</name>
  <files>.planning/phases/00-foundation/00-03-PLAN.md</files>
  <read_first>
    - .planning/phases/00-foundation/00-03-PLAN.md (whole file, once)
  </read_first>
  <action>
This is a restructure, not a find-and-replace. Apply every item below.

**A. Fix the two defects the user's region replace introduced:**
- line ~77: `in us-west-` is missing its trailing `2`. It becomes `us-west-2` (and see F below, which rewrites that whole sentence anyway).
- line ~46 (Objective) and line ~158 (`T-00-03-03` risk row): `US west` → `US West`.
- line ~26 (must_haves truth): `US WEST` → `US West`.
- line ~105: `"US west (us-west-2) chosen at project creation` → `"US West (us-west-2) chosen at project creation`.

**B. Frontmatter `user_setup` (lines ~15, ~20):**
- `why:` "…so the CLI can create and link projects (D-08)" → "…so the CLI can link and manage the existing project (D-08)".
- `dashboard_config` task: "Create organisation 'FincWin United' (Free plan) from your personal login" → "Confirm the organisation 'FincWin United' (Free plan) and its project are visible under your personal login".

**C. Frontmatter `must_haves` (lines ~26-42):**
- Truth (line ~26) → `"The one production cloud project exists under the company's Supabase organisation in US West (us-west-2): Fincwin United, ref cohmcbdfgqmiwykztrdg (ENV-17, ENV-18, D-22)"`.
- Truth (line ~28) `"…and the repo is linked to the dev project (ENV-17)"` → `"…and the repo is linked to the production project (ENV-17)"`.
- Truth (line ~29) `"The dev project's REST endpoint answers…"` → `"The production project's REST endpoint answers…"`.
- Truth (line ~30) → `"Every Supabase credential lives only in the gitignored .env.local"` (drop `.env.production.local`; per ground truth 2 it does not exist and is not created).
- Artifact `docs/decisions/supabase-environments.md` `provides:` "Environment map (local / dev / prod), region reasoning, migrations-only rule" → "Environment map (local / production), region reasoning, migrations-only rule".
- `key_links` (lines ~41-42): `via:` → `supabase link --project-ref $SUPABASE_PROD_PROJECT_REF`; `pattern:` → `SUPABASE_PROD_PROJECT_REF`.

**D. Objective (lines ~46-49):**
- line ~46 → `Provision Supabase: install the CLI toolchain, adopt and link the company organisation's single production project in US West, and initialise the local stack.`
- line ~48 `Purpose:` — `ENV-17 needs a local CLI stack plus separate cloud dev and prod projects, changed only through migrations.` → `ENV-17 needs a local CLI stack plus the cloud production project, changed only through migrations in git.` Keep the ENV-18 / D-22 sentence, with `US west` → `US West`.
- line ~49 `Output:` — drop `.env.production.local`; read `…and a gitignored .env.local holding the project ref and keys.`

**E. Task 1 `<what-built>` / step 4 (lines ~70, ~75):**
- step 4 → `4. At https://supabase.com/dashboard, confirm the organisation "FincWin United" (Free plan, D-08) and its project "Fincwin United" are both present. Both already exist — nothing is created here.`

**F. Task 1 step 6 (line ~77) — the moot approval:**
Replace the whole sentence with:
`6. Reply "ready". The production project already exists (\`Fincwin United\`, ref \`cohmcbdfgqmiwykztrdg\`, us-west-2), so no project is created in this plan — "ready" confirms the CLI and Docker are installed and that \`SUPABASE_ACCESS_TOKEN\` is in \`.env.local\`.`
Then update `<acceptance_criteria>` (line ~80): `- User replies "ready" (approval to create both projects)` → `- User replies "ready" (CLI, Docker and access token confirmed)`.

**G. Task 2 name (line ~86):**
`Task 2: Init the local stack, link the existing production project, capture keys into .env.local`

**H. Task 2 `<action>` (lines ~93-106) — rewrite steps 1-9:**
- step 1 → `git check-ignore .env.local` must print the path. Stop if it does not. (Drop `.env.production.local`.)
- step 2 → `supabase init` **only if `supabase/config.toml` is absent**; it already exists in this repo pinning `project_id = "cohmcbdfgqmiwykztrdg"`. If you do run init, set `project_id = "cohmcbdfgqmiwykztrdg"` (the project ref, which is what `scripts/supabase-preflight.mjs` asserts). Leave all other defaults.
- step 3 → `supabase orgs list -o json` must show the org "FincWin United", confirming the token works.
- step 4 → delete the "generate two DB passwords" step. Replace with: the project's DB password was set at creation and lives in `.env.local` as `SUPABASE_DB_PASSWORD` plus the password manager. If it is missing, reset it in Dashboard → Project Settings → Database → Reset database password and update `.env.local`.
- step 5 → delete both `supabase projects create` calls. Replace with: `supabase projects list -o json` must show the project `Fincwin United` with id `cohmcbdfgqmiwykztrdg`, region `us-west-2`, status `ACTIVE_HEALTHY`. No project is created.
- step 6 → `supabase projects api-keys --project-ref "$SUPABASE_PROD_PROJECT_REF" -o json`. Leave the existing publishable-vs-anon wording alone (out of scope).
- step 7 → the `.env.local` key list becomes exactly the real set: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_PROJECT_REF=cohmcbdfgqmiwykztrdg`, `SUPABASE_DB_PASSWORD` (the name `supabase db push` reads non-interactively), `EXPO_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Delete the second paragraph that creates `.env.production.local` — there is only one project, so `.env.local` carries its values.
- step 8 → `supabase link --project-ref "$SUPABASE_PROD_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"`. Replace "Dev is the default link target; prod is only ever pushed explicitly in 00-19" with: `There is one project and it is production, so it is the only link target. Pushes are guarded by scripts/supabase-preflight.mjs — run` `npm run supabase:preflight` `before any` `supabase db push`, `or use` `npm run supabase:db:push`, `which chains the check (CLAUDE.md).`
- step 9(a) Environments table → two rows only: `local` (Supabase CLI in Docker, used by pgTAP and CI) and `prod` (`Fincwin United`, Free now, moves to Pro before first real data in Phase 2 per ENV-16). Delete the `dev` row. Keep the "record refs by name only, see .env.local" sentence.
- step 9(b) → keep verbatim except `US west` → `US West`.
- step 9(c) ENV-17 rule → `"Schema reaches the database only through supabase/migrations/*.sql in git: supabase db reset locally, and npm run supabase:db:push (preflight + supabase db push) to production. There is no separate dev project, so every push is a production push. No dashboard SQL edits to schema, ever. Migrations must stay compatible with the oldest supported app version (see app_config.min_supported_version)."`

**I. Task 2 `<verify><automated>` (line ~109) — replace with a gate that passes:**
`test -f supabase/config.toml && grep -q 'project_id = "cohmcbdfgqmiwykztrdg"' supabase/config.toml && supabase projects list -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const m=p.filter(x=>x.id==='cohmcbdfgqmiwykztrdg'&&/us-west-2/.test(x.region));process.exit(m.length===1?0:1)})"`

**J. Task 2 `<acceptance_criteria>` (lines ~112-116) and `<done>` (line ~118):**
- line ~112 → `` - `supabase projects list -o json` shows `Fincwin United` (id `cohmcbdfgqmiwykztrdg`) in region `us-west-2` ``
- line ~113 → unchanged.
- line ~114 → `` - `git check-ignore .env.local` prints the path ``
- lines ~115-116 → unchanged.
- `<done>` → `The production project is linked, the local stack is configured, and credentials exist only in .env.local.`

**K. Task 3 (lines ~122-139) — dev → production:**
- name → `Task 3: Start the local stack and verify the production REST endpoint`
- step 2 → `Cloud production check (ENV-03 provisioned half): …` (rest of the curl wording unchanged).
- acceptance `- The curl against the dev project's /rest/v1/ returns HTTP 200` → `- The curl against the production project's /rest/v1/ returns HTTP 200`.
- `<done>` → `Local stack runs; the production project answers with the publishable key.`

**L. `<threat_model>` (lines ~156-158):**
- `T-00-03-01` mitigation: drop `/ .env.production.local`, leaving `Stored only in .env.local; …`.
- `T-00-03-02` (E, Accidental prod changes) mitigation is now false. Replace with:
  `There is one project and it is production; schema reaches it only through git migrations, and scripts/supabase-preflight.mjs asserts config.toml's project_id matches SUPABASE_PROD_PROJECT_REF before any push (npm run supabase:db:push)`.
- `T-00-03-03` → `US West chosen deliberately (D-22); …` (rest unchanged).

**M. `<verification>` (line ~163):**
`- The production project is listed in us-west-2; local stack status is OK; its REST endpoint returns 200`
  </action>
  <verify>
    <automated>cd . && F=.planning/phases/00-foundation/00-03-PLAN.md && ! grep -qE 'SUPABASE_DEV_(PROJECT_REF|DB_PASSWORD)|fincwin-dev|fincwin-prod|us-east-1' "$F" && ! grep -q 'project_id = "fincwin"' "$F" && grep -q 'cohmcbdfgqmiwykztrdg' "$F" && test -z "$(grep -ohE 'us-west-.?' "$F" | grep -v '^us-west-2$')" && ! grep -qE 'US west|US WEST|US East' "$F" && test "$(head -1 "$F")" = "---"</automated>
  </verify>
  <done>00-03 provisions one production project, its config.toml gate matches the real ref, and the three capitalisation/truncation defects are gone.</done>
</task>

<task type="auto">
  <name>Task 2: Retarget the push/deploy plans to production — 00-05, 00-06, 00-09</name>
  <files>.planning/phases/00-foundation/00-05-PLAN.md, .planning/phases/00-foundation/00-06-PLAN.md, .planning/phases/00-foundation/00-09-PLAN.md</files>
  <read_first>
    - .planning/phases/00-foundation/00-05-PLAN.md lines 205-240
    - .planning/phases/00-foundation/00-06-PLAN.md (whole file, once)
    - .planning/phases/00-foundation/00-09-PLAN.md lines 1-60 and 195-270
  </read_first>
  <action>
**00-05-PLAN.md — the `.env.example` template inside Task 2's `<action>`:**
- line ~213 comment `# https://<ref>.supabase.co (dev in .env.local, prod in EAS production env)` →
  `# https://<ref>.supabase.co (production project; .env.local locally, EAS env for builds)`.
- lines ~230-233: delete `SUPABASE_DEV_PROJECT_REF=`, `SUPABASE_DEV_DB_PASSWORD=` and
  `SUPABASE_PROD_DB_PASSWORD=`. Keep a single ref line, re-commented:
  `SUPABASE_PROD_PROJECT_REF=                 # the one Supabase project; it is production`.
  Leave the existing `SUPABASE_DB_PASSWORD=` line (line ~229) and its comment alone —
  it is already correct and is the name `supabase db push` reads.
- Touch nothing else in 00-05.

**00-06-PLAN.md — migrations now go to production:**
- must_haves truth (line ~24) → `"Both migrations are applied to the production cloud project via supabase db push (ENV-17)"`.
- Objective (line ~47) → `…prove isolation with pgTAP, and push to the production project.`
- Objective `Output:` (line ~50) → `…green locally and applied to the production project (Fincwin United).`
- Task 3 name (line ~231) → `Task 3: [BLOCKING] Push migrations to the production cloud project`.
- `<read_first>` (line ~234) → `docs/decisions/supabase-environments.md (ENV-17 rule: migrations only, and the one project is production)`.
- `<read_first>` (line ~235) → `.env.local (SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROD_PROJECT_REF, via \`set -a; . ./.env.local; set +a\`; never print values)`.
- line ~238 → `This task is mandatory. The phase cannot pass verification without the schema on the production project. There is only one Supabase project and it is production — this push is a production push.`
- line ~240 → `2. Confirm the link target: \`grep -q "$SUPABASE_PROD_PROJECT_REF" supabase/.temp/project-ref\`. If it differs, run \`supabase link --project-ref "$SUPABASE_PROD_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"\`.`
- line ~241 (step 3) → prefix the push with the existing preflight guard:
  `3. \`npm run supabase:preflight\`, then \`supabase db push --linked --dry-run\`, then \`supabase db push --linked\`.` Keep the rest of step 3 (non-TTY / `yes |` / ask-the-user fallback) verbatim.
- line ~243 (step 5) → `5. Smoke check against the production project with the publishable key: …` (curl commands unchanged).
- line ~244 → delete `Never push to prod in this plan (ENV-17). Prod is pushed only in 00-19 after explicit approval.` Replace with:
  `This is the project's only database, so there is no second environment to promote to later (ENV-17). 00-19 verifies the result rather than repeating the push.`
- acceptance (lines ~251-252) → `- The anon REST read of app_config on the production project returns value \`0.1.0\`` and `- The anon REST read of households on the production project returns \`[]\``.
- `<done>` (line ~254) → `The production cloud schema matches git, applied through migrations only.`
- `<verification>` (line ~282) → `- \`supabase migration list --linked\` shows both migrations on the production project`.
- `<success_criteria>` (line ~286) → `…and the production cloud schema is migrated from git only.`

**00-09-PLAN.md — fx-sync now deploys to production:**
- must_haves truth (line ~21) → `"An fx-sync Edge Function is deployed to the production project and populates public.fx_rates …"` (rest unchanged).
- Objective `Output:` (line ~52) → `…deployed and run once on the production project.`
- Do **not** touch lines ~66, ~114, ~127 — `api.frankfurter.dev` is a third-party hostname, not an environment.
- Task 3 name (line ~211) → `Task 3: [BLOCKING] Push migrations, set secrets, deploy fx-sync to production, and prove fx_rates fills`.
- step 2 (line ~219) → `2. [BLOCKING] Schema push: \`npm run supabase:preflight\`, then \`supabase db push --linked\` (the one project, which is production). Then \`supabase migration list --linked\` must show 20260922000300 and 20260922000400 remote.`
- steps 3, 4, 5, 6 (lines ~220-225): replace every `$SUPABASE_DEV_PROJECT_REF` with
  `$SUPABASE_PROD_PROJECT_REF`. In step 5's lead-in, `Vault secrets on dev through the
  Management API SQL endpoint` → `Vault secrets on the production project through the
  Management API SQL endpoint`.
- line ~227 → replace `Prod deployment is done by 00-19 after the approved prod push.` with
  `There is one project and it is production, so this deploy is the production deploy; 00-19 verifies it rather than repeating it.`
- `<verify><automated>` (line ~230) → same command with `$SUPABASE_DEV_PROJECT_REF` →
  `$SUPABASE_PROD_PROJECT_REF`. Change nothing else in that line.
- acceptance (line ~233) → `…applied on the production project`.
- `<done>` (line ~238) → `ENV-08 holds on the production project: …` (rest unchanged).
- `<verification>` (line ~264) → `…fx-sync returns ok on the production project; …`.
- `<success_criteria>` (line ~268) → `ENV-08 holds on the production project, with the service-role key confined …`.
  </action>
  <verify>
    <automated>cd . && ! grep -rqE 'SUPABASE_DEV_(PROJECT_REF|DB_PASSWORD)|fincwin-dev' .planning/phases/00-foundation/00-05-PLAN.md .planning/phases/00-foundation/00-06-PLAN.md .planning/phases/00-foundation/00-09-PLAN.md && grep -q 'SUPABASE_PROD_PROJECT_REF' .planning/phases/00-foundation/00-06-PLAN.md && grep -c 'SUPABASE_PROD_PROJECT_REF' .planning/phases/00-foundation/00-09-PLAN.md | grep -qvE '^0$' && ! grep -q 'SUPABASE_PROD_DB_PASSWORD' .planning/phases/00-foundation/00-05-PLAN.md</automated>
  </verify>
  <done>00-05's env template lists only real vars; 00-06 and 00-09 state plainly that their push and deploy targets are production, guarded by the existing preflight script.</done>
</task>

<task type="auto">
  <name>Task 3: Reframe 00-19, single-target 00-15 and 00-20, fix ROADMAP, run every gate</name>
  <files>.planning/phases/00-foundation/00-15-PLAN.md, .planning/phases/00-foundation/00-19-PLAN.md, .planning/phases/00-foundation/00-20-PLAN.md, .planning/ROADMAP.md</files>
  <read_first>
    - .planning/phases/00-foundation/00-19-PLAN.md (whole file, once)
    - .planning/phases/00-foundation/00-15-PLAN.md lines 30-75 and 160-210
    - .planning/phases/00-foundation/00-20-PLAN.md lines 10-25 and 75-110
    - .planning/ROADMAP.md lines 50-70
  </read_first>
  <action>
**00-15-PLAN.md — one auth-config target, not two:**
- must_haves truth (line ~35) → `"The Supabase Google provider is enabled on the production project with the Web + iOS + Android client IDs, and fincwin://auth-callback is an allowed redirect"`.
- Objective `Output:` (line ~68) → `…and the Supabase Google provider enabled on the production project.`
- step 2 (line ~166), Web client redirect URIs: `\`https://<DEV_REF>.supabase.co/auth/v1/callback\` and \`https://<PROD_REF>.supabase.co/auth/v1/callback\`` → `\`https://<PROD_REF>.supabase.co/auth/v1/callback\` (the one project)`.
- step 4 (line ~174): `That also approves Claude changing Supabase auth config on dev and prod. Claude then runs, for each of dev and prod:` → `That also approves Claude changing the Supabase auth config on the production project. Claude then runs, once:`. Leave the curl body, the `eas env:create` sentence and everything after it untouched.
- acceptance (line ~177) → `- \`curl -s https://api.supabase.com/v1/projects/$SUPABASE_PROD_PROJECT_REF/config/auth -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | grep -q '"external_google_enabled":true'\` succeeds` — delete the trailing `(and the same for prod)`.
- `<verification>` (line ~208) → `…the Supabase Google provider is enabled on the production project`.

**00-20-PLAN.md — same, for Apple:**
- `user_setup` dashboard task (line ~18) → `Create a Services ID (web/Android Apple sign-in) with the return URL for the Supabase callback`.
- Task 1 step 7 (line ~79) → `This approves Claude changing the Supabase Apple provider on the production project, and running the iOS EAS build …` (rest unchanged).
- Task 2 step 2 (line ~97) → `2. Run \`curl -X PATCH https://api.supabase.com/v1/projects/$SUPABASE_PROD_PROJECT_REF/config/auth …\`` — drop `For dev and prod,` and use the ref var in place of `<REF>`. Keep the payload and the "bundle ID covers native / Services ID covers Android web flow / verify with GET" sentences.
- `<verify><automated>` (line ~103) → `$SUPABASE_DEV_PROJECT_REF` → `$SUPABASE_PROD_PROJECT_REF`. Nothing else on that line.
- acceptance (line ~106) → `- GET auth config on the production project shows \`external_apple_enabled: true\``.
- Task 2 step 5 (line ~102) → `regenerate and PATCH both projects before then` → `regenerate and PATCH the production project before then`.

**00-19-PLAN.md — production is already migrated by 00-06 and 00-09, so Task 3 verifies rather than deploys.**
This is the plan whose *meaning* changes most. Apply all of:
- must_haves truth (line ~15) → `"On the Android emulator, a user signs in with Google against the production project; auth.users, profiles, households and household_members rows exist for that UUID (ACC-02, ENV-06, ACC-04)"`.
- must_haves truth (line ~20) → `"Raising min_supported_version on the production project shows the update-required screen; restoring it clears the screen (FND-09)"`.
- must_haves truth (line ~21) → replace with `"The production project carries all four migrations and a working fx-sync function, applied through git migrations in 00-06 and 00-09 (ENV-17)"`.
- Objective (line ~37) → `Prove Phase 0 end to end on Android, consolidate the dependency register, and confirm the production project's schema and fx-sync are current.`
- Objective `Purpose:` (line ~39) → replace `The prod push is deliberately separated and approved (ENV-17).` with `There is one Supabase project and it is production; 00-06 and 00-09 already migrated it from git, so this plan confirms that state rather than repeating the push (ENV-17).`
- Objective `Output:` (line ~40) → `…the updated register, and the production project confirmed current.`
- line ~68 → `2. \`npx expo run:android\` with \`.env.local\` pointing at the production project (the only project), with all of 00-10 to 00-18 in place.`
- line ~69 register wording → `Supabase production project provisioned ("Free; Pro before Phase 2, ENV-16")` in place of `Supabase dev/prod provisioned (prod "Free; Pro before Phase 2, ENV-16")`, and `Frankfurter provisioned ("fx-sync deployed in 00-09")` in place of `Frankfurter provisioned ("fx-sync on dev; prod after Task 3")`. Everything else in that sentence unchanged.
- line ~89 `<what-built>` → `The whole of Phase 0 running on the emulator against the production project.`
- line ~94 (step 4) → `…Claude confirms profiles.accent and font_pairing changed on the production project.`
- line ~96 (step 8) → `Claude runs \`update public.app_config set value = '9.9.9' where key = 'min_supported_version'\` through the Management API against the production project — the only project. This is a controlled test update; revert immediately after.` Keep the rest of step 8 verbatim, including the restore to '0.1.0'.
- line ~101 (step 11) — the prod-push approval is moot. Replace with:
  `11. Confirm or correct the register's Supabase row: the production project is migrated (00-06, 00-09) and fx-sync is deployed.`
  Note step 10 already covers the Apple/Play/D-U-N-S/website statuses — do not duplicate it.
- acceptance (line ~104) → `- The user replies "approved" with results for steps 1-9`.
- `<resume-signal>` (line ~106) → `Reply "approved", or list the failing step numbers`.
- Task 3 name (line ~110-ish) → `Task 3: [BLOCKING] Confirm production's schema and fx-sync, then finalise the register and acceptance doc`.
- `<read_first>` (line ~114) → replace the `.env.production.local` line with
  `.env.local (load with \`set -a; . ./.env.local; set +a\`; never echo values)`.
  `.env.production.local` does not exist — see ground truth 2.
- `<action>` line ~117 → delete the `Only if Task 2 said "prod: yes"…` conditional entirely.
- `<action>` steps 1-4 (lines ~118-121) → replace all four with two verification steps:
  `1. \`set -a; . ./.env.local; set +a\`. Confirm the link target is the production project: \`grep -q "$SUPABASE_PROD_PROJECT_REF" supabase/.temp/project-ref\`; relink with \`supabase link --project-ref "$SUPABASE_PROD_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"\` if it differs.`
  `2. \`supabase migration list --linked\` must show 20260922000100-20260922000400 as remote. If any is missing, run \`npm run supabase:preflight\` then \`supabase db push --linked\` to bring it up to date.`
  `3. Confirm fx-sync is live: invoking \`https://$SUPABASE_PROD_PROJECT_REF.supabase.co/functions/v1/fx-sync\` with the correct \`x-fx-sync-secret\` from \`.env.local\` returns \`ok:true\`, and a wrong secret returns 403. If the function is absent, deploy it exactly as 00-09 Task 3 steps 3-5 describe.`
  Renumber the surviving step 5 to step 4 and reword it to
  `4. Mark the acceptance doc results from Task 2 and the register rows (Supabase: "migrated YYYY-MM-DD", Frankfurter: "fx-sync deployed").`
- `<verify><automated>` (line ~125) → `$SUPABASE_DEV_PROJECT_REF` → `$SUPABASE_PROD_PROJECT_REF`. Nothing else on that line.
- acceptance (lines ~128-129) → `- \`supabase migration list --linked\` shows all four migrations on the production project, and an fx-sync invocation returns ok:true` and `- \`supabase/.temp/project-ref\` equals \`SUPABASE_PROD_PROJECT_REF\``.
- `<done>` (line ~132) → `The Android half of Phase 0 is accepted, the production project is confirmed current, and the register is final.`
- `<threat_model>`:
  - `T-00-19-01` mitigation → `All schema changes come from git migrations, with npm run supabase:preflight asserting the link target and a --dry-run before any push; no dashboard SQL edits`.
  - `T-00-19-02` → the shared-FX-secret-across-environments threat no longer exists (one environment). Replace the row's Component/Mitigation with: Component `FX_SYNC_SECRET`, Disposition `mitigate`, Mitigation `Single 32-byte random secret held only in .env.local, the function secret store and Vault; never in git`. Keep the threat ID.
  - `T-00-19-03` mitigation → `Test update applied to the production project and reverted in the same step; verified by relaunch`.
  - `T-00-19-04` mitigation → `Test user on the production project; no real financial data exists in Phase 0`.
- `<verification>` (line ~156) → `- The acceptance doc is fully filled in; the register is consolidated; the production project is confirmed current`.

**.planning/ROADMAP.md:**
- line ~57 (Phase 0 success criterion 8) → `8. The Supabase project runs in a deliberately chosen region and is changed only through migrations in git; CI proves one user cannot touch another user's or household's rows; the auth session is stored encrypted; and an app below the minimum supported version shows an update-required screen.`
- line ~63 → `- [ ] 00-03-PLAN.md — Supabase CLI toolchain, production project in us-west-2, local stack (W1)`
- Change nothing else in ROADMAP.md.

**Finally, run the full gate set** (the `<automated>` block below). If any gate fails,
fix the offending file and re-run — do not hand back with a red gate.
  </action>
  <verify>
    <automated>cd . && ! grep -rqE 'SUPABASE_DEV_(PROJECT_REF|DB_PASSWORD)' .planning/phases/ .planning/ROADMAP.md && ! grep -rq 'us-east-1' .planning/phases/ .planning/ROADMAP.md && test -z "$(grep -rhoE 'us-west-.?' .planning/phases/ .planning/ROADMAP.md | grep -v '^us-west-2$')" && ! grep -rq 'fincwin-dev' .planning/phases/ .planning/ROADMAP.md && ! grep -q 'project_id = "fincwin"' .planning/phases/00-foundation/00-03-PLAN.md && grep -q 'cohmcbdfgqmiwykztrdg' .planning/phases/00-foundation/00-03-PLAN.md && ! git diff --name-only | grep -q '^\.planning/quick/' && for f in 00-03 00-05 00-06 00-09 00-15 00-19 00-20; do p=".planning/phases/00-foundation/$f-PLAN.md"; test "$(head -1 "$p")" = "---" || exit 1; test "$(grep -c '^---$' "$p")" -ge 2 || exit 1; grep -q '^phase: 00-foundation$' "$p" || exit 1; done && echo ALL_GATES_PASS</automated>
  </verify>
  <done>Every gate (a)-(f) passes, ROADMAP no longer claims two projects in us-east-1, and 00-19 verifies production instead of deploying to it a second time.</done>
</task>

</tasks>

<verification>
- Gates (a)-(f) from the brief all pass in the single `ALL_GATES_PASS` command in Task 3.
- `git diff --stat` touches exactly 8 files: the 7 Phase 0 plans and ROADMAP.md.
- `git diff .planning/phases/00-foundation/00-19-PLAN.md` still shows the user's
  `SUPABASE_DB_PASSWORD` rename intact (never reverted to `SUPABASE_DEV_DB_PASSWORD`).
</verification>

<success_criteria>
Reading any Phase 0 plan top to bottom, an executor sees one Supabase project, knows it
is production, and finds no command that expands an empty variable into a URL or a
`--project-ref`. No file under `.planning/quick/` changed.
</success_criteria>

<known_residuals>
Out of scope by constraint; report these in the handback rather than editing:
- `00-01-PLAN.md:95` — dependency register row still reads "Supabase dev project … Region US East (D-22)".
- `00-14-PLAN.md:110` — EAS production env still reads its keys from `.env.production.local`, a file that does not exist.
- `00-02-PLAN.md:165` — `.gitignore` still lists `.env.production.local` (harmless, defensive).
- `00-CONTEXT.md:48`, `00-RESEARCH.md:40/87/226`, `00-DISCUSSION-LOG.md:64` — D-22 is recorded as "US East" while the project is in us-west-2. These are historical decision records; correcting them is a separate call.
- `00-03-PLAN.md` step 6 still offers the legacy `anon` key as a fallback, while `docs/ops/accounts.md` says not to mint legacy JWTs. Unrelated to this collapse.
</known_residuals>

<output>
After completion, create `.planning/quick/260922-tsn-collapse-phase-00-plans-to-single-prod-s/260922-tsn-SUMMARY.md`
</output>
