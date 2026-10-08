-- Google Drive: armazenamento central de contratos e propostas da DUUK.
-- Uma única conta Google (duukfilms@gmail.com), conectada por um super administrador.
-- Tokens ficam no Vault e só as RPCs do servidor (service_role) conseguem lê-los.
-- Esta migração não altera o fluxo de assinatura: os gatilhos apenas registram pendências
-- e qualquer falha deles é descartada para nunca interromper contratos ou assinaturas.

create table public.duuk_drive_connection (
 singleton boolean primary key default true check (singleton),
 generation uuid not null default gen_random_uuid(),
 google_subject text not null,
 account_email text not null,
 credential_id uuid,
 status text not null default 'connected' check (status in ('connected','error','disconnected')),
 connected_by uuid references public.duuk_profiles(id) on delete set null,
 connected_at timestamptz not null default now(),
 last_synced_at timestamptz,
 last_error text,
 storage_limit bigint,
 storage_usage bigint,
 storage_checked_at timestamptz,
 lease_id uuid,
 lease_until timestamptz
);
create index duuk_drive_connection_user_idx on public.duuk_drive_connection(connected_by);

create table public.duuk_drive_folders (
 key text primary key,
 drive_id text not null unique,
 name text not null,
 parent_key text references public.duuk_drive_folders(key) on delete cascade,
 client_key text,
 created_at timestamptz not null default now()
);
create index duuk_drive_folders_parent_idx on public.duuk_drive_folders(parent_key);

-- Sem chave estrangeira com cascade: documentos e referências ao Drive sobrevivem à exclusão do contrato.
create table public.duuk_drive_documents (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('contract_original','contract_signed','proposal','document')),
 contract_id uuid references public.duuk_contracts(id) on delete set null,
 client_id uuid references public.duuk_clients(id) on delete set null,
 client_key text not null,
 client_name text not null check (char_length(client_name) between 1 and 160),
 title text not null default '' check (char_length(title) <= 160),
 file_name text not null check (char_length(file_name) between 5 and 200),
 source_path text,
 source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check (status in ('pending','synced','error')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 drive_file_id text,
 drive_folder_id text,
 drive_link text,
 last_error text,
 error_notified_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 last_attempt_at timestamptz,
 synced_at timestamptz,
 check ((status = 'synced') = (drive_file_id is not null))
);
create unique index duuk_drive_contract_kind_idx on public.duuk_drive_documents(contract_id,kind) where contract_id is not null and kind in ('contract_original','contract_signed');
create unique index duuk_drive_file_idx on public.duuk_drive_documents(drive_file_id) where drive_file_id is not null;
create unique index duuk_drive_proposal_idx on public.duuk_drive_documents(client_key,source_sha256) where kind = 'proposal';
create index duuk_drive_documents_due_idx on public.duuk_drive_documents(next_attempt_at) where status <> 'synced';
create index duuk_drive_documents_client_idx on public.duuk_drive_documents(client_id);
create index duuk_drive_documents_client_key_idx on public.duuk_drive_documents(client_key,kind);
create index duuk_drive_documents_created_by_idx on public.duuk_drive_documents(created_by);

create table duuk_private.drive_oauth_states (
 state_hash text primary key,
 user_id uuid not null references public.duuk_profiles on delete cascade,
 verifier text not null,
 consumed_at timestamptz,
 expires_at timestamptz not null default now() + interval '10 minutes'
);
create index drive_oauth_user_idx on duuk_private.drive_oauth_states(user_id);

