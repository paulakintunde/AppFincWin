---
phase: 01-money-core
decided: 2026-09-24
source: user answers to post-review questions (01-REVIEW.md / 01-REVIEW-FIX.md)
---

# Phase 1 — Post-Review Product Decisions

| ID | Topic | Decision | Status |
|----|-------|----------|--------|
| RD-01 | Custom unit value range (IN-A02) | **No upper cap.** Investments can be worth 100M–1B+. Keep only the guard that a derived per-EUR rate must not round to zero / overflow. | done |
| RD-02 | Region detection (WR-A11) | Precedence: **explicit in-app region override > device region > time zone tiebreak. No IP geolocation.** Respecting the user's region preference is important. | done |
| RD-03 | High-value custom-unit precision (WR-B07) | **Exact:** store the unit value and reference rate used on each transaction; convert unit × reference directly with no rounded intermediate. TS engine and SQL mirror stay bit-identical. | done |
| RD-04 | Transaction date window (WR-B01) | **1900-01-01 to today + 1 year**, as implemented. | kept |
| RD-05 | resolve-rate throttling (IN-B01) | **Simple DB-backed per-user limit** (~60 calls/hour), over-limit → `{ok:false,error:'rate-limited'}`. | done |
| RD-06 | Drop-hold repair selection (WR-B05) | **Keep the heuristic** (pending, same rate_date, or within the 7-day serve window, either leg). | kept |
| RD-07 | ISO 4217 shadow list (WR-B06) | **Static floor + seeded from the daily currency-metadata sync** so new codes are added automatically. | done |
| RD-08 | Migration gate floor rule (WR-C02, CR-C03) | **Keep strict:** one marker per destructive statement, citing a floor raised by an earlier migration. | kept |
| RD-09 | CI supply chain (IN-C02) | **Pin actions and the gitleaks image by SHA/digest** (tag kept as a comment) **+ Dependabot for github-actions.** | done |
