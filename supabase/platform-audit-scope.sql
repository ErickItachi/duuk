alter table public.duuk_audit add column required_permission text references public.duuk_permission_keys;
create function duuk_private.audit_scope() returns trigger language plpgsql set search_path='' as $$ begin
 new.required_permission=case new.entity when 'duuk_expenses' then 'finance' when 'duuk_contracts' then 'contracts' when 'duuk_contract_signatures' then 'contracts' when 'duuk_events' then 'agenda' when 'duuk_content' then 'site' when 'duuk_clients' then 'crm' when 'duuk_activities' then 'crm' when 'duuk_follow_ups' then 'crm' when 'duuk_mail_links' then 'mail' when 'duuk_profiles' then 'team' when 'duuk_roles' then 'permissions' when 'duuk_role_permissions' then 'permissions' when 'duuk_user_permissions' then 'permissions' when 'duuk_permissions' then 'permissions' else null end;
 return new;
end; $$;
create trigger audit_scope before insert on public.duuk_audit for each row execute function duuk_private.audit_scope();
update public.duuk_audit set required_permission=case entity when 'duuk_expenses' then 'finance' when 'duuk_contracts' then 'contracts' when 'duuk_contract_signatures' then 'contracts' when 'duuk_events' then 'agenda' when 'duuk_content' then 'site' when 'duuk_clients' then 'crm' when 'duuk_activities' then 'crm' when 'duuk_follow_ups' then 'crm' when 'duuk_mail_links' then 'mail' when 'duuk_profiles' then 'team' when 'duuk_roles' then 'permissions' when 'duuk_role_permissions' then 'permissions' when 'duuk_user_permissions' then 'permissions' when 'duuk_permissions' then 'permissions' else null end;
create index duuk_audit_permission_idx on public.duuk_audit(required_permission);
drop policy audit_read on public.duuk_audit;
create policy audit_read on public.duuk_audit for select to authenticated using((select duuk_private.has_permission('audit')) and duuk_private.has_permission(required_permission));
revoke all on function duuk_private.audit_scope() from public,anon,authenticated;
alter table public.duuk_clients add constraint client_tags_size check(char_length(array_to_string(tags,','))<=1200);
update public.duuk_mail_templates set body=replace(body,chr(92)||'n',chr(10));
