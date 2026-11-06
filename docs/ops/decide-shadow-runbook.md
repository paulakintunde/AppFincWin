# Decide shadow runs: runbook (05.4-42, BO-08)

The quiet shadow check (05.4-36) runs on a phone only when that account's `profiles.decide_shadow` is true. The server sets it; the app cannot. This page lists the steps for switching it on, checking, reporting and stopping.

Rules for every step:

- Only the orchestrator runs these steps, and only after the owner's popup for that step.
- Use the Supabase CLI or Management API with the FincWin token from `C:\dev\fincwin\.env.local`. **Never use the Supabase MCP connector.** It points at a different account.
- Export the token for the one command only and never print it. The shell may already hold another account's `SUPABASE_ACCESS_TOKEN`.
- Never print account ids. Output is counts, labels (Owner A, Tester 1) and 8-character prefixes at most.
- Never touch `decide_v3`.
- Only accounts on `docs/ops/decide-testers.json` may be switched on. In the first round (D-160) that means the two `role: "owner"` accounts only. Testers come in 08.1, after they are asked (D-09, D-161).

The helper `fw` below loads only the two FincWin values into a single command:

```bash
fw() { env SUPABASE_ACCESS_TOKEN="$(grep -E '^SUPABASE_ACCESS_TOKEN=' /c/dev/fincwin/.env.local | cut -d= -f2-)" \
           SUPABASE_PROD_PROJECT_REF="$(grep -E '^SUPABASE_PROD_PROJECT_REF=' /c/dev/fincwin/.env.local | cut -d= -f2-)" "$@"; }
```

## 1. Switch on (owner accounts, first round)

Run this from the repo root. It reads the role-owner ids from the tester file, sends one update and prints only the count.

```bash
fw node --input-type=module -e '
import { readFileSync } from "node:fs";
const ids = JSON.parse(readFileSync("docs/ops/decide-testers.json", "utf8")).accounts.filter((a) => a.role === "owner").map((a) => a.id);
if (!ids.every((i) => /^[0-9a-f-]{36}$/i.test(i))) throw new Error("bad id in tester file");
const sql = `with u as (update public.profiles set decide_shadow = true where id in (${ids.map((i) => `\x27${i}\x27`).join(", ")}) returning 1) select count(*)::int as n from u`;
const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROD_PROJECT_REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) });
console.log(r.ok ? `switched on: ${(await r.json())[0].n}` : `HTTP ${r.status}`);
'
```

Expect `switched on: 2`.

For a tester in 08.1, filter by the tester numbers who said yes (their order among `role: "tester"`) rather than by `role === "owner"`.

## 2. Live switch check (must pass)

```bash
fw sh -c 'SUPABASE_READONLY_TOKEN="$SUPABASE_ACCESS_TOKEN" node scripts/decide-switch-check.mjs --online'
```

The check is read-only. It fails if any account outside the tester list, or any never-on account, has `decide_v3` or `decide_shadow` on. Until 05.4 merges, the Release gate workflow is not on `main`, so the check runs here instead.

## 3. Have the rows arrived? (read-only)

```bash
fw node --input-type=module -e '
import { readFileSync } from "node:fs";
const rev = readFileSync("src/engine/decide/v3/shadow/revision.ts", "utf8").match(/DECIDE_ENGINE_REVISION\s*=\s*\x27([^\x27]+)\x27/)[1];
const acc = JSON.parse(readFileSync("docs/ops/decide-testers.json", "utf8")).accounts;
let t = 0, o = 0; const label = new Map(acc.map((a) => [a.id.toLowerCase(), a.role === "owner" ? `Owner ${String.fromCharCode(65 + o++)}` : `Tester ${++t}`]));
const sql = `select user_id, count(*)::int as n from public.decide_shadow_runs where engine_revision = \x27${rev}\x27 group by user_id`;
const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROD_PROJECT_REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql, read_only: true }) });
const rows = await r.json();
console.log(`revision ${rev}`); for (const x of rows) console.log(`${label.get(x.user_id) ?? "Not on list"}: ${x.n} of 6`);
'
```

The review waits until each switched-on account shows `6 of 6`, or until 10 days after the update, whichever comes first (D-163). An account whose records are not up to date sends after up to 7 days, with `ready = 0` (D-145).

## 4. The summary page

```bash
fw npm run shadow:report
# a later round: fw node scripts/shadow-report.mjs --previous <older revision>
```

This writes `reports/shadow/<revision>.html`, which is gitignored and never committed. The orchestrator also publishes the page as a private claude.ai page for the owner (D-164).

The script exits 1 when rows come from an account on no list. Treat that like a failed release check: switch the account off (step 5) and find out how it got on.

## 5. Stop (switch off and delete)

The 08.1 tester policy is D-162 (decided in 08.1). The two parts are below.

Switch off. Use the same command as step 1 with `decide_shadow = false`, filtered to the one account. Then run step 2.

Delete that account's rows:

```sql
with d as (delete from public.decide_shadow_runs where user_id = '<id>' returning 1) select count(*)::int from d
```

Send it through the Management API as in step 1, building `<id>` from the tester file inside the script. Never type or print the id.

Deleting the account also deletes its rows (`on delete cascade`).

After the first round, switching the owner accounts off is optional. Their phones send again only when `DECIDE_ENGINE_REVISION` changes (D-146).
