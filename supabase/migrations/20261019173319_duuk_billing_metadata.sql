-- Preserve canonical descriptions and due dates after provider verification. No grants change.
create or replace function public.duuk_billing_backend(actor uuid,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare env text:=coalesce(payload->>'environment','sandbox');cfg duuk_private.billing_config;c duuk_private.billing_charges;
 secret uuid;hook_secret uuid;lease uuid;result jsonb;rows jsonb;start_date date;end_date date;candidate uuid;
begin
 if actor is null then
  if operation not in ('hook_check','enqueue','jobs','job_finish','credentials','sync_claim','sync_apply','sync_error','customer_recovered','cancel_applied','cooldown') then raise exception 'Acesso restrito.' using errcode='PT403';end if;
 elsif not duuk_private.member_permission(actor,'billing') then raise exception 'Sua conta precisa de acesso a Cobranças.' using errcode='PT403';end if;
 if operation='jobs' then
  -- An interrupted create is checked by GET only, never by repeating a POST.
  insert into duuk_private.billing_jobs(config_id,charge_id,event_id)
   select x.config_id,x.id,'verify:'||x.id from duuk_private.billing_charges x join duuk_private.billing_config bc on bc.id=x.config_id
   where x.status in ('CREATING','UNCERTAIN') and x.created_at<now()-interval '90 seconds' and bc.status='connected'
    and (bc.creation_until is null or bc.creation_until<now())
   on conflict(config_id,event_id) do nothing;
  with selected as (select j.id from duuk_private.billing_jobs j join duuk_private.billing_config bc on bc.id=j.config_id
   where j.done_at is null and j.attempts<12 and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now()) and bc.status='connected'
   order by j.next_attempt_at limit greatest(1,least(5,coalesce((payload->>'limit')::integer,1))) for update of j skip locked),claimed as (
   update duuk_private.billing_jobs j set lease_id=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1 where j.id in(select id from selected) returning j.*)
   select coalesce(jsonb_agg(to_jsonb(claimed)||jsonb_build_object('environment',(select bc.environment from duuk_private.billing_config bc where bc.id=claimed.config_id))),'[]') into result from claimed;
  delete from duuk_private.billing_jobs where done_at<now()-interval '90 days';
  return result;
 elsif operation='job_finish' then
  update duuk_private.billing_jobs set done_at=case when (payload->>'success')::boolean then now() else null end,
   last_error=left(payload->>'error',250),next_attempt_at=now()+make_interval(secs=>least(3600,greatest(60,coalesce((payload->>'retry_seconds')::integer,60)))),lease_id=null,lease_until=null
   where id=(payload->>'id')::uuid and lease_id=(payload->>'lease_id')::uuid;
  return '{}';
 end if;
 if env not in ('sandbox','production') then raise exception 'Ambiente inválido.' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtext('duuk-billing:'||env));
 select * into cfg from duuk_private.billing_config where environment=env;
 if operation='status' then
  return jsonb_build_object('environment',env,'configured',cfg.credential_id is not null,'connected',cfg.status='connected','account_name',cfg.account_name,'account_status',cfg.account_status,'fees_accepted',coalesce(cfg.fees_accepted,false),'updated_at',cfg.updated_at);
 elsif operation='configure' then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Somente um super administrador configura o Asaas.' using errcode='PT403';end if;
  if env='production' and coalesce((payload->>'fees_accepted')::boolean,false) is not true then raise exception 'Revise e aceite as tarifas do Asaas antes de conectar a Produção.' using errcode='PT400';end if;
  if cfg.id is not null and cfg.account_id<>payload->>'account_id' and exists(select 1 from duuk_private.billing_charges where config_id=cfg.id) then raise exception 'Este ambiente já tem cobranças de outra conta. Reconecte a conta original para preservar o histórico.' using errcode='PT409';end if;
  if length(coalesce(payload->>'api_key',''))<20 or length(coalesce(payload->>'webhook_token',''))<32 then raise exception 'Configuração incompleta.' using errcode='PT400';end if;
  if cfg.credential_id is not null then perform vault.update_secret(cfg.credential_id,payload->>'api_key');secret:=cfg.credential_id;else secret:=vault.create_secret(payload->>'api_key');end if;
  if cfg.webhook_secret_id is null then hook_secret:=vault.create_secret(payload->>'webhook_token');else hook_secret:=cfg.webhook_secret_id;end if;
  insert into duuk_private.billing_config(environment,account_id,account_name,account_status,credential_id,webhook_secret_id,webhook_hash,contact_email,fees_accepted,updated_by)
   values(env,payload->>'account_id',left(payload->>'account_name',160),payload->>'account_status',secret,hook_secret,payload->>'webhook_hash',payload->>'contact_email',coalesce((payload->>'fees_accepted')::boolean,false),actor)
   on conflict(environment) do update set account_id=excluded.account_id,account_name=excluded.account_name,account_status=excluded.account_status,credential_id=excluded.credential_id,
    webhook_secret_id=excluded.webhook_secret_id,webhook_hash=case when billing_config.webhook_secret_id is null then excluded.webhook_hash else billing_config.webhook_hash end,
    status='pending_webhook',fees_accepted=excluded.fees_accepted,contact_email=excluded.contact_email,generation=gen_random_uuid(),updated_by=actor,updated_at=now(),creation_lease=null,creation_until=null
   where billing_config.environment=env;
  return '{}';
 elsif operation in ('config_ready','config_refresh','disconnect') then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Somente um super administrador altera a integração.' using errcode='PT403';end if;
  if operation='disconnect' then
   delete from vault.secrets where id in (cfg.credential_id,cfg.webhook_secret_id);
   update duuk_private.billing_config set credential_id=null,webhook_secret_id=null,webhook_hash=null,webhook_id=null,status='disconnected',generation=gen_random_uuid(),creation_lease=null,creation_until=null,updated_by=actor,updated_at=now() where environment=env;
  elsif operation='config_ready' then
   update duuk_private.billing_config set webhook_id=payload->>'webhook_id',status='connected',updated_at=now() where environment=env and generation=(payload->>'generation')::uuid;
  else
   update duuk_private.billing_config set account_status=payload->>'account_status',updated_at=now() where environment=env and generation=(payload->>'generation')::uuid;
  end if;
  return '{}';
 elsif operation='hook_check' then
  return case when cfg.id=(payload->>'config_id')::uuid and cfg.status='connected' then jsonb_build_object('hash',cfg.webhook_hash) else '{}'::jsonb end;
 elsif operation='enqueue' then
  if cfg.id is null or cfg.id is distinct from (payload->>'config_id')::uuid or cfg.status<>'connected' then return '{}';end if;
  select id into candidate from duuk_private.billing_charges where config_id=cfg.id and payment_id=payload->>'payment_id';
  if candidate is null and coalesce(payload->>'reference','') ~ '^duuk:[a-f0-9-]{36}$' then
   select id into candidate from duuk_private.billing_charges where config_id=cfg.id and id=substring(payload->>'reference' from 6)::uuid and payment_started;
  end if;
  if candidate is not null then insert into duuk_private.billing_jobs(config_id,charge_id,event_id,payment_id,event_type)
   values(cfg.id,candidate,left(payload->>'event_id',180),payload->>'payment_id',payload->>'event_type') on conflict(config_id,event_id) do nothing;end if;
  return '{}';
 elsif operation='list' then
  if coalesce(payload->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Escolha um mês válido.' using errcode='PT400';end if;
  start_date:=((payload->>'month')||'-01')::date;end_date:=(start_date+interval '1 month')::date;
  if coalesce(payload->>'search','') ~ '.{201}' or coalesce((payload->>'offset')::integer,0)<0 or coalesce((payload->>'offset')::integer,0)>50000 then raise exception 'Confira os filtros.' using errcode='PT400';end if;
  select coalesce(jsonb_agg(duuk_private.billing_public_charge(x) order by x.due_date desc,x.created_at desc),'[]') into rows from (
   select * from duuk_private.billing_charges where environment=env and due_date>=start_date and due_date<end_date
    and (coalesce(payload->>'status','all')='all' or status=payload->>'status')
    and (coalesce(payload->>'search','')='' or title ilike '%'||(payload->>'search')||'%' or client_name ilike '%'||(payload->>'search')||'%')
   order by due_date desc,created_at desc limit 20 offset coalesce((payload->>'offset')::integer,0)) x;
  return jsonb_build_object('items',rows,'total_count',(select count(*) from duuk_private.billing_charges where environment=env and due_date>=start_date and due_date<end_date
    and (coalesce(payload->>'status','all')='all' or status=payload->>'status') and (coalesce(payload->>'search','')='' or title ilike '%'||(payload->>'search')||'%' or client_name ilike '%'||(payload->>'search')||'%')),
   'stats',(select jsonb_build_object('open_cents',coalesce(sum(amount_cents) filter(where status in ('PENDING','OVERDUE')),0),'confirmed_cents',coalesce(sum(amount_cents) filter(where status='CONFIRMED' and not has_refunds),0),'received_cents',coalesce(sum(amount_cents) filter(where status='RECEIVED' and not has_refunds),0),'count',count(*)) from duuk_private.billing_charges where environment=env and due_date>=start_date and due_date<end_date));
 end if;
 if operation='get' then
  select * into c from duuk_private.billing_charges where id=(payload->>'id')::uuid and environment=env;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode='PT404';end if;
  return duuk_private.billing_public_charge(c);
 end if;
 if cfg.credential_id is null then raise exception 'Conecte o Asaas em Configurações para usar este ambiente.' using errcode='PT409';end if;
 if operation='credentials' then
  if payload ? 'config_id' and cfg.id is distinct from (payload->>'config_id')::uuid then raise exception 'A conexão mudou.' using errcode='PT409';end if;
  if cfg.cooldown_until>now() then raise exception 'O Asaas pediu uma pausa. Aguarde antes de atualizar.' using errcode='PT429';end if;
  return jsonb_build_object('config_id',cfg.id,'generation',cfg.generation,'account_id',cfg.account_id,'account_status',cfg.account_status,'status',cfg.status,'webhook_id',cfg.webhook_id,'contact_email',cfg.contact_email,
   'api_key',(select decrypted_secret from vault.decrypted_secrets where id=cfg.credential_id),'webhook_token',(select decrypted_secret from vault.decrypted_secrets where id=cfg.webhook_secret_id));
 elsif operation='cooldown' then
  update duuk_private.billing_config set cooldown_until=now()+make_interval(secs=>least(3600,greatest(1,(payload->>'seconds')::integer))) where environment=env;
  return '{}';
 end if;
 if cfg.generation is distinct from (payload->>'generation')::uuid then raise exception 'A conexão mudou. Atualize antes de continuar.' using errcode='PT409';end if;
 if operation='begin_create' then
  if cfg.status<>'connected' or cfg.account_status<>'APPROVED' or (env='production' and not cfg.fees_accepted) then raise exception 'Conclua a configuração, o webhook e a aprovação cadastral no Asaas.' using errcode='PT409';end if;
  select * into c from duuk_private.billing_charges where id=(payload->>'id')::uuid;
  if c.id is not null then
   if c.config_id<>cfg.id or c.created_by is distinct from actor or c.request_hash is distinct from payload->>'request_hash' then raise exception 'Esta tentativa pertence a outra cobrança. Reabra o formulário.' using errcode='PT409';end if;
   if c.status<>'DRAFT' then return jsonb_build_object('execute',false,'charge',duuk_private.billing_public_charge(c));end if;
  end if;
  if cfg.creation_until>now() then raise exception 'Outra cobrança está sendo preparada. Aguarde alguns segundos.' using errcode='PT409';end if;
  if exists(select 1 from duuk_private.billing_charges where config_id=cfg.id and payer_hash=payload->>'payer_hash' and customer_id is null and status in ('CREATING','UNCERTAIN') and id<>(payload->>'id')::uuid) then
   raise exception 'Um cadastro deste cliente ainda está sendo verificado. Atualize a tentativa anterior antes de criar outra cobrança.' using errcode='PT409';end if;
  if c.id is null then insert into duuk_private.billing_charges(id,config_id,environment,title,client_name,amount_cents,due_date,method,payer_hash,request_hash,created_by)
   values((payload->>'id')::uuid,cfg.id,env,btrim(payload->>'title'),btrim(payload->>'client_name'),(payload->>'amount_cents')::bigint,(payload->>'due_date')::date,payload->>'method',payload->>'payer_hash',payload->>'request_hash',actor) returning * into c;
  else update duuk_private.billing_charges set status='CREATING',last_error=null,updated_at=now() where id=c.id returning * into c;end if;
  update duuk_private.billing_config set creation_lease=c.id,creation_until=now()+interval '90 seconds' where environment=env;
  return jsonb_build_object('execute',true,'internal',to_jsonb(c));
 end if;
 select * into c from duuk_private.billing_charges where id=(payload->>'id')::uuid and config_id=cfg.id;
 if c.id is null then raise exception 'Cobrança não encontrada.' using errcode='PT404';end if;
 if operation in ('customer_start','customer_saved','payment_start','created','creation_error') then
  if cfg.creation_lease is distinct from c.id or cfg.creation_until<now() then raise exception 'A preparação expirou. Atualize para conferir se a cobrança foi criada.' using errcode='PT409';end if;
  if operation='customer_start' then update duuk_private.billing_charges set customer_started=true where id=c.id;
  elsif operation='customer_saved' then update duuk_private.billing_charges set customer_id=payload->>'customer_id' where id=c.id;
  elsif operation='payment_start' then update duuk_private.billing_charges set payment_started=true where id=c.id and not payment_started;
   if not found then raise exception 'A criação já começou. Verifique o estado antes de tentar novamente.' using errcode='PT409';end if;
  elsif operation='creation_error' then
   update duuk_private.billing_charges set status=case when coalesce((payload->>'uncertain')::boolean,true) then 'UNCERTAIN' else 'FAILED' end,last_error=left(payload->>'error',250),updated_at=now() where id=c.id;
   update duuk_private.billing_config set creation_lease=null,creation_until=null where environment=env and creation_lease=c.id;
  else
   if (payload->>'external_reference') is distinct from ('duuk:'||c.id) or (payload->>'customer_id') is distinct from c.customer_id or (payload->>'amount_cents')::bigint is distinct from c.amount_cents then raise exception 'Dados de cobrança divergentes.' using errcode='PT409';end if;
   update duuk_private.billing_charges set due_date=coalesce((payload->>'due_date')::date,due_date),title=coalesce(nullif(left(btrim(payload->>'title'),160),''),title),payment_id=payload->>'payment_id',status=payload->>'status',invoice_url=payload->>'invoice_url',net_cents=(payload->>'net_cents')::bigint,paid_date=(payload->>'paid_date')::date,has_refunds=coalesce((payload->>'has_refunds')::boolean,false),last_error=null,last_checked_at=now(),updated_at=now() where id=c.id;
   update duuk_private.billing_config set creation_lease=null,creation_until=null where environment=env and creation_lease=c.id;
  end if;
 elsif operation='sync_claim' then
  if (cfg.creation_lease=c.id and cfg.creation_until>now()) or c.sync_until>now() then raise exception 'A cobrança já está sendo conferida. Aguarde alguns segundos.' using errcode='PT409';end if;
  lease:=gen_random_uuid();update duuk_private.billing_charges set sync_lease=lease,sync_until=now()+interval '60 seconds' where id=c.id returning * into c;
  return jsonb_build_object('lease_id',lease,'charge',to_jsonb(c));
 elsif operation in ('sync_apply','sync_error','customer_recovered','cancel_applied') then
  if c.sync_lease is null or c.sync_lease is distinct from (payload->>'lease_id')::uuid or c.sync_until<now() then raise exception 'A conferência mudou. Atualize a cobrança.' using errcode='PT409';end if;
  if operation='sync_error' then update duuk_private.billing_charges set last_error=left(payload->>'error',250),sync_lease=null,sync_until=null where id=c.id;
  elsif operation='customer_recovered' then
   update duuk_private.billing_charges set customer_id=payload->>'customer_id',status=case when not payment_started then 'DRAFT' else status end,last_error=case when not payment_started then 'Cliente preparado. Abra a cobrança para concluir a criação.' else last_error end,sync_lease=null,sync_until=null,updated_at=now() where id=c.id;
  elsif operation='cancel_applied' then update duuk_private.billing_charges set status='CANCELED',invoice_url=null,last_error=null,last_checked_at=now(),sync_lease=null,sync_until=null,updated_at=now() where id=c.id;
  else
   if (payload->>'external_reference') is distinct from ('duuk:'||c.id) or (payload->>'customer_id') is distinct from c.customer_id or (payload->>'amount_cents')::bigint is distinct from c.amount_cents or (c.payment_id is not null and c.payment_id is distinct from payload->>'payment_id') then raise exception 'Dados de cobrança divergentes.' using errcode='PT409';end if;
   update duuk_private.billing_charges set due_date=coalesce((payload->>'due_date')::date,due_date),title=coalesce(nullif(left(btrim(payload->>'title'),160),''),title),payment_id=payload->>'payment_id',status=payload->>'status',invoice_url=payload->>'invoice_url',net_cents=(payload->>'net_cents')::bigint,paid_date=(payload->>'paid_date')::date,has_refunds=coalesce((payload->>'has_refunds')::boolean,false),last_error=null,last_checked_at=now(),sync_lease=null,sync_until=null,updated_at=now() where id=c.id;
  end if;
 else raise exception 'Operação de cobrança inválida.' using errcode='PT400';end if;
 select * into c from duuk_private.billing_charges where id=c.id;
 return duuk_private.billing_public_charge(c);
end $$;
