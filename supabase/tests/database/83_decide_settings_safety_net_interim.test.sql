-- pgTAP: 05.5 Band B (D-09, ARC-09) -- the interim safety-net columns are gone; reserve and reserve_account_id stay.
-- Migration 20261121000300_decide_settings_drop_interim_columns.sql.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(5);

select extensions.hasnt_column('public', 'decide_settings', 'safety_net_protect', 'safety_net_protect is dropped');
select extensions.hasnt_column('public', 'decide_settings', 'safety_net_size', 'safety_net_size is dropped');
select extensions.hasnt_column('public', 'decide_settings', 'safety_net_locked', 'safety_net_locked is dropped');
select extensions.has_column('public', 'decide_settings', 'reserve', 'reserve stays');
select extensions.has_column('public', 'decide_settings', 'reserve_account_id', 'reserve_account_id stays');

select * from extensions.finish();
rollback;
