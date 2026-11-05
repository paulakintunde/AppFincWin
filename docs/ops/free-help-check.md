# Free-help entries: person check (CMP-F04)

The money-help pointers Decide shows (src/engine/decide/v3/help/freeHelp.ts, D-122..D-125) are checked by a person before launch and every 90 days. Websites only; no phone numbers are stored.

| Country | Name | Website | Checked on | Checked by | Result |
|---|---|---|---|---|---|
| UK (GB) | MoneyHelper | https://www.moneyhelper.org.uk | 2026-11-05 | Owner | Loads; money help at no cost (checked by hand; the site blocks automated fetches with 403) |
| US | NFCC | https://www.nfcc.org | 2026-11-05 | Owner | Loads; money help at no cost (HTTP 200) |
| Canada (CA) | Credit Counselling Canada | https://creditcounsellingcanada.ca | 2026-11-05 | Owner | Loads; money help at no cost (HTTP 200) |

**Next check due: 2027-02-03** (90 days). At each check, open every link, confirm it is still a no-cost money-help service for that country, update `checkedOn` in freeHelp.ts and add a row below.

## Check log

| Date | By | Outcome |
|---|---|---|
| 2026-11-05 | Owner | All three confirmed (05.4-38 Task 3) |
