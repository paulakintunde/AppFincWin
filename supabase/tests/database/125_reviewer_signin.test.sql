-- pgTAP: 10-19 (ACC-11) reviewer allow-list, is_reviewer_email and hook_before_user_created, migration 20261126000600.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into public.reviewer_allowlist (email, note) values ('appreview@example.test', 'pgTAP fixture');

select extensions.has_table('public', 'reviewer_allowlist', 'the allow-list table exists');
select extensions.ok(public.is_reviewer_email('APPREVIEW@example.test'), 'is_reviewer_email case-folds the input');
select extensions.ok(not public.is_reviewer_email('stranger@example.test'), 'an unlisted email is not a reviewer');
select extensions.ok(not public.is_reviewer_email(null), 'null is not a reviewer');

select extensions.is(
  public.hook_before_user_created('{"user":{"email":"stranger@example.test","app_metadata":{"provider":"email","providers":["email"]},"identities":[]}}'::jsonb) #>> '{error,http_code}',
  '403',
  'an email sign-up for an unlisted email is refused with 403'
);
select extensions.is(
  public.hook_before_user_created('{"user":{"email":"AppReview@example.test","app_metadata":{"provider":"email","providers":["email"]},"identities":[]}}'::jsonb),
  '{}'::jsonb,
  'an email sign-up for a listed email passes (case-folded)'
);
select extensions.is(
  public.hook_before_user_created('{"user":{"email":"stranger@example.test","app_metadata":{"provider":"apple","providers":["apple"]},"identities":[]}}'::jsonb),
  '{}'::jsonb,
  'an Apple sign-up passes for any email'
);
select extensions.is(
  public.hook_before_user_created('{"user":{"email":"stranger@example.test","app_metadata":{"provider":"google","providers":["google"]},"identities":[]}}'::jsonb),
  '{}'::jsonb,
  'a Google sign-up passes for any email'
);
select extensions.is(
  public.hook_before_user_created('{"user":{"email":"","app_metadata":{"provider":"email","providers":["email"]},"identities":[]}}'::jsonb) #>> '{error,http_code}',
  '403',
  'an email sign-up with an empty email is refused'
);

select extensions.ok(not has_table_privilege('anon', 'public.reviewer_allowlist', 'select'), 'anon cannot select the allow-list');
select extensions.ok(not has_table_privilege('authenticated', 'public.reviewer_allowlist', 'select'), 'authenticated cannot select the allow-list');
select extensions.ok(has_table_privilege('supabase_auth_admin', 'public.reviewer_allowlist', 'select'), 'supabase_auth_admin can select the allow-list');
select extensions.ok(
  not has_function_privilege('authenticated', 'public.is_reviewer_email(text)', 'execute')
  and not has_function_privilege('anon', 'public.is_reviewer_email(text)', 'execute')
  and has_function_privilege('service_role', 'public.is_reviewer_email(text)', 'execute'),
  'is_reviewer_email is service_role only'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute')
  and has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'),
  'the hook is executable by supabase_auth_admin only'
);

select * from extensions.finish();
rollback;
