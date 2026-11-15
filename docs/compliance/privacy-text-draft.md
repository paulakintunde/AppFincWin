# Privacy text draft

Draft for Phase 11 lawyer sign-off (CMP-F20). Not published.

Every paragraph cites the data-map rows it rests on (`data-map.md`). If a paragraph and the data map disagree, the data map is right and this text changes. The existing published paragraphs (PDF statements, remembered accounts) are folded in below and stay in their own files until Phase 11 merges them.

FincWin is a personal and household money record and planning tool. It holds no money, makes no trades, offers no loans and is not a regulated financial service.

## What we store

- The money records you enter or import: transactions, accounts, categories, regular bills and pay, goals, debts and investment records you type in (DM-01, DM-02, DM-03, DM-04, DM-05, DM-06, DM-12, DM-13, DM-14).
- Your Decide checks and setup: the item and price you check, what Decide showed, and your own answers (DM-10, DM-11, DM-15, DM-27).
- Your account and preferences: name and email from Apple or Google sign-in, home currency, region, display choices and your analytics choice (DM-09, DM-20).
- Your household: its members' names and links (DM-08).
- On your phone only: a copy of what the app last read so it opens offline, your sign-in key, and up to three remembered sign-in names and emails (DM-21, DM-22, DM-23).

We do not store bank logins, card numbers or passwords.

## Why

We keep these records so the app can show your own months back to you and work out whether a purchase fits them (DM-01, DM-10, DM-11). The basis is that you asked us to provide the service (GDPR Article 6(1)(b)). Analytics run only after you agree (Article 6(1)(a), DM-25). Crash reports run without a person attached, on legitimate interest (Article 6(1)(f), DM-26).

## Who processes it

- **Supabase** stores your records and runs sign-in, in the United States (AWS us-west-2) (DM-01 to DM-16, DM-19, DM-20).
- **Apple or Google** confirm who you are when you sign in (DM-20).
- **PostHog** (EU) receives usage events if you agree. Events carry no amounts, payees or names (DM-25).
- **Sentry** (US) receives crash reports with amounts, names and emails removed, and no link to a person (DM-26).

Transfers outside the EEA rest on the processors' data processing agreements and standard contractual clauses.

## How long

- Your records stay until you delete them. A deleted Decide row is kept for up to 30 days so Undo works, then purged (DM-10).
- A PDF statement you import is read and deleted straight after, usually within seconds. If an upload is interrupted, it is deleted automatically within two hours. We keep nothing from it except the transactions you choose to import (DM-19). CSV and OFX files are read on your phone and never leave it.
- The on-phone copy and sign-in key are removed when you sign out (DM-21, DM-22).
- Remembered accounts are removed with "Not you? Remove", or when you uninstall (DM-23).
- Vendor retention periods for analytics and crash reports are to be filled in from the vendors' settings before publication (DM-25, DM-26).

## Your rights

- **Erasure.** Deleting your account removes your records from our database, including household data you own (DM-01 to DM-20). The in-app deletion action ships in Phase 10; the database already deletes everything linked to your account.
- **Export.** You can download your records. The full download ships in Phase 10 (DM-01 to DM-15).
- **Access, correction and objection.** Contact us at the support address on the privacy page; a person replies.
- **Withdraw analytics consent** at any time in settings; it takes effect at once (DM-25).
- **Data processing agreement.** Available on request for household and business use.
- **Complaint.** You can complain to your local data protection authority.

## Apple privacy label

All data types below are linked to the user's account, used for app functionality, and used for tracking: no. Nothing is shared with advertisers or data brokers.

| Apple data type | Linked to user | Used for tracking | Source rows |
|---|---|---|---|
| Financial info: other financial info (transactions, balances, bills, debts, goals) | Yes | No | DM-01, DM-02, DM-04, DM-12, DM-13, DM-14 |
| Contact info: name | Yes | No | DM-09, DM-20 |
| Contact info: email address | Yes | No | DM-09, DM-20 |
| User content: other user content (notes, item names in checks) | Yes | No | DM-01, DM-10 |
| Identifiers: user ID | Yes | No | DM-20, DM-25 |
| Usage data: product interaction (only after consent) | Yes | No | DM-25 |
| Diagnostics: crash data and performance data | No (anonymous) | No | DM-26 |

## Google Play Data safety

| Play data type | Collected | Shared | Purpose | Optional | Source rows |
|---|---|---|---|---|---|
| Financial info: other financial info | Yes | No (processor only) | App functionality | No | DM-01, DM-02, DM-04, DM-12, DM-13, DM-14 |
| Personal info: name | Yes | No | Account management | No | DM-09, DM-20 |
| Personal info: email address | Yes | No | Account management | No | DM-09, DM-20 |
| Personal info: user IDs | Yes | No | App functionality, analytics | No | DM-20, DM-25 |
| App activity: app interactions | Yes, only after consent | No | Analytics | Yes | DM-25 |
| App info and performance: crash logs | Yes | No | Diagnostics | No | DM-26 |
| Photos and files: files and docs (PDF statement, deleted after reading) | Yes, only when imported | No | App functionality | Yes | DM-19 |

Data is encrypted in transit. Account deletion is available (in-app action in Phase 10). Data safety answers are re-checked against this map at each release.