do $$ declare t text; begin foreach t in array array['duuk_drive_connection','duuk_drive_folders','duuk_drive_documents'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
alter table duuk_private.drive_oauth_states enable row level security;
revoke all on duuk_private.drive_oauth_states from public,anon,authenticated;
grant all on duuk_private.drive_oauth_states to service_role;

-- O navegador lê apenas o estado da sincronização; IDs, pastas e links do Drive só passam pelo backend.
grant select(id,kind,contract_id,client_id,client_name,file_name,status,attempts,last_error,created_at,synced_at) on public.duuk_drive_documents to authenticated;
create policy drive_documents_read on public.duuk_drive_documents for select to authenticated using (
 (kind in ('contract_original','contract_signed') and (select duuk_private.has_permission('contracts')))
 or (kind = 'proposal' and (select duuk_private.has_permission('crm.clients')))
);

create function duuk_private.drive_safe_name(value text, fallback text) returns text
 language sql immutable set search_path='' as $$
 select coalesce(nullif(btrim(left(btrim(regexp_replace(regexp_replace(coalesce(value,''),'[\\/:*?"<>|[:cntrl:]]+',' ','g'),'\s+',' ','g')),90)),''),fallback);
$$;

-- Identifica o cliente pelo cadastro do CRM quando há correspondência única; caso contrário,
-- usa uma chave estável derivada de nome e e-mail. Nomes iguais com cadastros diferentes não se misturam.
create function duuk_private.drive_resolve_client(client_name text, client_email text, out resolved_id uuid, out resolved_key text)
 language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; begin
 if nullif(btrim(client_email),'') is not null then
  select array_agg(id) into ids from public.duuk_clients where lower(btrim(email)) = lower(btrim(client_email));
  if array_length(ids,1) = 1 then resolved_id := ids[1]; resolved_key := 'crm:' || ids[1]; return; end if;
 end if;
 select array_agg(id) into ids from public.duuk_clients
  where lower(btrim(name)) = lower(btrim(client_name)) or (company <> '' and lower(btrim(company)) = lower(btrim(client_name)));
 if array_length(ids,1) = 1 then resolved_id := ids[1]; resolved_key := 'crm:' || ids[1]; return; end if;
 resolved_key := 'ext:' || md5(lower(btrim(client_name)) || '|' || lower(btrim(coalesce(client_email,''))));
end $$;

create function duuk_private.drive_queue_contract(c public.duuk_contracts) returns void
 language plpgsql security definer set search_path='' as $$
declare original public.duuk_drive_documents; signed public.duuk_drive_documents; r record; label text; n integer; begin
 perform pg_advisory_xact_lock(hashtext('duuk-drive-contract:' || c.id));
 select * into original from public.duuk_drive_documents where contract_id = c.id and kind = 'contract_original';
 if original.id is null then
  select * into r from duuk_private.drive_resolve_client(c.client_name,c.client_email);
  perform pg_advisory_xact_lock(hashtext('duuk-drive-name:' || r.resolved_key));
  label := duuk_private.drive_safe_name(c.client_name,'Cliente');
  select count(*) into n from public.duuk_drive_documents where client_key = r.resolved_key and kind = 'contract_original';
  insert into public.duuk_drive_documents(kind,contract_id,client_id,client_key,client_name,title,file_name,source_path,source_sha256,created_by)
  values('contract_original',c.id,r.resolved_id,r.resolved_key,label,left(c.title,160),'Contrato ' || label || case when n > 0 then ' (' || (n + 1) || ')' else '' end || '.pdf',c.original_path,c.original_sha256,c.created_by)
  returning * into original;
 end if;
 -- O PDF final só entra na fila depois que ambas as assinaturas existem e o PDF da versão atual foi gerado.
 if c.status = 'signed' and c.signed_path is not null and c.signed_sha256 is not null and c.rendered_version = c.version
    and (select count(distinct party) from public.duuk_contract_signatures where contract_id = c.id) = 2 then
  select * into signed from public.duuk_drive_documents where contract_id = c.id and kind = 'contract_signed';
  if signed.id is null then
   insert into public.duuk_drive_documents(kind,contract_id,client_id,client_key,client_name,title,file_name,source_path,source_sha256)
   values('contract_signed',c.id,original.client_id,original.client_key,original.client_name,original.title,regexp_replace(original.file_name,'\.pdf$','') || ' - Assinado.pdf',c.signed_path,c.signed_sha256);
  elsif signed.status <> 'synced' and signed.source_path is distinct from c.signed_path then
   update public.duuk_drive_documents set source_path = c.signed_path, source_sha256 = c.signed_sha256, status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where id = signed.id;
  end if;
 end if;
end $$;

create function duuk_private.drive_contract_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin perform duuk_private.drive_queue_contract(new);
 exception when others then raise warning 'DUUK Drive: pendência não registrada (%)', sqlstate;
 end;
 return new;
end $$;
create trigger drive_contract_queue after insert or update of status,signed_path,rendered_version on public.duuk_contracts
 for each row execute function duuk_private.drive_contract_trigger();

-- Rascunhos excluídos nunca chegaram ao Drive: a pendência some junto com o PDF de origem.
-- Documentos já enviados permanecem registrados e nenhum arquivo é removido do Drive.
create function duuk_private.drive_contract_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin delete from public.duuk_drive_documents where contract_id = old.id and status <> 'synced';
 exception when others then raise warning 'DUUK Drive: pendência não removida (%)', sqlstate;
 end;
 return old;
end $$;
create trigger drive_contract_cleanup before delete on public.duuk_contracts
 for each row execute function duuk_private.drive_contract_delete();

-- Contratos já existentes entram na fila como pendentes; nada é enviado antes da conexão da conta.
do $$ declare c public.duuk_contracts; begin
 for c in select * from public.duuk_contracts order by created_at loop perform duuk_private.drive_queue_contract(c); end loop;
end $$;

create function duuk_private.drive_require_super(actor uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.duuk_profiles where id = actor and active and is_super_admin) then
  raise exception 'Somente um super administrador pode gerenciar o Google Drive.' using errcode = 'PT403';
 end if;
end $$;

create function duuk_private.drive_document_permission(kind text) returns text language sql immutable set search_path='' as $$
 select case when kind in ('contract_original','contract_signed') then 'contracts' else 'crm.clients' end;
$$;

create function duuk_private.drive_backend(operation text, payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid := nullif(payload->>'user_id','')::uuid; c public.duuk_drive_connection; s duuk_private.drive_oauth_states;
 doc public.duuk_drive_documents; secret uuid; result jsonb; lease uuid; profile_name text; n integer; label text; base text; owner record;
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
  if c.credential_id is not null then delete from vault.secrets where id = c.credential_id; end if;
  secret := vault.create_secret((payload->'tokens')::text);
  if c.singleton is not null and c.google_subject is distinct from payload->>'google_subject' then
   -- Outra conta: as pastas e os arquivos antigos permanecem intactos no Drive anterior; os documentos voltam à fila.
   delete from public.duuk_drive_folders;
   update public.duuk_drive_documents set status = 'pending', attempts = 0, next_attempt_at = now(), drive_file_id = null, drive_folder_id = null, drive_link = null, synced_at = null, last_error = null, error_notified_at = null;
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
   select decrypted_secret::jsonb into result from vault.decrypted_secrets where id = c.credential_id;
   delete from vault.secrets where id = c.credential_id;
  end if;
  delete from duuk_private.drive_oauth_states where user_id = actor;
  update public.duuk_drive_connection set status = 'disconnected', credential_id = null, generation = gen_random_uuid(), lease_id = null, lease_until = null, last_error = null;
  select name into profile_name from public.duuk_profiles where id = actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.disconnect','google_drive','duukfilms','Google Drive desconectado. Arquivos existentes foram preservados.');
  perform duuk_private.notify_members('system','permissions','Google Drive desconectado','Os documentos novos aguardam uma nova conexão. Os arquivos já salvos continuam no Drive.','/admin/configuracoes/integracoes','drive:disconnected:' || extract(epoch from clock_timestamp())::bigint);
  delete from public.duuk_notifications where user_id = actor and dedupe_key like 'drive:disconnected:%' and created_at > now() - interval '1 minute';
  return coalesce(result,'{}'::jsonb);

 elsif operation = 'documents' then
  select * into c from public.duuk_drive_connection;
  if payload->>'contract_id' is not null then
   if not duuk_private.member_permission(actor,'contracts') then raise exception 'Sem acesso aos contratos.' using errcode = 'PT403'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.kind) from public.duuk_drive_documents d where d.contract_id = (payload->>'contract_id')::uuid),'[]'::jsonb);
  elsif payload->>'client_id' is not null then
   if not duuk_private.member_permission(actor,'crm.clients') then raise exception 'Sem acesso aos clientes.' using errcode = 'PT403'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'created_at',d.created_at,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.created_at desc) from public.duuk_drive_documents d where d.client_id = (payload->>'client_id')::uuid and d.kind = 'proposal'),'[]'::jsonb);
  end if;
  raise exception 'Informe o contrato ou o cliente.' using errcode = 'PT400';

 elsif operation = 'file' then
  select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid;
  if doc.id is null then raise exception 'Documento não encontrado.' using errcode = 'PT404'; end if;
  if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode = 'PT403'; end if;
  return jsonb_build_object('file_name',doc.file_name,'source_path',doc.source_path);

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
  select id,name,company into owner from public.duuk_clients where id = (payload->>'client_id')::uuid;
  if owner.id is null then raise exception 'Cliente não encontrado.' using errcode = 'PT404'; end if;
  label := duuk_private.drive_safe_name(coalesce(nullif(owner.company,''),owner.name),'Cliente');
  perform pg_advisory_xact_lock(hashtext('duuk-drive-name:crm:' || owner.id));
  if exists(select 1 from public.duuk_drive_documents where kind = 'proposal' and client_key = 'crm:' || owner.id and source_sha256 = payload->>'sha256') then
   raise exception 'Esta proposta já foi anexada a este cliente.' using errcode = 'PT409';
  end if;
  select count(*) into n from public.duuk_drive_documents where kind = 'proposal' and client_key = 'crm:' || owner.id;
  insert into public.duuk_drive_documents(kind,client_id,client_key,client_name,title,file_name,source_path,source_sha256,created_by)
  values('proposal',owner.id,'crm:' || owner.id,label,'Proposta Comercial','Proposta Comercial ' || label || case when n > 0 then ' (' || (n + 1) || ')' else '' end || '.pdf',payload->>'source_path',payload->>'sha256',actor)
  returning * into doc;
  select name into profile_name from public.duuk_profiles where id = actor;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(actor,coalesce(profile_name,''),'drive.proposal','duuk_drive_documents',doc.id::text,'Proposta em PDF anexada ao cliente.');
  return jsonb_build_object('id',doc.id,'file_name',doc.file_name,'status',doc.status);

 elsif operation = 'claim' then
  delete from duuk_private.drive_oauth_states where expires_at < now();
  select * into c from public.duuk_drive_connection
   where status = 'connected' and credential_id is not null and (lease_until is null or lease_until < now())
    and (exists(select 1 from public.duuk_drive_documents d where d.status <> 'synced' and d.attempts < 8 and d.next_attempt_at <= now() and d.source_path is not null)
     or storage_checked_at is null or storage_checked_at < now() - interval '6 hours')
   for update skip locked;
  if c.singleton is null then return null; end if;
  lease := gen_random_uuid();
  update public.duuk_drive_connection set lease_id = lease, lease_until = now() + interval '90 seconds';
  select decrypted_secret::jsonb into result from vault.decrypted_secrets where id = c.credential_id;
  return jsonb_build_object('generation',c.generation,'lease_id',lease,'tokens',result,'quota_due',c.storage_checked_at is null or c.storage_checked_at < now() - interval '6 hours');

 elsif operation in ('jobs','tokens','finish','release','error','quota','folder_get','folder_save','folder_forget','unique_name') then
  select * into c from public.duuk_drive_connection where generation = (payload->>'generation')::uuid and lease_id = (payload->>'lease_id')::uuid and lease_until > now() and status = 'connected' for update;
  if c.singleton is null then raise exception 'A conexão mudou. Operação interrompida.' using errcode = 'PT409'; end if;
  if operation = 'jobs' then
   return coalesce((select jsonb_agg(to_jsonb(j)) from (
    select id,kind,contract_id,client_key,client_name,file_name,source_path,source_sha256
    from public.duuk_drive_documents
    where status <> 'synced' and source_path is not null and ((payload->>'document_id' is not null and id = (payload->>'document_id')::uuid) or (payload->>'document_id' is null and attempts < 8 and next_attempt_at <= now()))
    order by kind desc, created_at limit least(coalesce((payload->>'limit')::integer,4),10)) j),'[]'::jsonb);
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
   update public.duuk_drive_connection set storage_limit = nullif(payload->>'limit','')::bigint, storage_usage = nullif(payload->>'usage','')::bigint, storage_checked_at = now();
   if nullif(payload->>'limit','')::bigint > 0 and (payload->>'usage')::numeric / (payload->>'limit')::numeric >= 0.9 then
    perform duuk_private.notify_members('system','permissions','Armazenamento do Google Drive quase cheio','Mais de 90% do espaço da conta foi utilizado. Libere espaço para continuar guardando contratos.','/admin/configuracoes/integracoes','drive:quota:' || to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM'));
   end if;
  elsif operation = 'error' then
   update public.duuk_drive_connection set status = 'error', last_error = pending_error, lease_id = null, lease_until = null;
   perform duuk_private.notify_members('system','permissions','Reconecte o Google Drive','A autorização do Google expirou. Conecte a conta novamente para voltar a guardar os documentos.','/admin/configuracoes/integracoes','drive:auth:' || to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'));
  elsif operation = 'finish' then
   select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid for update;
   if doc.id is null then return '{}'::jsonb; end if;
   if pending_error is null then
    if doc.status = 'synced' then return '{}'::jsonb; end if;
    update public.duuk_drive_documents set status = 'synced', drive_file_id = payload->>'drive_file_id', drive_folder_id = payload->>'drive_folder_id', drive_link = payload->>'drive_link', synced_at = now(), last_attempt_at = now(), attempts = 0, last_error = null, error_notified_at = null where id = doc.id;
    update public.duuk_drive_connection set last_synced_at = now(), last_error = null;
    if doc.kind = 'proposal' then
     if doc.error_notified_at is not null then perform duuk_private.notify_members('commercial','crm.clients','Proposta salva no Google Drive',doc.file_name,'/admin/comercial/clientes?cliente=' || doc.client_id,'drive:recovered:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint); end if;
    elsif doc.kind = 'contract_signed' then
     perform duuk_private.notify_members('contracts','contracts','Contrato finalizado salvo no Google Drive',doc.client_name || ' · ' || doc.file_name,'/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:signed:' || doc.id);
    elsif doc.error_notified_at is not null then
     perform duuk_private.notify_members('contracts','contracts','Documento sincronizado com o Google Drive',doc.file_name,'/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:recovered:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
    end if;
   else
    update public.duuk_drive_documents set status = 'error', attempts = case when (payload->>'retryable')::boolean is false then 8 else doc.attempts + 1 end, last_attempt_at = now(), last_error = left(pending_error,300),
     next_attempt_at = now() + least(interval '6 hours', interval '1 minute' * power(2, doc.attempts + 1)) + interval '1 second' * random() * 30 where id = doc.id returning * into doc;
    update public.duuk_drive_connection set last_error = left(pending_error,300);
    if (doc.attempts >= 3) and doc.error_notified_at is null then
     update public.duuk_drive_documents set error_notified_at = now() where id = doc.id;
     if doc.kind = 'proposal' then
      perform duuk_private.notify_members('commercial','crm.clients','Falha ao guardar a proposta no Google Drive',doc.file_name || '. Tente novamente em alguns minutos.','/admin/comercial/clientes?cliente=' || doc.client_id,'drive:fail:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
     else
      perform duuk_private.notify_members('contracts','contracts','Falha ao guardar o contrato no Google Drive',doc.file_name || '. O contrato continua salvo no DUUK Admin e uma nova tentativa será feita.','/admin/contratos' || coalesce('/' || doc.contract_id,''),'drive:fail:' || doc.id || ':' || extract(epoch from clock_timestamp())::bigint);
     end if;
    end if;
   end if;
  else
   update public.duuk_drive_connection set lease_id = null, lease_until = null;
  end if;
  return '{}'::jsonb;
 else
  raise exception 'Operação inválida.' using errcode = 'PT400';
 end if;
end $$;

create function public.duuk_drive_backend(operation text, payload jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.drive_backend(operation,payload); $$;

revoke all on function duuk_private.drive_safe_name(text,text),duuk_private.drive_resolve_client(text,text),duuk_private.drive_queue_contract(public.duuk_contracts),duuk_private.drive_contract_trigger(),duuk_private.drive_contract_delete(),duuk_private.drive_require_super(uuid),duuk_private.drive_document_permission(text),duuk_private.drive_backend(text,jsonb),public.duuk_drive_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.drive_safe_name(text,text),duuk_private.drive_resolve_client(text,text),duuk_private.drive_require_super(uuid),duuk_private.drive_document_permission(text),duuk_private.drive_backend(text,jsonb),public.duuk_drive_backend(text,jsonb) to service_role;

select cron.schedule('duuk-drive-sync','* * * * *',$cron$ select net.http_post(url:='https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-drive',headers:=jsonb_build_object('Content-Type','application/json','x-duuk-cron',(select decrypted_secret from vault.decrypted_secrets where name='duuk.push.cron')),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=55000); $cron$);
