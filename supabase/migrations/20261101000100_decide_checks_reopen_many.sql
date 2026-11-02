-- 05.3-98 (UAT gap 21, D-19): a check can be reopened any number of times.
--
-- IN-B05 (20261021000100) added decide_checks_reopened_once, a partial unique index allowing one live reopened copy
-- per source check, so two devices could not each reopen one Past decision. The v3 screens deliberately allow many:
-- "Check again" and "Check another price" each make a NEW check carrying reopened_from (D-19). The unique index made
-- the second copy fail with 23505. Option (c) was chosen over reusing the live copy (it may already be a decided plan)
-- or dropping the link on later copies (the D-13 refund line and the home list read it). The lists' "Check again"
-- still opens an existing open copy on the client. The plain decide_checks_reopened_from_idx (20261016000100) stays.
--
-- Note: re-adding a unique index on reopened_from later fails once duplicate live copies exist; a one-copy rule
-- would need a data clean-up first.

drop index if exists public.decide_checks_reopened_once;
