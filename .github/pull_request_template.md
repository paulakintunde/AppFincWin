## Summary

## Migration checklist (FND-10, expand/contract)
- [ ] No migration in this PR, or every migration is additive (new tables, nullable columns, columns with defaults, new functions)
- [ ] Nothing an installed app still reads is dropped, renamed or narrowed
- [ ] No RPC/function signature (arguments or return shape), view column or type an installed app uses is removed, renamed or changed, including through `create or replace function`
- [ ] Any destructive statement ships in its own migration with its own `-- contract-ok: min_version >= X.Y.Z` directly above it (plus `-- squawk-ignore <rule>` for a squawk rule), and an earlier migration already raised `app_config.min_supported_version` to X.Y.Z
- [ ] RLS policies and column grants still hold for old app versions (the linter cannot see policy changes)
- [ ] New or changed SQL money functions keep `07_money_rounding_mirror.test.sql` generated from the fixture (`npm run check:money-mirror`)
- [ ] `npm run supabase:db:push` is run only after CI is green; it targets production
