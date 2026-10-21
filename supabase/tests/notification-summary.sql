-- Synthetic records only, rolled back. No provider, push or business message traffic.
begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); role_id uuid:=gen_random_uuid();
 factor uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid(); factor_v uuid:=gen_random_uuid(); session_v uuid:=gen_random_uuid(); cfg uuid; contact uuid:=gen_random_uuid(); thread uuid:=gen_random_uuid(); result jsonb;
begin
 insert into public.duuk_roles(id,name,description) values(role_id,'Notification summary fixture','Rollback only');
 insert into auth.users(id,email) values(u,u::text||'@notification.invalid'),(v,v::text||'@notification.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin) values(u,'Summary fixture',u::text||'@notification.invalid',role_id,true,false),(v,'Other fixture',v::text||'@notification.invalid',role_id,true,false);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(role_id,'mail',true),(role_id,'whatsapp',true),(role_id,'finance',true),(role_id,'agenda',true);
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(u,'finance',false),(v,'whatsapp',false);
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) values(factor,u,'Fixture','totp','verified',now(),now(),'fictional-only');
 insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values(session_id,u,factor,'aal2',now(),now());
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) values(factor_v,v,'Other fixture','totp','verified',now(),now(),'fictional-only');
 insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values(session_v,v,factor_v,'aal2',now(),now());
 insert into public.duuk_notifications(user_id,category,required_permission,title,link,dedupe_key)
 select u,'commercial','mail','Fictional mail','/admin/comercial/emails?mensagem='||g,'fixture:'||g from generate_series(1,150) g;
 insert into public.duuk_notifications(user_id,category,required_permission,title,link,dedupe_key) values
 (u,'finance','finance','Blocked finance','/admin/financeiro','fixture:blocked'),
 (v,'commercial','mail','Other member','/admin/comercial/emails','fixture:other'),
 (u,'agenda','agenda','Agenda','/admin/agenda?compromisso=fixture','fixture:agenda');
 insert into public.duuk_notifications(user_id,category,required_permission,title,link,dedupe_key,read_at) values(u,'commercial','mail','Already read','/admin/comercial/emails','fixture:read',now());
 select id into cfg from duuk_private.whatsapp_config where singleton;
 insert into duuk_private.whatsapp_contacts(id,wa_id,name) values(contact,'5511999981009','Fictional badge contact');
 insert into duuk_private.whatsapp_threads(id,config_id,contact_id,last_customer_at) values(thread,cfg,contact,now());
 insert into duuk_private.whatsapp_messages(thread_id,direction,type,body,status,occurred_at,source) values
 (thread,'in','text','History','RECEIVED',now(),'history'),(thread,'in','reaction','','RECEIVED',now(),'live');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',session_id,'aal','aal2')::text,true);
 execute 'set local role authenticated';
 result:=public.duuk_notification_summary();
 if (result->>'unread')::int<>151 or (result->'modules'->>'/admin/comercial/emails')::int<>150 then raise exception 'Summary truncated or cross-member leak: %',result;end if;
 if result->'modules' ? '/admin/financeiro' or result->'modules' ? '/admin/whatsapp' then raise exception 'Denied finance or historic/reaction badge';end if;
 if (result->'modules'->>'/admin/agenda')::int<>1 then raise exception 'Agenda mapping missing';end if;
 execute 'reset role';
 insert into duuk_private.whatsapp_messages(thread_id,direction,type,body,status,occurred_at,source) values(thread,'in','text','Live','RECEIVED',now(),'live');
 execute 'set local role authenticated';
 result:=public.duuk_notification_summary();
 if (result->'modules'->>'/admin/whatsapp')::int<>1 then raise exception 'Unread live badge missing';end if;
 update public.duuk_notifications set read_at=now() where user_id=u and read_at is null;
 result:=public.duuk_notification_summary();
 if (result->>'unread')::int<>0 or result->'modules' ? '/admin/comercial/emails' then raise exception 'Reading failed to clear badge';end if;
 execute 'reset role';
 insert into duuk_private.whatsapp_reads(user_id,thread_id,seen_at) values(u,thread,now());
 execute 'set local role authenticated';result:=public.duuk_notification_summary();
 if result->'modules' ? '/admin/whatsapp' then raise exception 'WhatsApp read cursor ignored';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','session_id',session_v,'aal','aal2')::text,true);
 execute 'set local role authenticated';result:=public.duuk_notification_summary();
 if (result->>'unread')::int<>1 or result->'modules' ? '/admin/whatsapp' then raise exception 'Other member privacy or WhatsApp denial failed';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','session_id',session_id,'aal','aal2')::text,true);
 execute 'set local role authenticated';
 begin perform public.duuk_notification_summary();raise exception 'Foreign session accepted';exception when sqlstate 'PT403' then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',session_id,'aal','aal1')::text,true);
 execute 'set local role authenticated';
 begin perform public.duuk_notification_summary();raise exception 'MFA bypass';exception when sqlstate 'PT403' then null;end;
 execute 'reset role';
 update auth.sessions set not_after=now()-interval '1 second' where id=session_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',session_id,'aal','aal2')::text,true);
 execute 'set local role authenticated';
 begin perform public.duuk_notification_summary();raise exception 'Expired session accepted';exception when sqlstate 'PT403' then null;end;
 execute 'reset role';
 if has_function_privilege('anon','public.duuk_notification_summary()','execute') or has_table_privilege('authenticated','duuk_private.whatsapp_messages','select') then raise exception 'Private API exposed';end if;
end $$;
rollback;
