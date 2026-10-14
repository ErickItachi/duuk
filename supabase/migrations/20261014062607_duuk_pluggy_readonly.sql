-- One central, read-only Meu Pluggy connection; credentials remain in Vault.
create table duuk_private.pluggy_settings (
 singleton boolean primary key default true check(singleton),
 credential_id uuid references vault.secrets(id) on delete set null,
 item_id uuid,
 account_id uuid,
 account_label text,
 account_last_four text,
 configured_by uuid references public.duuk_profiles(id) on delete set null,
 configured_at timestamptz,
 version bigint not null default 1
);
insert into duuk_private.pluggy_settings(singleton) values(true);
alter table duuk_private.pluggy_settings enable row level security;
revoke all on duuk_private.pluggy_settings from public, anon, authenticated;
grant all on duuk_private.pluggy_settings to service_role;
create index pluggy_settings_credential_idx on duuk_private.pluggy_settings(credential_id);
create index pluggy_settings_actor_idx on duuk_private.pluggy_settings(configured_by);

create function public.duuk_pluggy_backend(operation text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=nullif(payload->>'user_id','')::uuid; cfg duuk_private.pluggy_settings; credentials jsonb; result jsonb;
begin
 if actor is null or not duuk_private.member_permission(actor,'finance') then raise exception 'Sem acesso ao Financeiro.' using errcode='PT403'; end if;
 if operation in ('configure','disconnect') then perform pg_advisory_xact_lock(hashtextextended('duuk:pluggy:settings',0)); end if;
 select * into cfg from duuk_private.pluggy_settings where singleton=true;
 if operation='status' then
  return jsonb_build_object('configured',cfg.credential_id is not null and cfg.item_id is not null and cfg.account_id is not null,'account_label',cfg.account_label,'account_last_four',cfg.account_last_four,'configured_at',cfg.configured_at,'version',cfg.version,'can_configure',exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin));
 end if;
 if operation='configuration' then
  return jsonb_build_object('credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=cfg.credential_id),'item_id',cfg.item_id,'account_id',cfg.account_id,'account_label',cfg.account_label,'version',cfg.version);
 end if;
 if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'A conexão bancária é restrita à super administração.' using errcode='PT403'; end if;
 if cfg.version is distinct from (payload->>'expected_version')::bigint then raise exception 'A conexão mudou. Atualize antes de continuar.' using errcode='PT409'; end if;
 if operation='disconnect' then
  if cfg.credential_id is not null then delete from vault.secrets where id=cfg.credential_id; end if;
  update duuk_private.pluggy_settings set credential_id=null,item_id=null,account_id=null,account_label=null,account_last_four=null,configured_by=null,configured_at=null,version=version+1 where singleton=true;
 elsif operation='configure' then
  if coalesce(payload->>'connector_id','')<>'200' or coalesce((payload->>'own_data_confirmed')::boolean,false) is not true then raise exception 'Use somente o conector gratuito Meu Pluggy para seus próprios dados.' using errcode='PT400'; end if;
  credentials:=payload->'credentials';
  if jsonb_typeof(credentials)<>'object' or char_length(coalesce(credentials->>'clientId','')) not between 10 and 200 or char_length(coalesce(credentials->>'clientSecret','')) not between 10 and 300 or coalesce(char_length(payload->>'account_label'),0) not between 1 and 80 or coalesce(payload->>'account_last_four','') !~ '^[A-Za-z0-9-]{0,4}$' or nullif(payload->>'item_id','') is null or nullif(payload->>'account_id','') is null then raise exception 'Confira a configuração do Meu Pluggy.' using errcode='PT400'; end if;
  if cfg.credential_id is null then cfg.credential_id:=vault.create_secret(credentials::text);else perform vault.update_secret(cfg.credential_id,credentials::text);end if;
  update duuk_private.pluggy_settings set credential_id=cfg.credential_id,item_id=(payload->>'item_id')::uuid,account_id=(payload->>'account_id')::uuid,account_label=payload->>'account_label',account_last_four=payload->>'account_last_four',configured_by=actor,configured_at=now(),version=version+1 where singleton=true;
 else raise exception 'Operação não permitida.' using errcode='PT400'; end if;
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details,required_permission)
 values(actor,(select name from public.duuk_profiles where id=actor),'update','duuk_pluggy','central',case when operation='configure' then 'Meu Pluggy conectado' else 'Meu Pluggy desconectado' end,jsonb_build_object('read_only',true,'connector',200),'finance');
 return jsonb_build_object('saved',true);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Confira a configuração do Meu Pluggy.' using errcode='PT400';
end;
$$;
revoke all on function public.duuk_pluggy_backend(text,jsonb) from public,anon,authenticated;
grant execute on function public.duuk_pluggy_backend(text,jsonb) to service_role;

-- Runs after the general audit scope trigger; bank connection logs stay private.
create or replace function duuk_private.finance_audit_scope() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.entity in ('duuk_income','duuk_finance_goals','duuk_bank_imports','duuk_bank_transactions','duuk_pluggy') then new.required_permission:='finance';end if;
 return new;
end;
$$;
revoke all on function duuk_private.finance_audit_scope() from public,anon,authenticated;
