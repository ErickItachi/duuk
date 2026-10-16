-- Isolated fake identities, never enrolls real users or sends messages.
begin;
do $$
declare actor uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  factor uuid := gen_random_uuid(); session uuid := gen_random_uuid(); other_session uuid := gen_random_uuid();
  group_id uuid; allowed boolean;
begin
  select id into group_id from public.duuk_roles order by name limit 1;
  insert into auth.users(id,email) values(actor,actor::text||'@security.invalid'),(stranger,stranger::text||'@security.invalid');
  insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin)
    values(actor,'Isolated security fixture',actor::text||'@security.invalid',group_id,true,true);
  insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
    values(factor,actor,'Isolated fixture','totp','verified',now(),now(),'fictional-fixture');
  insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
    values(session,actor,factor,'aal2',now(),now()),(other_session,stranger,null,'aal1',now(),now());
  if not public.duuk_authorize_session(actor,session,'aal2') then raise exception 'Valid MFA session rejected'; end if;
  if public.duuk_authorize_session(actor,other_session,'aal2') then raise exception 'Cross-user session accepted'; end if;
  if public.duuk_authorize_session(actor,session,'aal1') then raise exception 'Password-only token accepted'; end if;
  if has_function_privilege('anon','public.duuk_authorize_session(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.duuk_authorize_session(uuid,uuid,text)','execute') then raise exception 'Session RPC exposed'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  if not duuk_private.has_permission('finance') then raise exception 'Valid RLS rejected'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'aal','aal1')::text,true);
  if duuk_private.has_permission(null) then raise exception 'AAL1 RLS bypass'; end if;
  if exists(select 1 from public.duuk_income) or exists(select 1 from public.duuk_contracts) or exists(select 1 from public.duuk_drive_documents) then raise exception 'Private rows leaked to AAL1'; end if;
  begin insert into public.duuk_income(title,amount_cents,category,due_date) values('Denied MFA write',100,'Projetos',current_date); raise exception 'AAL1 write bypass'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id','malformed','aal','aal2')::text,true);
  if duuk_private.has_permission(null) then raise exception 'Malformed session accepted'; end if;
  execute 'reset role';
  update auth.sessions set not_after=now()-interval '1 second' where id=session;
  if public.duuk_authorize_session(actor,session,'aal2') then raise exception 'Expired session accepted'; end if;
  update auth.sessions set not_after=null where id=session;
  update auth.mfa_factors set status='unverified' where id=factor;
  if public.duuk_authorize_session(actor,session,'aal2') then raise exception 'Removed factor accepted'; end if;
  update auth.mfa_factors set status='verified' where id=factor;
  update auth.sessions set aal='aal1' where id=session;
  if public.duuk_authorize_session(actor,session,'aal2') then raise exception 'Downgraded session accepted'; end if;
  update auth.sessions set aal='aal2' where id=session;
  -- Remove only the fake session to exercise immediate logout revocation.
  delete from auth.sessions where id=session;
  if public.duuk_authorize_session(actor,session,'aal2') then raise exception 'Revoked token accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  if duuk_private.has_permission(null) or exists(select 1 from public.duuk_contracts) then raise exception 'Revoked RLS bypass'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true); execute 'set local role anon';
  if exists(select 1 from public.duuk_content where key<>'published') then raise exception 'Anonymous draft leak'; end if;
  if duuk_private.has_permission(null) then raise exception 'Anonymous private access'; end if;
  execute 'reset role';
end $$;
rollback;
