# Phase 10 owner setup (do this in one sitting)

Owner-facing copy of this guide: https://claude.ai/artifact/ReUpbDU1EJGQzPbQa9ww6P

This is every step in Phase 10 that only you can do: accounts, keys and files. It should take one sitting. Do the steps in order. Never paste a secret into chat, a commit or a command line. Where a command asks for a value, it will prompt you and hide what you type.

Steps were checked against the vendors' own docs on 2026-11-22. Dashboards move things around, so if a menu name differs, look for the closest match.

What the app is: a money tracking tool. It holds no money. Nothing in this guide changes that.

## 1. Cloudflare R2 (backup storage, D-31)

R2 holds the daily encrypted database backups. Use the existing company Cloudflare account (D-07).

1. Sign in to the Cloudflare dashboard. Open R2 object storage. The first time, it asks you to "Purchase R2". Do it. The free tier covers 10 GB-month and egress is free, so ~30 daily dumps cost nothing. Have a card or PayPal ready for the account.
2. R2 object storage, Overview, Create bucket.
   - Name: `fincwin-backups`
   - Location: Specify jurisdiction, then United States (us). You cannot change the jurisdiction later.
3. Open the bucket, Settings, Object Lifecycle Rules, Add rule. Delete objects 30 days after upload, for the whole bucket (D-07). Name it `delete-after-30-days`.
4. On the same Settings page, find S3 API. Copy the endpoint exactly as shown. For a us bucket it looks like `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com`. Keep it for step 4 (repo secret `R2_ENDPOINT`). Also note your Account ID (R2 Overview).
5. Make two API tokens. R2 object storage, Overview, Account Details, API Tokens, Manage, then "Create Account API token" (not a User token).
   - `fincwin-backup-write`: Object Read & Write, bucket `fincwin-backups` only.
   - `fincwin-backup-read`: Object Read only, bucket `fincwin-backups` only.
   - The secret is shown once. Copy the Access Key ID and Secret Access Key for each into a safe place until step 4.

## 2. age keypair (backup encryption, D-06)

1. Install age. No Docker needed. In PowerShell: `winget install --id FiloSottile.age`. Open a new terminal afterwards.
2. In a folder outside the repo, run: `age-keygen -o fincwin-backup.agekey`. Do not use the `-pq` option.
3. Open the file. The line starting `# public key: age1...` is the public key. It becomes GitHub variable `AGE_PUBLIC_KEY` (step 4). The private key is the line starting `AGE-SECRET-KEY-`. It becomes secret `AGE_PRIVATE_KEY` (step 4) plus an offline copy in your password manager and on a USB stick.
4. After step 4 is done, delete the file from the dev machine.

If the private key is lost, every backup is unreadable and cannot be recovered. Keep two offline copies.

## 3. Supabase connection string and keys

1. Supabase dashboard, project "Fincwin United", Connect, Session pooler. Copy the URI. It uses host `aws-<n>-us-west-2.pooler.supabase.com`, port 5432, user `postgres.cohmcbdfgqmiwykztrdg`.
2. Put your database password in place of the placeholder. The password is `SUPABASE_DB_PASSWORD` in `C:/dev/fincwin/.env.local`. If it has special characters (`@ : / ? # %`), URL-encode them. This whole string becomes repo secret `SUPABASE_DB_URL_POOLER` (step 4).
3. Settings, API Keys. Copy the project URL (`SUPABASE_URL`) and the new publishable key (starts `sb_publishable_`). Store the publishable key under the secret name `SUPABASE_ANON_KEY`. The keep-alive ping uses both.

## 4. GitHub secrets, variable and the `restore` secrets

First check which path you are on:

```
gh repo view --json visibility -q .visibility
gh api user -q .plan.name
```

GitHub environments only work on public repos or paid plans. A private repo on GitHub Free cannot have environments.

Repo-level secrets (both paths). Each command prompts for the value, so do not add `--body`:

```
gh secret set SUPABASE_DB_URL_POOLER
gh secret set R2_ACCOUNT_ID
gh secret set R2_ENDPOINT
gh secret set R2_BACKUP_ACCESS_KEY_ID
gh secret set R2_BACKUP_SECRET_ACCESS_KEY
gh secret set SUPABASE_URL
gh secret set SUPABASE_ANON_KEY
gh variable set AGE_PUBLIC_KEY
```

Now the three restore secrets: `AGE_PRIVATE_KEY`, `R2_RESTORE_ACCESS_KEY_ID`, `R2_RESTORE_SECRET_ACCESS_KEY`. Pick one path.

**Path A: public repo, or a paid plan (Pro).**
1. Settings, Environments, New environment, name it `restore`.
2. Deployment branches: only `main`. Do not set required reviewers (the monthly restore check must run unattended).
3. Add the secrets to that environment:
   ```
   gh secret set AGE_PRIVATE_KEY --env restore
   gh secret set R2_RESTORE_ACCESS_KEY_ID --env restore
   gh secret set R2_RESTORE_SECRET_ACCESS_KEY --env restore
   ```
   For `AGE_PRIVATE_KEY`, paste the one `AGE-SECRET-KEY-...` line when prompted.

**Path B: private repo on GitHub Free (no environments).**
1. Store the same three as ordinary repo secrets:
   ```
   gh secret set AGE_PRIVATE_KEY
   gh secret set R2_RESTORE_ACCESS_KEY_ID
   gh secret set R2_RESTORE_SECRET_ACCESS_KEY
   ```
2. Tell Claude "path B" so the restore workflow reads them as repo secrets and keeps them out of the backup job.

Note: this repo has been public since 2026-09-23, so Path A is expected.

