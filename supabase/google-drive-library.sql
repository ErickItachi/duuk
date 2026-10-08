-- Biblioteca privada do Google Drive; não concede acesso aos contratos ou ao CRM.
insert into public.duuk_permission_keys(key,label) values ('drive','Google Drive') on conflict do nothing;
alter table public.duuk_drive_documents drop constraint duuk_drive_documents_kind_check;
alter table public.duuk_drive_documents add constraint duuk_drive_documents_kind_check check(kind in ('contract_original','contract_signed','proposal','document','file'));
alter table public.duuk_drive_documents add column source_bucket text not null default 'duuk-documents', add column mime_type text not null default 'application/pdf', add column byte_size bigint check(byte_size between 1 and 20971520);
create unique index duuk_drive_library_hash_idx on public.duuk_drive_documents(client_key,source_sha256) where kind='file';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('duuk-drive-files','duuk-drive-files',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','video/quicktime']) on conflict(id) do nothing;
-- Nenhuma policy do navegador para o bucket: upload e download passam pelo backend.
drop policy drive_documents_read on public.duuk_drive_documents;
create policy drive_documents_read on public.duuk_drive_documents for select to authenticated using (
 (kind in ('contract_original','contract_signed') and (select duuk_private.has_permission('contracts')))
 or (kind in ('proposal','document') and (select duuk_private.has_permission('crm.clients')))
 or (kind='file' and (select duuk_private.has_permission('drive')))
);
create or replace function duuk_private.drive_document_permission(kind text) returns text language sql immutable set search_path='' as $$
 select case when kind in ('contract_original','contract_signed') then 'contracts' when kind='file' then 'drive' else 'crm.clients' end;
$$;
create or replace function duuk_private.drive_backend(operation text, payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid := nullif(payload->>'user_id','')::uuid; c public.duuk_drive_connection; s duuk_private.drive_oauth_states;
doc public.duuk_drive_documents; secret uuid; result jsonb; lease uuid; profile_name text; n integer; label text; base text; owner record; contract public.duuk_contracts; document_kind text; document_title text; library_client_id uuid;
 pending_error text := nullif(payload->>'error','');
begin
 if operation = 'status' then
  perform duuk_private.drive_require_super(actor);
  select * into c from public.duuk_drive_connection;
  return jsonb_build_object(
   'connection', case when c.singleton is null then null else jsonb_build_object('account_email',c.account_email,'status',c.status,'connected_at',c.connected_at,'last_synced_at',c.last_synced_at,'last_error',c.last_error,'storage_limit',c.storage_limit,'storage_usage',c.storage_usage,'storage_checked_at',c.storage_checked_at) end,
   'counts', jsonb_build_object('pending',(select count(*) from public.duuk_drive_documents where status = 'pending'),'error',(select count(*) from public.duuk_drive_documents where status = 'error'),'synced',(select count(*) from public.duuk_drive_documents where status = 'synced')));

 elsif operation = 'start' then
  perform duuk_private.drive_require_super(actor);
  delete from duuk_private.drive_oauth_states where user_id = actor or expires_at < now();
  insert into duuk_private.drive_oauth_states(state_hash,user_id,verifier) values(payload->>'state_hash',actor,payload->>'verifier');
  return '{}'::jsonb;

 elsif operation = 'consume' then
  update duuk_private.drive_oauth_states set consumed_at = now() where state_hash = payload->>'state_hash' and user_id = actor and expires_at > now() and consumed_at is null returning * into s;
  if s.user_id is null then raise exception 'Conexão expirada. Tente novamente no painel.' using errcode = 'PT400'; end if;
  perform duuk_private.drive_require_super(actor);
  return jsonb_build_object('verifier',s.verifier);

 elsif operation = 'connect' then
  perform duuk_private.drive_require_super(actor);
  perform pg_advisory_xact_lock(hashtext('duuk-drive-connection'));
  delete from duuk_private.drive_oauth_states where user_id = actor and state_hash = payload->>'state_hash' and consumed_at is not null and expires_at > now() returning * into s;
  if s.user_id is null then raise exception 'A conexão mudou. Comece novamente no painel.' using errcode = 'PT409'; end if;
  select * into c from public.duuk_drive_connection for update;
  if c.credential_id is not null then
   delete from vault.secrets where id = c.credential_id;
  end if;
  secret := vault.create_secret((payload->'tokens')::text);
  if c.singleton is not null and c.google_subject is distinct from payload->>'google_subject' then
   -- Outra conta: as pastas e os arquivos antigos permanecem intactos no Drive anterior; os documentos voltam à fila.
   delete from public.duuk_drive_folders where key is not null;
   update public.duuk_drive_documents set status = 'pending', attempts = 0, next_attempt_at = now(), drive_file_id = null, drive_folder_id = null, drive_link = null, synced_at = null, last_error = null, error_notified_at = null where id is not null;
  end if;
  insert into public.duuk_drive_connection(google_subject,account_email,credential_id,connected_by)
  values(payload->>'google_subject',payload->>'account_email',secret,actor)
  on conflict(singleton) do update set generation = gen_random_uuid(), google_subject = excluded.google_subject, account_email = excluded.account_email,
   credential_id = secret, status = 'connected', connected_by = actor, connected_at = now(), last_error = null, lease_id = null, lease_until = null, storage_checked_at = null;
  update public.duuk_drive_documents set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where status = 'error';
  select name into profile_name from public.duuk_profiles where id = actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.connect','google_drive','duukfilms','Conexão do Google Drive atualizada.');
  return '{}'::jsonb;

 elsif operation = 'disconnect' then
  perform duuk_private.drive_require_super(actor);
  perform pg_advisory_xact_lock(hashtext('duuk-drive-connection'));
  select * into c from public.duuk_drive_connection for update;
  if c.singleton is null or c.status = 'disconnected' then return '{}'::jsonb; end if;
  if c.credential_id is not null then
   delete from vault.secrets where id = c.credential_id;
  end if;
  delete from duuk_private.drive_oauth_states where user_id = actor;
  update public.duuk_drive_connection set status = 'disconnected', credential_id = null, generation = gen_random_uuid(), lease_id = null, lease_until = null, last_error = null where singleton = true;
  select name into profile_name from public.duuk_profiles where id = actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.disconnect','google_drive','duukfilms','Google Drive desconectado. Arquivos existentes foram preservados.');
  perform duuk_private.notify_members('system','permissions','Google Drive desconectado','Os documentos novos aguardam uma nova conexão. Os arquivos já salvos continuam no Drive.','/admin/configuracoes/integracoes','drive:disconnected:' || extract(epoch from clock_timestamp())::bigint);
  delete from public.duuk_notifications where user_id = actor and dedupe_key like 'drive:disconnected:%' and created_at > now() - interval '1 minute';
  return '{}'::jsonb;

 elsif operation = 'documents' then
  select * into c from public.duuk_drive_connection;
  if payload->>'contract_id' is not null then
   if not duuk_private.member_permission(actor,'contracts') then raise exception 'Sem acesso aos contratos.' using errcode = 'PT403'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.kind) from public.duuk_drive_documents d where d.contract_id = (payload->>'contract_id')::uuid),'[]'::jsonb);
  elsif payload->>'client_id' is not null then
   if not duuk_private.member_permission(actor,'crm.clients') then raise exception 'Sem acesso aos clientes.' using errcode = 'PT403'; end if;
   document_kind := coalesce(payload->>'kind','proposal');
   if document_kind not in ('proposal','document') then raise exception 'Tipo de documento inválido.' using errcode='PT400'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'created_at',d.created_at,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.created_at desc) from public.duuk_drive_documents d where d.client_id = (payload->>'client_id')::uuid and d.kind = document_kind),'[]'::jsonb);
  end if;
  raise exception 'Informe o contrato ou o cliente.' using errcode = 'PT400';

 elsif operation = 'file' then
  select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid;
  if doc.id is null then raise exception 'Documento não encontrado.' using errcode = 'PT404'; end if;
  if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode = 'PT403'; end if;
  return jsonb_build_object('file_name',doc.file_name,'source_path',doc.source_path,'source_bucket',doc.source_bucket,'mime_type',doc.mime_type);

 elsif operation = 'retry' then
  if payload->>'document_id' is not null then
   select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid for update;
   if doc.id is null then raise exception 'Documento não encontrado.' using errcode = 'PT404'; end if;
   if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode = 'PT403'; end if;
   if doc.status = 'synced' then raise exception 'Este documento já está salvo no Google Drive.' using errcode = 'PT409'; end if;
   update public.duuk_drive_documents set attempts = 0, next_attempt_at = now(), status = 'pending', last_error = null where id = doc.id;
   return jsonb_build_object('queued',1);
  end if;
  perform duuk_private.drive_require_super(actor);
  update public.duuk_drive_documents set attempts = 0, next_attempt_at = now(), status = 'pending', last_error = null where status <> 'synced';
  get diagnostics n = row_count;
  update public.duuk_drive_connection set status = 'connected', last_error = null where credential_id is not null and status = 'error';
  return jsonb_build_object('queued',n);

 elsif operation = 'add_proposal' then
  if not duuk_private.member_permission(actor,'crm.clients') then raise exception 'Sem acesso aos clientes.' using errcode = 'PT403'; end if;
  document_kind := coalesce(payload->>'kind','proposal');
  if document_kind not in ('proposal','document') then raise exception 'Tipo de documento inválido.' using errcode='PT400'; end if;
  document_title := coalesce(nullif(btrim(payload->>'title'),''),case when document_kind='proposal' then 'Proposta Comercial' else 'Documento' end);
  if char_length(document_title)>160 or coalesce(payload->>'sha256','') !~ '^[a-f0-9]{64}$'
   or coalesce(payload->>'source_path','') !~ ('^'||document_kind||'/'||(payload->>'client_id')||'/[a-f0-9-]{36}\.pdf$') then raise exception 'Confira os dados do PDF.' using errcode='PT400'; end if;
  select id,name,company into owner from public.duuk_clients where id = (payload->>'client_id')::uuid;
  if owner.id is null then raise exception 'Cliente não encontrado.' using errcode = 'PT404'; end if;
  label := duuk_private.drive_safe_name(coalesce(nullif(owner.company,''),owner.name),'Cliente');
  perform pg_advisory_xact_lock(hashtext('duuk-drive-name:crm:' || owner.id));
  if exists(select 1 from public.duuk_drive_documents where kind = document_kind and client_key = 'crm:' || owner.id and source_sha256 = payload->>'sha256') then
   raise exception 'Este PDF já foi anexado a este cliente nesta categoria.' using errcode = 'PT409';
  end if;
  select count(*) into n from public.duuk_drive_documents where kind = document_kind and client_key = 'crm:' || owner.id;
  insert into public.duuk_drive_documents(kind,client_id,client_key,client_name,title,file_name,source_path,source_sha256,created_by)
  values(document_kind,owner.id,'crm:' || owner.id,label,document_title,duuk_private.drive_safe_name(document_title,'Documento') || ' ' || label || case when n > 0 then ' (' || (n + 1) || ')' else '' end || '.pdf',payload->>'source_path',payload->>'sha256',actor)
  returning * into doc;
  select name into profile_name from public.duuk_profiles where id = actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.'||document_kind,'duuk_drive_documents',doc.id::text,case when document_kind='proposal' then 'Proposta em PDF anexada ao cliente.' else 'Documento em PDF anexado ao cliente.' end);
  return jsonb_build_object('id',doc.id,'file_name',doc.file_name,'status',doc.status);

 elsif operation = 'library' then
  if not duuk_private.member_permission(actor,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
  select * into c from public.duuk_drive_connection;
  select coalesce(jsonb_agg(to_jsonb(items) order by items.created_at desc,items.id),'[]'::jsonb) into result from (
   select d.id,d.kind,d.title,d.file_name,d.client_name,d.status,d.last_error,d.created_at,d.synced_at,d.mime_type,d.byte_size,
    d.contract_id,d.client_id,case when c.status='connected' then d.drive_link end as drive_link
   from public.duuk_drive_documents d
   where duuk_private.member_permission(actor,duuk_private.drive_document_permission(d.kind))
    and (nullif(payload->>'kind','') is null or d.kind=payload->>'kind')
    and (nullif(payload->>'search','') is null or position(lower(left(payload->>'search',120)) in lower(d.file_name || ' ' || d.client_name || ' ' || d.title))>0)
   order by d.created_at desc,d.id limit 51 offset least(greatest(coalesce((payload->>'offset')::integer,0),0),100000)
  ) items;
  return jsonb_build_object('documents',result,'connected',c.status='connected','account_email',c.account_email);

 elsif operation = 'add_file' then
  if not duuk_private.member_permission(actor,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
  if coalesce(payload->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(payload->>'source_path','') !~ ('^files/' || actor || '/[a-f0-9-]{36}$')
   or coalesce(payload->>'mime_type','') not in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','video/quicktime')
   or coalesce((payload->>'byte_size')::bigint,0) not between 1 and 20971520 then raise exception 'Confira o arquivo enviado.' using errcode='PT400'; end if;
  if payload->>'client_id' is not null then
   if not duuk_private.member_permission(actor,'crm.clients') then raise exception 'Sem acesso aos clientes.' using errcode='PT403'; end if;
   select id,name,company into owner from public.duuk_clients where id=(payload->>'client_id')::uuid;
   if owner.id is null then raise exception 'Cliente não encontrado.' using errcode='PT404'; end if;
   library_client_id := owner.id;
   label := duuk_private.drive_safe_name(coalesce(nullif(owner.company,''),owner.name),'Cliente');
   base := 'crm:' || owner.id;
  else label := 'Internos'; base := 'internal'; end if;
  perform pg_advisory_xact_lock(hashtext('duuk-drive-file:' || base || ':' || (payload->>'sha256')));
  if exists(select 1 from public.duuk_drive_documents where kind='file' and client_key=base and source_sha256=payload->>'sha256') then raise exception 'Este arquivo já está na biblioteca desta pasta.' using errcode='PT409'; end if;
  insert into public.duuk_drive_documents(kind,client_id,client_key,client_name,title,file_name,source_bucket,source_path,source_sha256,mime_type,byte_size,created_by)
  values('file',library_client_id,base,label,left(coalesce(payload->>'title',''),160),duuk_private.drive_safe_name(payload->>'file_name','Arquivo'),'duuk-drive-files',payload->>'source_path',payload->>'sha256',payload->>'mime_type',(payload->>'byte_size')::bigint,actor) returning * into doc;
  select name into profile_name from public.duuk_profiles where id=actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.upload','google_drive',doc.id::text,'Arquivo anexado à biblioteca privada do Google Drive.');
  return jsonb_build_object('id',doc.id,'file_name',doc.file_name,'status',doc.status);

 elsif operation = 'reconcile' then
  -- Recupera falhas isoladas do gatilho sem acoplar o Google à assinatura.
  for contract in select source_contract.* from public.duuk_contracts source_contract where
   not exists(select 1 from public.duuk_drive_documents d where d.contract_id=source_contract.id and d.kind='contract_original')
   or (source_contract.status='signed' and source_contract.rendered_version=source_contract.version and source_contract.signed_path is not null and
    not exists(select 1 from public.duuk_drive_documents d where d.contract_id=source_contract.id and d.kind='contract_signed'))
   order by source_contract.created_at limit 10 loop
   begin perform duuk_private.drive_queue_contract(contract);
   exception when others then raise warning 'DUUK Drive: reconciliação adiada (%)',sqlstate; end;
  end loop;
  return '{}'::jsonb;

 elsif operation = 'claim' then
  delete from duuk_private.drive_oauth_states where expires_at < now();
  select * into c from public.duuk_drive_connection
   where status = 'connected' and credential_id is not null and (lease_until is null or lease_until < now())
    and (exists(select 1 from public.duuk_drive_documents d where d.status <> 'synced' and d.attempts < 8 and d.next_attempt_at <= now() and d.source_path is not null)
     or storage_checked_at is null or storage_checked_at < now() - interval '6 hours')
   for update skip locked;
  if c.singleton is null then return null; end if;
  lease := gen_random_uuid();
  -- Uma única transferência resumível pode levar até dois minutos. A folga impede
  -- que outro Cron reivindique o mesmo documento enquanto o primeiro ainda envia.
  update public.duuk_drive_connection set lease_id = lease, lease_until = now() + interval '5 minutes' where singleton = true;
  select decrypted_secret::jsonb into result from vault.decrypted_secrets where id = c.credential_id;
  return jsonb_build_object('generation',c.generation,'lease_id',lease,'tokens',result,'quota_due',c.storage_checked_at is null or c.storage_checked_at < now() - interval '6 hours');

 elsif operation in ('jobs','check','tokens','finish','release','error','quota','folder_get','folder_save','folder_forget','unique_name') then
  select * into c from public.duuk_drive_connection where generation = (payload->>'generation')::uuid and lease_id = (payload->>'lease_id')::uuid and lease_until > now() and status = 'connected' for update;
  if c.singleton is null then raise exception 'A conexão mudou. Operação interrompida.' using errcode = 'PT409'; end if;
  update public.duuk_drive_connection set lease_until=now()+interval '5 minutes' where singleton = true;
  if operation = 'jobs' then
   return coalesce((select jsonb_agg(to_jsonb(j)) from (
    select id,kind,contract_id,client_key,client_name,file_name,source_path,source_sha256,source_bucket,mime_type
    from public.duuk_drive_documents
    where status <> 'synced' and source_path is not null and ((payload->>'document_id' is not null and id = (payload->>'document_id')::uuid) or (payload->>'document_id' is null and attempts < 8 and next_attempt_at <= now()))
    order by kind desc, created_at limit least(coalesce((payload->>'limit')::integer,4),10)) j),'[]'::jsonb);
  elsif operation = 'check' then
   if not exists(select 1 from public.duuk_drive_documents where id=(payload->>'document_id')::uuid and status<>'synced'
    and source_path is not distinct from payload->>'expected_source_path' and source_sha256 is not distinct from payload->>'expected_source_sha256') then
    raise exception 'O documento mudou. A sincronização será retomada.' using errcode='PT409';
   end if;
  elsif operation = 'tokens' then
   perform vault.update_secret(c.credential_id,(payload->'tokens')::text);
  elsif operation = 'folder_get' then
   return (select to_jsonb(f) from public.duuk_drive_folders f where f.key = payload->>'key');
  elsif operation = 'folder_save' then
   insert into public.duuk_drive_folders(key,drive_id,name,parent_key,client_key) values(payload->>'key',payload->>'drive_id',payload->>'name',nullif(payload->>'parent_key',''),nullif(payload->>'client_key',''))
   on conflict(key) do update set drive_id = excluded.drive_id, name = excluded.name;
  elsif operation = 'folder_forget' then
   delete from public.duuk_drive_folders where key = payload->>'key';
  elsif operation = 'unique_name' then
   -- Duas pessoas com o mesmo nome recebem pastas distintas: "Cliente" e "Cliente (2)".
   base := payload->>'name';
   select count(*) into n from public.duuk_drive_folders where parent_key is not distinct from nullif(payload->>'parent_key','') and client_key is distinct from payload->>'client_key' and regexp_replace(lower(name),' \(\d+\)$','') = lower(base);
   return to_jsonb(base || case when n > 0 then ' (' || (n + 1) || ')' else '' end);
  elsif operation = 'quota' then
   update public.duuk_drive_connection set storage_limit = nullif(payload->>'limit','')::bigint, storage_usage = nullif(payload->>'usage','')::bigint, storage_checked_at = now() where singleton = true;
   if nullif(payload->>'limit','')::bigint > 0 and (payload->>'usage')::numeric / (payload->>'limit')::numeric >= 0.9 then
    perform duuk_private.notify_members('system','permissions','Armazenamento do Google Drive quase cheio','Mais de 90% do espaço da conta foi utilizado. Libere espaço para continuar guardando contratos.','/admin/configuracoes/integracoes','drive:quota:' || to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM'));
   end if;
  elsif operation = 'error' then
   update public.duuk_drive_connection set status = 'error', last_error = pending_error, lease_id = null, lease_until = null where singleton = true;
   perform duuk_private.notify_members('system','permissions','Reconecte o Google Drive','A autorização do Google expirou. Conecte a conta novamente para voltar a guardar os documentos.','/admin/configuracoes/integracoes','drive:auth:' || to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'));
  elsif operation = 'finish' then
   select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid for update;
   if doc.id is null then return '{}'::jsonb; end if;
   if doc.source_path is distinct from payload->>'expected_source_path' or doc.source_sha256 is distinct from payload->>'expected_source_sha256' then
    raise exception 'O documento mudou. A sincronização será retomada.' using errcode='PT409';
   end if;
   if pending_error is null then
    if doc.status = 'synced' then return '{}'::jsonb; end if;
    update public.duuk_drive_documents set status = 'synced', drive_file_id = payload->>'drive_file_id', drive_folder_id = payload->>'drive_folder_id', drive_link = payload->>'drive_link', synced_at = now(), last_attempt_at = now(), attempts = 0, last_error = null, error_notified_at = null where id = doc.id;
    update public.duuk_drive_connection set last_synced_at = now(), last_error = null where singleton = true;
    if doc.kind = 'file' then
     perform duuk_private.notify_members('system','drive','Arquivo salvo no Google Drive',doc.file_name,'/admin/drive','drive:saved:' || doc.id);
    elsif doc.kind in ('proposal','document') then
     perform duuk_private.notify_members('commercial','crm.clients',case when doc.kind='proposal' then 'Proposta salva no Google Drive' else 'Documento salvo no Google Drive' end,doc.file_name,'/admin/comercial/clientes' || case when doc.client_id is not null then '?cliente=' || doc.client_id else '' end,'drive:saved:' || doc.id);
    elsif doc.kind = 'contract_signed' then
     perform duuk_private.notify_members('contracts','contracts','Contrato finalizado salvo no Google Drive',doc.client_name || ' · ' || doc.file_name,'/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:signed:' || doc.id);
    elsif doc.error_notified_at is not null then
     perform duuk_private.notify_members('contracts','contracts','Documento sincronizado com o Google Drive',doc.file_name,'/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:recovered:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
    end if;
   else
    update public.duuk_drive_documents set status = 'error', attempts = case when (payload->>'retryable')::boolean is false then 8 else doc.attempts + 1 end, last_attempt_at = now(), last_error = left(pending_error,300),
     next_attempt_at = now() + least(interval '6 hours', interval '1 minute' * power(2, doc.attempts + 1)) + interval '1 second' * random() * 30 where id = doc.id returning * into doc;
    update public.duuk_drive_connection set last_error = left(pending_error,300) where singleton = true;
    if (doc.attempts >= 3) and doc.error_notified_at is null then
     update public.duuk_drive_documents set error_notified_at = now() where id = doc.id;
     if doc.kind = 'file' then
      perform duuk_private.notify_members('system','drive','Falha ao guardar o arquivo no Google Drive',doc.file_name || '. Consulte o estado e tente novamente após resolver a falha.','/admin/drive','drive:fail:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
     elsif doc.kind in ('proposal','document') then
      perform duuk_private.notify_members('commercial','crm.clients',case when doc.kind='proposal' then 'Falha ao guardar a proposta no Google Drive' else 'Falha ao guardar o documento no Google Drive' end,doc.file_name || '. Consulte o estado e tente novamente após resolver a falha.','/admin/comercial/clientes' || case when doc.client_id is not null then '?cliente=' || doc.client_id else '' end,'drive:fail:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
     else
      perform duuk_private.notify_members('contracts','contracts','Falha ao guardar o contrato no Google Drive',doc.file_name || '. O contrato continua salvo no DUUK Admin e uma nova tentativa será feita.','/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:fail:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
     end if;
    end if;
   end if;
  else
   update public.duuk_drive_connection set lease_id = null, lease_until = null where singleton = true;
  end if;
  return '{}'::jsonb;
 else
  raise exception 'Operação inválida.' using errcode = 'PT400';
 end if;
end $$;

create or replace function duuk_private.audit_scope() returns trigger language plpgsql set search_path='' as $$ begin
 new.required_permission=case new.entity when 'duuk_expenses' then 'finance' when 'duuk_contracts' then 'contracts' when 'duuk_contract_signatures' then 'contracts' when 'duuk_events' then 'agenda' when 'duuk_content' then 'site' when 'duuk_clients' then 'crm' when 'duuk_activities' then 'crm' when 'google_drive' then 'permissions' when 'duuk_drive_documents' then 'crm.clients' when 'duuk_whatsapp_templates' then 'crm.activities' when 'duuk_follow_ups' then 'crm' when 'duuk_mail_links' then 'mail' when 'duuk_profiles' then 'team' when 'duuk_roles' then 'permissions' when 'duuk_role_permissions' then 'permissions' when 'duuk_user_permissions' then 'permissions' when 'duuk_permissions' then 'permissions' else null end;
 return new;
end; $$;
