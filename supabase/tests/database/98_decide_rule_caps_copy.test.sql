-- pgTAP: 05.5 Band B (ARC-09) -- decide_copy_rule_caps() is retired in 20261121000300; category_cap rules no longer live in the rules document.
-- (Its Band A behaviour was proven here until Band B.)

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(1);

select extensions.hasnt_function('public', 'decide_copy_rule_caps', 'the rule-cap copy function is retired');

select * from extensions.finish();
rollback;
