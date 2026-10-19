-- Fictional role/user grants only. Always rollback. No provider operations or real account changes.
begin;
do $$
declare r uuid:=gen_random_uuid();u uuid:=gen_random_uuid();
begin
 insert into public.duuk_roles(id,name,description) values(r,'Fixture integration grants','Rollback only');
 insert into auth.users(id,email) values(u,u::text||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin) values(u,'Fixture grant',u::text||'@test.invalid',r,true,false);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(r,'billing',true),(r,'spotify',true),(r,'finance',false);
 if not duuk_private.member_permission(u,'billing') or not duuk_private.member_permission(u,'spotify') or duuk_private.member_permission(u,'finance') then raise exception 'Modules not independent';end if;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(u,'billing',false),(u,'spotify',false);
 begin perform public.duuk_billing_backend(u,'status');raise exception 'Individual billing denial ignored';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_spotify_backend(u,'status');raise exception 'Individual Spotify denial ignored';exception when sqlstate 'PT403' then null;end;
 update public.duuk_role_permissions set allowed=false where role_id=r and permission in ('billing','spotify');
 update public.duuk_user_permissions set allowed=true where user_id=u and permission in ('billing','spotify');
 perform public.duuk_billing_backend(u,'status');perform public.duuk_spotify_backend(u,'status');
 delete from public.duuk_user_permissions where user_id=u;
 if duuk_private.member_permission(u,'billing') or duuk_private.member_permission(u,'spotify') then raise exception 'Group denial ignored after inheriting';end if;
 if has_function_privilege('authenticated','public.duuk_billing_backend(uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.duuk_spotify_backend(uuid,text,jsonb)','execute') then raise exception 'Backend boundary exposed';end if;
end $$;
rollback;
