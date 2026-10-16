-- Personal Spotify credentials: no table or secret is exposed to browsers.
create table duuk_private.spotify_config (
 singleton boolean primary key default true check(singleton),
 client_id text not null check(client_id ~ '^[a-fA-F0-9]{32}$'),
 generation uuid not null default gen_random_uuid(), cooldown_until timestamptz
);
create table duuk_private.spotify_connections (
 user_id uuid primary key references public.duuk_profiles(id) on delete cascade,
 account_id text not null unique, display_name text not null,
 credential_id uuid not null, generation uuid not null default gen_random_uuid(),
 status text not null default 'connected' check(status in ('connected','reconnect')),
 scopes text not null, expires_at timestamptz not null,
 lease_id uuid, lease_until timestamptz, connected_at timestamptz not null default now()
);
create table duuk_private.spotify_oauth_states (
 state_hash text primary key, user_id uuid not null references public.duuk_profiles(id) on delete cascade,
 session_id uuid not null, config_generation uuid not null, verifier_id uuid,
 consumed_at timestamptz, expires_at timestamptz not null default now()+interval '10 minutes'
);
create index spotify_oauth_user_idx on duuk_private.spotify_oauth_states(user_id);
create function duuk_private.spotify_cleanup() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from vault.secrets where id in (select verifier_id from duuk_private.spotify_oauth_states where expires_at<now());
 delete from duuk_private.spotify_oauth_states where expires_at<now();
end $$;
revoke all on function duuk_private.spotify_cleanup() from public,anon,authenticated;
create function duuk_private.spotify_delete_secrets() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='spotify_connections' then delete from vault.secrets where id=old.credential_id;
 else delete from vault.secrets where id=old.verifier_id; end if;
 return old;
end $$;
revoke all on function duuk_private.spotify_delete_secrets() from public,anon,authenticated;
create trigger spotify_connection_secret before delete on duuk_private.spotify_connections for each row execute function duuk_private.spotify_delete_secrets();
create trigger spotify_state_secret before delete on duuk_private.spotify_oauth_states for each row execute function duuk_private.spotify_delete_secrets();
do $$ declare t text; begin foreach t in array array['spotify_config','spotify_connections','spotify_oauth_states'] loop
 execute format('alter table duuk_private.%I enable row level security',t);
 execute format('revoke all on duuk_private.%I from public,anon,authenticated',t);
end loop; end $$;

-- Service-only boundary; Edge member() independently verifies active session + MFA.
create function public.duuk_spotify_backend(actor uuid, operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg duuk_private.spotify_config; c duuk_private.spotify_connections; s duuk_private.spotify_oauth_states;
 secret uuid; result jsonb; lease uuid;
begin
 if not duuk_private.member_permission(actor,null) then raise exception 'Entre no painel com uma conta ativa.' using errcode='PT403'; end if;
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
revoke all on function public.duuk_spotify_backend(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.duuk_spotify_backend(uuid,text,jsonb) to service_role;
select cron.schedule('duuk-spotify-cleanup','0 6 * * *','select duuk_private.spotify_cleanup()');
