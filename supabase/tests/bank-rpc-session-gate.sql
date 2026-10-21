-- Fictional identities, no financial records or external calls. Always rollback.
begin;
create function pg_temp.assert_bank_gate(expected_state text) returns void language plpgsql as $$
declare n integer; actual text;
begin
 for n in 1..3 loop
  actual:=null;
  begin
   if n=1 then perform public.duuk_import_bank_statement('{}'::jsonb);
   elsif n=2 then perform public.duuk_reconcile_bank_transaction(null::uuid,null::bigint,'invalid','{}'::jsonb);
   else perform public.duuk_remove_bank_import(null::uuid,null::timestamptz);end if;
  exception when others then get stacked diagnostics actual=returned_sqlstate;end;
  if actual is distinct from expected_state then raise exception 'RPC % expected %, got %',n,expected_state,actual;end if;
 end loop;
end $$;
do $$
declare actor uuid:=gen_random_uuid(); factor uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid(); group_id uuid;
begin
 select id into group_id from public.duuk_roles order by name limit 1;
 insert into auth.users(id,email) values(actor,actor::text||'@bank-gate.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin) values(actor,'Fictional bank gate',actor::text||'@bank-gate.invalid',group_id,true,true);
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) values(factor,actor,'Fictional gate','totp','verified',now(),now(),'fictional-fixture');
 insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values(session_id,actor,factor,'aal2',now(),now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session_id,'aal','aal1')::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_bank_gate('PT403');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session_id,'aal','aal2')::text,true);
 -- Valid MFA reaches input validation, without writing a financial record.
 perform pg_temp.assert_bank_gate('PT400');
 execute 'reset role';
 update auth.sessions set not_after=now()-interval '1 second' where id=session_id;
 execute 'set local role authenticated';perform pg_temp.assert_bank_gate('PT403');execute 'reset role';
 update auth.sessions set not_after=null where id=session_id;
 update auth.mfa_factors set status='unverified' where id=factor;
 execute 'set local role authenticated';perform pg_temp.assert_bank_gate('PT403');execute 'reset role';
 update auth.mfa_factors set status='verified' where id=factor;
 delete from auth.sessions where id=session_id;
 execute 'set local role authenticated';perform pg_temp.assert_bank_gate('PT403');execute 'reset role';
end $$;
rollback;
