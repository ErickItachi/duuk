-- Preserve current effective access once, then allow independent role/user overrides.
insert into public.duuk_permission_keys(key,label) values
 ('billing','Cobranças e consultas Asaas'),('spotify','Spotify pessoal')
on conflict(key) do update set label=excluded.label;
insert into public.duuk_role_permissions(role_id,permission,allowed)
 select role_id,'billing',allowed from public.duuk_role_permissions where permission='finance'
on conflict(role_id,permission) do nothing;
insert into public.duuk_user_permissions(user_id,permission,allowed)
 select user_id,'billing',allowed from public.duuk_user_permissions where permission='finance'
on conflict(user_id,permission) do nothing;
insert into public.duuk_role_permissions(role_id,permission,allowed)
 select id,'spotify',true from public.duuk_roles
on conflict(role_id,permission) do nothing;
insert into public.duuk_user_permissions(user_id,permission,allowed)
 select id,'spotify',true from public.duuk_profiles where role_id is null
on conflict(user_id,permission) do nothing;

create or replace function public.duuk_spotify_backend(actor uuid, operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg duuk_private.spotify_config; c duuk_private.spotify_connections; s duuk_private.spotify_oauth_states;
 secret uuid; result jsonb; lease uuid;
begin
 if not duuk_private.member_permission(actor,'spotify') then raise exception 'Sua conta precisa de acesso ao Spotify.' using errcode='PT403'; end if;
 perform pg_advisory_xact_lock(hashtext('duuk-spotify:'||actor));
 perform duuk_private.spotify_cleanup();
 select * into cfg from duuk_private.spotify_config where singleton for update;
 if operation='status' then
  select * into c from duuk_private.spotify_connections where user_id=actor;
  return jsonb_build_object('configured',cfg.client_id is not null,'client_id',cfg.client_id,'connection',case when c.user_id is null then null else
   jsonb_build_object('display_name',c.display_name,'status',c.status,'connected_at',c.connected_at,'scopes',c.scopes) end);
 elsif operation='configure' then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Somente um super administrador configura o aplicativo.' using errcode='PT403'; end if;
  if coalesce(payload->>'client_id','') !~ '^[a-fA-F0-9]{32}$' then raise exception 'Confira o Client ID do Spotify.' using errcode='PT400'; end if;
  if cfg.client_id is not null and cfg.client_id<>payload->>'client_id' and exists(select 1 from duuk_private.spotify_connections) then
   raise exception 'Cada membro deve desconectar sua conta antes de trocar o aplicativo.' using errcode='PT409'; end if;
  insert into duuk_private.spotify_config(singleton,client_id) values(true,lower(payload->>'client_id'))
   on conflict(singleton) do update set client_id=excluded.client_id,generation=case when spotify_config.client_id=excluded.client_id then spotify_config.generation else gen_random_uuid() end where spotify_config.singleton;
  return '{}';
 elsif operation='disconnect' then
  delete from duuk_private.spotify_oauth_states where user_id=actor;
  delete from duuk_private.spotify_connections where user_id=actor;
  return '{}';
 end if;
 if cfg.client_id is null then raise exception 'A administração precisa configurar o Spotify.' using errcode='PT409'; end if;
 if operation='start' then
  delete from duuk_private.spotify_oauth_states where user_id=actor;
  secret:=vault.create_secret(payload->>'verifier');
  insert into duuk_private.spotify_oauth_states(state_hash,user_id,session_id,config_generation,verifier_id)
   values(payload->>'state_hash',actor,(payload->>'session_id')::uuid,cfg.generation,secret);
  return jsonb_build_object('client_id',cfg.client_id);
 elsif operation='consume' then
  update duuk_private.spotify_oauth_states set consumed_at=now()
   where state_hash=payload->>'state_hash' and user_id=actor and session_id=(payload->>'session_id')::uuid
   and config_generation=cfg.generation and expires_at>now() and consumed_at is null returning * into s;
  if s.user_id is null then raise exception 'Conexão expirada ou de outra sessão. Comece novamente.' using errcode='PT400'; end if;
  select to_jsonb(decrypted_secret) into result from vault.decrypted_secrets where id=s.verifier_id;
  return jsonb_build_object('client_id',cfg.client_id,'verifier',result);
 elsif operation='connect' then
  delete from duuk_private.spotify_oauth_states where state_hash=payload->>'state_hash' and user_id=actor
   and session_id=(payload->>'session_id')::uuid and config_generation=cfg.generation and consumed_at is not null and expires_at>now() returning * into s;
  if s.user_id is null then raise exception 'A conexão mudou. Comece novamente.' using errcode='PT409'; end if;
  select * into c from duuk_private.spotify_connections where user_id=actor for update;
  if c.user_id is not null then delete from vault.secrets where id=c.credential_id; end if;
  secret:=vault.create_secret((payload->'tokens')::text);
  insert into duuk_private.spotify_connections(user_id,account_id,display_name,credential_id,expires_at,scopes)
   values(actor,payload->>'account_id',left(payload->>'display_name',120),secret,(payload->>'expires_at')::timestamptz,payload->>'scopes')
   on conflict(user_id) do update set account_id=excluded.account_id,display_name=excluded.display_name,credential_id=secret,
    generation=gen_random_uuid(),status='connected',expires_at=excluded.expires_at,scopes=excluded.scopes,lease_id=null,lease_until=null,connected_at=now();
  return '{}';
 end if;
 select * into c from duuk_private.spotify_connections where user_id=actor for update;
 if c.user_id is null or c.status<>'connected' then raise exception 'Conecte sua conta Spotify para continuar.' using errcode='PT409'; end if;
 if cfg.cooldown_until>now() then raise exception 'O Spotify pediu uma pausa. Aguarde antes de tentar novamente.' using errcode='PT429'; end if;
 if operation='credentials' then
  select decrypted_secret::jsonb into result from vault.decrypted_secrets where id=c.credential_id;
  return jsonb_build_object('client_id',cfg.client_id,'tokens',result,'generation',c.generation,'expires_at',c.expires_at,'scopes',c.scopes);
 elsif operation='claim_refresh' then
  if c.generation<>(payload->>'generation')::uuid or c.lease_until>now() then raise exception 'A conexão está sendo atualizada. Tente novamente em instantes.' using errcode='PT409'; end if;
  lease:=gen_random_uuid(); update duuk_private.spotify_connections set lease_id=lease,lease_until=now()+interval '30 seconds' where user_id=actor;
  return jsonb_build_object('lease_id',lease);
 elsif operation in ('rotate','release','reconnect') then
  if c.generation<>(payload->>'generation')::uuid or c.lease_id is distinct from (payload->>'lease_id')::uuid then
   raise exception 'A conexão mudou. Operação interrompida.' using errcode='PT409'; end if;
  if operation='rotate' then
   perform vault.update_secret(c.credential_id,(payload->'tokens')::text);
   update duuk_private.spotify_connections set expires_at=(payload->>'expires_at')::timestamptz,lease_id=null,lease_until=null where user_id=actor;
  elsif operation='reconnect' then
   update duuk_private.spotify_connections set status='reconnect',lease_id=null,lease_until=null where user_id=actor;
  else update duuk_private.spotify_connections set lease_id=null,lease_until=null where user_id=actor; end if;
  return '{}';
 elsif operation='cooldown' then
  update duuk_private.spotify_config set cooldown_until=now()+make_interval(secs=>least(86400,greatest(1,(payload->>'seconds')::integer))) where singleton;
  return '{}';
 end if;
 raise exception 'Operação indisponível.' using errcode='PT400';
exception when unique_violation then raise exception 'Esta conta Spotify já está conectada a outro membro. Use sua própria conta.' using errcode='PT409';
end $$;