## 5. Firebase and FCM (Android push, ENV-19)

1. console.firebase.google.com, create a project named "FincWin". Turn Analytics off.
2. Add an Android app with package name `com.fincwin.app`. Download `google-services.json` and save it at `C:/dev/fincwin/google-services.json` (main checkout; plan 10-27 commits it).
3. Project settings, Service accounts, Generate new private key. A JSON file downloads. If you see "Service account key creation is disabled", an organisation admin must relax the policy `iam.disableServiceAccountKeyCreation` for this project, then retry.
4. Upload that key to EAS. Either:
   - expo.dev, project, Credentials, Android, `com.fincwin.app`, Service credentials, FCM V1 service account key, upload; or
   - `eas credentials -p android`, choose production, Google Service Account, Manage your Google Service Account Key for Push Notifications (FCM V1).
5. Delete the service-account JSON from your machine after the upload.
6. A change to FCM needs a new native Android build before it takes effect.

APNs (iOS push) stays blocked until Apple enrolment (ENV-10). EAS makes the APNs key on the first iOS build after that.

## 6. gitleaks approval

`google-services.json` carries a Google API key that gitleaks flags. Firebase documents it as non-secret. Approve an exact-path allow-list entry `^google-services\.json$` (exact name only, never a wildcard). Answer yes or no in the Done table.

## 7. Expo push access token (D-32)

1. Best: a robot user token. expo.dev, account settings, Access tokens, create a token named `fincwin-push` (a personal token at expo.dev/settings/access-tokens also works).
2. The "Enhanced security for push notifications" switch is an account-level toggle on the Access tokens page. Leave it OFF for now. Plan 10-29 turns it on after the alerts function is sending the token. Turning it on early would block pushes.
3. Keep the token for plan 10-29, where it becomes Supabase function secret `EXPO_ACCESS_TOKEN`. Do not put it in the repo.
4. Note: alert text (who, amount, category) passes through Expo. Disclose this in the Phase 11 privacy copy (D-32).

## 8. Wallet exports (D-24)

Download one CSV from each of your own PayPal, Wise and Revolut accounts. Together they should cover: a payment with a fee, a currency conversion, a refund, a pending or failed row, and a foreign-currency card payment. Save them OUTSIDE the repo, in `C:/dev/fincwin-private/wallet-exports/`, as `paypal.csv`, `wise.csv` (one file per currency is fine, such as `wise-EUR.csv`, `wise-GBP.csv`) and `revolut.csv`. Claude strips names, emails, IBANs and card digits in plan 10-28 before anything enters git.

- PayPal: Activity, Download (or Statements, Activity report). CSV, up to 12 months per report.
- Wise: open a balance, the three-dot menu, Statements and reports, Statements, Create a statement. CSV, up to 365 days, one per currency.
- Revolut: app Home, Accounts, pick the currency, More, Statement. It offers Excel; CSV may be offered too. If only Excel, save that and say so.

## 9. Reviewer accounts (D-25, D-26, D-30)

1. Pick two emails on the product domain, for example `appreview@fincwin.com` and `appreview-partner@fincwin.com`.
2. Cloudflare Email Routing can forward them. It now lives under Compute, Email Service, Email Routing, Onboard Domain. Warning: onboarding replaces any existing MX records on that domain, and `fincwin.com` already has inbound routing for `support@fincwin.com`. Check the current routes and add the new addresses to the existing setup instead of re-onboarding.
3. Choose one strong password, 20 characters or more.
4. Put `REVIEWER_EMAIL`, `REVIEWER_PARTNER_EMAIL` and `REVIEWER_PASSWORD` in `C:/dev/fincwin/.env.local` only. Never commit them, never print them. `.env.example` lists the names only.

## 10. Done table

Filled by you or by Claude from your reply. Claude checks names only (`gh secret list`, `gh variable list`, `ls` of the wallet folder, `test -f` on google-services.json, `grep -c` on the three REVIEWER_ names). No values are printed.

| Step | What | Done | Date | Notes |
| --- | --- | --- | --- | --- |
| 1 | R2 bucket `fincwin-backups`, us, 30 days, two tokens | | | |
| 2 | age keypair, offline copies, local file deleted | | | |
| 3 | Session pooler URI, SUPABASE_URL, SUPABASE_ANON_KEY | | | |
| 4 | GitHub secrets, `AGE_PUBLIC_KEY`, restore secrets (Path A or B) | | | |
| 5 | Firebase project, google-services.json, FCM v1 key on EAS | | | |
| 6 | gitleaks exact-path allow-list for google-services.json (yes/no) | | | |
| 7 | Expo access token created, enhanced security left OFF | | | |
| 8 | Wallet CSVs in `C:/dev/fincwin-private/wallet-exports` (name any missing wallet) | | | |
| 9 | Reviewer emails and password in `.env.local` | | | |

## Notes for later plans (not owner steps)

- Plan 10-20 (backup workflow): Supabase's own GitHub Actions backup guide (supabase.com/docs/guides/deployment/ci/backups) uses `supabase db dump --remote=<url>` for roles, schema and data instead of raw `pg_dump`. Consider that route.
- Secret names later plans rely on: `SUPABASE_DB_URL_POOLER`, `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, variable `AGE_PUBLIC_KEY`, restore secrets `AGE_PRIVATE_KEY`, `R2_RESTORE_ACCESS_KEY_ID`, `R2_RESTORE_SECRET_ACCESS_KEY`. Set in plan 10-29: Supabase function secrets `EXPO_ACCESS_TOKEN`, `ALERTS_DELIVER_SECRET`; Vault secrets `alerts_deliver_url`, `alerts_deliver_secret`.
