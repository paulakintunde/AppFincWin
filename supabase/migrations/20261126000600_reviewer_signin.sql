-- Phase 10 (10-19): ACC-11 reviewer sign-in allow-list (D-25) and email sign-up refusal. Entry point is a visible link (D-30, Guideline 2.5.19).
-- No emails are inserted here (the repo is public); the ops script in 10-25 adds them.

create table public.reviewer_allowlist (
  email text primary key check (email = lower(email) and char_length(email) <= 254),
  user_id uuid null references auth.users(id) on delete set null,
  note text not null default '' check (char_length(note) <= 80),
  created_at timestamptz not null default now()
);

alter table public.reviewer_allowlist enable row level security;
revoke all on public.reviewer_allowlist from anon, authenticated;
grant select on public.reviewer_allowlist to supabase_auth_admin;

-- Used by the reviewer-signin Edge Function (service role). Case-folded.
create or replace function public.is_reviewer_email(p_email text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.reviewer_allowlist where email = lower(p_email));
$$;

revoke execute on function public.is_reviewer_email(text) from public, anon, authenticated;
grant execute on function public.is_reviewer_email(text) to service_role;

-- Before-user-created auth hook. Payload: { metadata, user: { email, app_metadata: { provider, providers }, identities, ... } }.
-- Refuses email sign-ups for emails not on the allow-list; Apple and Google sign-ups pass.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_email text := lower(coalesce(event #>> '{user,email}', ''));
begin
  if v_provider = 'email' and not exists (select 1 from public.reviewer_allowlist where email = v_email) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign-up is not available.'));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
