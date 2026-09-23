#!/usr/bin/env node
// Supabase project-ref preflight.
//
// Confirms that the project ref pinned in supabase/config.toml matches the
// production ref in .env.local before any `supabase db push` is allowed to
// run. This exists because the Supabase MCP connector available in Claude
// sessions is authorized against a *different* Supabase account and cannot
// see this project at all -- see the "Supabase access" section in
// CLAUDE.md. The CLI / Management API path, gated by this script, is the
// only path verified to work against the real FincWin project.
//
// There is one Supabase project, and it is production. This script asserts
// the two refs match; it does not add a confirmation gate.
//
// Node builtins only. No dependencies, so it runs on a fresh clone before
// any `npm install`.
//
// Secret hygiene: this script reads exactly one key out of the env file --
// SUPABASE_PROD_PROJECT_REF -- and prints nothing else from it. It must
// never read or print the CLI access token, any service-role key, or any DB
// password env var. Project refs are not secret (they appear inside
// EXPO_PUBLIC_SUPABASE_URL), so printing both compared refs on failure is
// correct and required for a useful error.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REF_PATTERN = /^[a-z0-9]{20}$/;

function parseEnvFile(contents) {
  const map = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function extractProjectId(tomlContents) {
  const match = tomlContents.match(/^\s*project_id\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

function main() {
  const cwd = process.cwd();
  const problems = [];

  const envFilePath = resolve(
    cwd,
    process.env.SUPABASE_PREFLIGHT_ENV_FILE || ".env.local"
  );
  const configTomlPath = resolve(cwd, "supabase/config.toml");

  let envMap = {};
  let prodRef = null;

  if (!existsSync(envFilePath)) {
    problems.push(`env file not found: ${envFilePath}`);
  } else {
    envMap = parseEnvFile(readFileSync(envFilePath, "utf8"));
    prodRef = envMap.SUPABASE_PROD_PROJECT_REF ?? null;
  }

  let configRef = null;
  if (!existsSync(configTomlPath)) {
    problems.push(`supabase/config.toml not found: ${configTomlPath}`);
  } else {
    configRef = extractProjectId(readFileSync(configTomlPath, "utf8"));
    if (!configRef) {
      problems.push(
        `supabase/config.toml: project_id key not found in ${configTomlPath}`
      );
    } else if (!REF_PATTERN.test(configRef)) {
      problems.push(
        `supabase/config.toml: project_id "${configRef}" is not a valid 20-character project ref`
      );
    }
  }

  if (!prodRef) {
    if (existsSync(envFilePath)) {
      problems.push(
        `${envFilePath}: SUPABASE_PROD_PROJECT_REF is missing or empty`
      );
    }
  } else if (!REF_PATTERN.test(prodRef)) {
    problems.push(
      `${envFilePath}: SUPABASE_PROD_PROJECT_REF "${prodRef}" is not a valid 20-character project ref`
    );
  }

  if (
    configRef &&
    prodRef &&
    REF_PATTERN.test(configRef) &&
    REF_PATTERN.test(prodRef)
  ) {
    if (configRef !== prodRef) {
      problems.push(
        `project ref mismatch: supabase/config.toml has project_id="${configRef}", ${envFilePath} has SUPABASE_PROD_PROJECT_REF="${prodRef}"`
      );
    }
  }

  if (problems.length > 0) {
    console.error("SUPABASE PREFLIGHT FAILED");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }

  console.log(
    `Supabase preflight OK: project ref "${configRef}" matches ` +
      `supabase/config.toml (project_id) and ${envFilePath} (SUPABASE_PROD_PROJECT_REF).`
  );
  process.exit(0);
}

main();
