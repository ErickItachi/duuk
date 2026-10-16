-- Run only inside a rollback transaction. No real account, Spotify call or notification.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid(); r uuid;
 sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); x jsonb; y jsonb; credential_uuid uuid; lease uuid; before_count bigint;
begin
 select id into r from public.duuk_roles order by name limit 1;
 insert into auth.users(id,email) values(a,a::text||'@test.invalid'),(b,b::text||'@test.invalid'),(inactive,inactive::text||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin) values
 (a,'Fixture Spotify A',a::text||'@test.invalid',r,true,true),(b,'Fixture Spotify B',b::text||'@test.invalid',r,true,false),(inactive,'Fixture Spotify inactive',inactive::text||'@test.invalid',r,false,false);
 -- Hide existing app configuration inside this transaction only.
 delete from duuk_private.spotify_config where singleton;
 begin perform public.duuk_spotify_backend(b,'configure',jsonb_build_object('client_id',repeat('a',32)));raise exception 'Member configured central app';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_spotify_backend(inactive,'status');raise exception 'Inactive member accessed module';exception when sqlstate 'PT403' then null;end;
 perform public.duuk_spotify_backend(a,'configure',jsonb_build_object('client_id',repeat('a',32)));
 perform public.duuk_spotify_backend(a,'start',jsonb_build_object('state_hash','fixture-a','session_id',sa,'verifier','private-pkce-a'));
 begin perform public.duuk_spotify_backend(b,'consume',jsonb_build_object('state_hash','fixture-a','session_id',sb));raise exception 'Cross-user OAuth accepted';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_spotify_backend(a,'consume',jsonb_build_object('state_hash','fixture-a','session_id',sb));raise exception 'Cross-session OAuth accepted';exception when sqlstate 'PT400' then null;end;
 x:=public.duuk_spotify_backend(a,'consume',jsonb_build_object('state_hash','fixture-a','session_id',sa));
 if x->>'verifier'<>'private-pkce-a' then raise exception 'PKCE missing';end if;
 begin perform public.duuk_spotify_backend(a,'consume',jsonb_build_object('state_hash','fixture-a','session_id',sa));raise exception 'OAuth replay accepted';exception when sqlstate 'PT400' then null;end;
 perform public.duuk_spotify_backend(a,'connect',jsonb_build_object('state_hash','fixture-a','session_id',sa,'account_id','fictional-account-a','display_name','Private A','tokens',jsonb_build_object('access_token','private-access-a','refresh_token','private-refresh-a'),'expires_at',now()+interval '1 hour','scopes','user-library-read'));
 x:=public.duuk_spotify_backend(a,'status');y:=public.duuk_spotify_backend(b,'status');
 if x::text like '%private-access%' or x::text like '%private-refresh%' or x::text like '%credential%' then raise exception 'Status leaked secrets';end if;
 if y->'connection'<>'null'::jsonb then raise exception 'Cross-account status leaked';end if;
 begin perform public.duuk_spotify_backend(b,'credentials');raise exception 'Other member credentials leaked';exception when sqlstate 'PT409' then null;end;
 x:=public.duuk_spotify_backend(a,'credentials');
 select credential_id into credential_uuid from duuk_private.spotify_connections where user_id=a;
 if (select v.secret::text from vault.secrets v where v.id=credential_uuid) like '%private-refresh-a%' then raise exception 'Credential plaintext at rest';end if;
 y:=public.duuk_spotify_backend(a,'claim_refresh',jsonb_build_object('generation',x->>'generation'));lease:=(y->>'lease_id')::uuid;
 begin perform public.duuk_spotify_backend(a,'claim_refresh',jsonb_build_object('generation',x->>'generation'));raise exception 'Concurrent refresh accepted';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_spotify_backend(a,'rotate',jsonb_build_object('generation',x->>'generation','lease_id',lease,'tokens',jsonb_build_object('access_token','rotated','refresh_token','rotated-refresh'),'expires_at',now()+interval '1 hour'));
 perform public.duuk_spotify_backend(b,'disconnect');
 if not exists(select 1 from duuk_private.spotify_connections where user_id=a) then raise exception 'B disconnected A';end if;
 perform public.duuk_spotify_backend(a,'disconnect');
 if exists(select 1 from vault.secrets v where v.id=credential_uuid) then raise exception 'Disconnect retained secret';end if;
 begin perform public.duuk_spotify_backend(a,'rotate',jsonb_build_object('generation',x->>'generation','lease_id',lease,'tokens','{}'::jsonb,'expires_at',now()));raise exception 'Late refresh recreated connection';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_spotify_backend(a,'start',jsonb_build_object('state_hash','expired','session_id',sa,'verifier','expired-fixture'));
 select verifier_id into credential_uuid from duuk_private.spotify_oauth_states where state_hash='expired';
 update duuk_private.spotify_oauth_states set expires_at=now()-interval '1 second' where state_hash='expired';
 perform duuk_private.spotify_cleanup();
 if exists(select 1 from vault.secrets v where v.id=credential_uuid) then raise exception 'Expired verifier retained';end if;
 if has_function_privilege('anon','public.duuk_spotify_backend(uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.duuk_spotify_backend(uuid,text,jsonb)','execute') then raise exception 'Backend RPC exposed';end if;
 execute 'set local role authenticated';
 begin perform * from duuk_private.spotify_connections;raise exception 'Browser table exposed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
