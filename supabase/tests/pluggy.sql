-- Synthetic credentials and actors; no external calls and full rollback.
begin;
do $$
declare actor uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); role_id uuid:=gen_random_uuid(); no_finance uuid:=gen_random_uuid(); payload jsonb; cfg jsonb; version_before bigint; secret_id uuid;
begin
 insert into public.duuk_roles(id,name) values(role_id,'QA Pluggy '||role_id),(no_finance,'QA Pluggy denied '||no_finance);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(role_id,'finance',true),(role_id,'audit',true),(no_finance,'audit',true);
 insert into auth.users(id,email) values(actor,actor||'@test.invalid'),(member_id,member_id||'@test.invalid'),(denied,denied||'@test.invalid'),(disabled,disabled||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,active,is_super_admin,role_id) values(actor,'QA Pluggy admin',actor||'@test.invalid',true,true,role_id),(member_id,'QA finance',member_id||'@test.invalid',true,false,role_id),(denied,'QA denied',denied||'@test.invalid',true,false,no_finance),(disabled,'QA disabled',disabled||'@test.invalid',false,true,role_id);
 if has_function_privilege('authenticated','public.duuk_pluggy_backend(text,jsonb)','execute') or has_function_privilege('anon','public.duuk_pluggy_backend(text,jsonb)','execute') or has_table_privilege('authenticated','duuk_private.pluggy_settings','select') then raise exception 'Pluggy backend exposed'; end if;
 if not(select relrowsecurity from pg_class where oid='duuk_private.pluggy_settings'::regclass) then raise exception 'Missing private RLS'; end if;
 cfg:=public.duuk_pluggy_backend('status',jsonb_build_object('user_id',actor));version_before:=(cfg->>'version')::bigint;
 payload:=jsonb_build_object('user_id',actor,'expected_version',version_before,'connector_id',200,'own_data_confirmed',true,'credentials',jsonb_build_object('clientId','qa-client-id-only','clientSecret','qa-secret-no-real-provider'),'item_id',gen_random_uuid(),'account_id',gen_random_uuid(),'account_label','QA test account','account_last_four','9999');
 begin perform public.duuk_pluggy_backend('configure',jsonb_set(payload,'{connector_id}','600'));raise exception 'Paid connector accepted';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_pluggy_backend('configure',payload-'connector_id');raise exception 'Missing connector accepted';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_pluggy_backend('configure',jsonb_set(payload,'{own_data_confirmed}','false'));raise exception 'Own-data confirmation bypassed';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_pluggy_backend('configure',jsonb_set(payload,'{user_id}',to_jsonb(member_id)));raise exception 'Nonadmin configuration allowed';exception when sqlstate 'PT403' then null;end;
 perform public.duuk_pluggy_backend('configure',payload);
 cfg:=public.duuk_pluggy_backend('status',jsonb_build_object('user_id',member_id));
 if cfg->>'configured'<>'true' or cfg->>'can_configure'<>'false' or cfg::text like '%qa-secret%' or cfg ? 'credentials' or cfg ? 'account_id' or cfg ? 'item_id' then raise exception 'Status incorrect or exposed credentials'; end if;
 if (cfg->>'version')::bigint<>version_before+1 then raise exception 'Config revision not incremented';end if;
 select credential_id into secret_id from duuk_private.pluggy_settings where singleton=true;
 if not exists(select 1 from vault.decrypted_secrets where id=secret_id and decrypted_secret::jsonb->>'clientSecret'='qa-secret-no-real-provider') then raise exception 'Secret not in Vault';end if;
 begin perform public.duuk_pluggy_backend('configure',payload);raise exception 'Stale config overwrite allowed';exception when sqlstate 'PT409' then null;end;
 if not exists(select 1 from public.duuk_audit where actor_id=actor and entity='duuk_pluggy' and required_permission='finance' and details->>'read_only'='true') then raise exception 'Bank connection audit not private';end if;
 begin perform public.duuk_pluggy_backend('status',jsonb_build_object('user_id',denied));raise exception 'Nonfinance status allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_pluggy_backend('configuration',jsonb_build_object('user_id',disabled));raise exception 'Disabled config read allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_pluggy_backend('configuration','{}');raise exception 'Actor-free config read allowed';exception when sqlstate 'PT403' then null;end;
 execute 'set local role authenticated';
 begin perform public.duuk_pluggy_backend('configuration',jsonb_build_object('user_id',actor));raise exception 'Browser could fetch secrets';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform public.duuk_pluggy_backend('disconnect',jsonb_build_object('user_id',actor,'expected_version',version_before+1));
 if exists(select 1 from vault.secrets where id=secret_id) then raise exception 'Disconnect retained credential';end if;
 cfg:=public.duuk_pluggy_backend('status',jsonb_build_object('user_id',actor));
 if cfg->>'configured'<>'false' or cfg->>'account_label' is not null then raise exception 'Disconnect retained account';end if;
end;
$$;
rollback;
