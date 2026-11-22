# Phase 10: System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-11-22
**Phase:** 10-system
**Areas discussed:** Phone lock, Backups, Alerts and push, Month archive, Delete and local data, Wallet import, Reviewer sign-in, Offline limit

The owner picked the recommended option in every question except "Sample files", where they chose "Yes, I'll provide some".

## Phone lock
| Question | Options | Selected |
|---|---|---|
| On by default? | Offer once, off by default / On by default / Off, settings only | Offer once, off by default |
| When to ask | User picks, default 1 min / Every open / Fixed 5 min | User picks, default 1 min |
| PIN rules | 6 digits then sign in again / 4 digits then sign in again / 6 digits and wipe the phone copy | 6 digits, then sign in again |
| App switcher | Plain cover always / Cover only if lock on / Blur | Plain cover always |

## Backups
| Question | Options | Selected |
|---|---|---|
| How often | Daily / Weekly (as of Nov 22) / Weekly now, daily from launch | Daily (supersedes the weekly note) |
| Where | GitHub Actions to private cloud storage / GitHub only / You decide | GitHub Actions to S3 or R2 |
| Keep for | 30 / 7 / 90 days | 30 days |
| Restore test | Once now, then monthly by a scheduled job / Once now and once before launch / Once only | Once now, then monthly by a scheduled job |

## Alerts and push
| Question | Options | Selected |
|---|---|---|
| Default on | Bills due + goal reached / All five / All off | Bills due + goal reached |
| Amounts | From the user's own months / Flat per currency / User must type one | From the user's own months |
| Timing | Digest 8am, quiet hours 10pm–7am / Weekly Monday digest / 6pm digest | Digest 8am, quiet hours 10pm–7am |
| Partner push | Receiver's own amount / One household amount / Off by default | Receiver's own amount, can be muted |

## Month archive
| Question | Options | Selected |
|---|---|---|
| Still counts? | Yes, view only / No, left out of answers | Yes, view only |
| Editing | Read-only until restored / Fully editable | Read-only until restored |
| Household | Personal / Whole household | Personal |
| Who gets it | Expert level / Everyone | Expert level |

## Delete and local data
| Question | Options | Selected |
|---|---|---|
| Phone copy | Save a CSV first, then wipe / Keep a read-only copy / Wipe only | Save a CSV first, then wipe |
| Timing | At once / 7-day cooling-off | At once |
| Backups | Say it plainly and let backups expire / Edit every backup | Say it plainly and let backups expire |

## Wallet import
| Question | Options | Selected |
|---|---|---|
| Which apps | PayPal, Wise, Revolut / plus Monzo, Starling, N26 / One generic reader | PayPal, Wise, Revolut |
| New balances | Suggest, user confirms / Auto-create / Skip | Suggest, user confirms |
| Fees | Two lines (gross + fee) / One line at net | Two lines |
| Sample files | Yes / No, use public examples / Some | Yes, the owner provides them |

## Reviewer sign-in
| Question | Options | Selected |
|---|---|---|
| Way in | Hidden email + password, allow-list only / Visible email link / One-time code by email | Hidden email + password, allow-list only |
| Data | Full sample life, reset nightly / Empty account | Full sample life, reset nightly |

## Offline limit
| Question | Options | Selected |
|---|---|---|
| Cap | 500 / 200 / 1,000 | 500 (note at 400) |
| Message tone | Plain and calm / Warning style | Plain and calm |

## Claude's Discretion
How the device list reads and revokes sessions, the push provider and scheduling, the bills-due lead time and digest content, the rate-limit scheme, the content of the diagnostic export, the DAT-03 template format, alert registry entries, and re-verifying SYN-03.

## Deferred Ideas
More app-bank readers (Monzo, Starling, N26), a signed-out read-only mode, a deletion cooling-off period, and upgrading Supabase to Pro (waits for revenue).
