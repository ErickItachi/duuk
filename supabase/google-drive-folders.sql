-- Organização privada das pastas criadas pela DUUK no Google Drive.
-- Não remove originais do Supabase nem altera contratos, assinaturas ou evidências.
-- O Google é atualizado pelo servidor; o diário permite confirmar a mesma operação
-- novamente quando uma resposta se perde, sem repetir a criação de uma pasta.

alter table public.duuk_drive_folders
 add column description text not null default '' check (char_length(description)<=2000),
 add column trashed_at timestamptz,
 add column directly_trashed boolean not null default false,
 add column revision integer not null default 1 check(revision>0),
 add column required_permissions text[] not null default array['drive']::text[] check(required_permissions<@array['drive','contracts','crm.clients']::text[]),
 add column updated_at timestamptz not null default now(),
 add column created_by uuid references public.duuk_profiles(id) on delete set null;
alter table public.duuk_drive_documents
 add column drive_description text not null default '' check (char_length(drive_description)<=2000),
 add column drive_trashed_at timestamptz,
 add column directly_trashed boolean not null default false,
 add column drive_revision integer not null default 1 check(drive_revision>0),
 add column managed_folder_key text;
alter table public.duuk_drive_documents drop constraint duuk_drive_documents_file_name_check;
alter table public.duuk_drive_documents add constraint duuk_drive_documents_file_name_check check(char_length(file_name) between 1 and 200);
create index duuk_drive_folders_created_by_idx on public.duuk_drive_folders(created_by);
create index duuk_drive_documents_folder_idx on public.duuk_drive_documents(drive_folder_id);
create index duuk_drive_documents_managed_folder_idx on public.duuk_drive_documents(managed_folder_key) where managed_folder_key is not null;

create table duuk_private.drive_operations (
 id uuid primary key,
 actor_id uuid not null references public.duuk_profiles(id) on delete cascade,
 generation uuid not null,
 action text not null check(action in ('folder_create','folder_update','folder_move','folder_trash','folder_restore','document_update','document_move','document_trash','document_restore')),
 item_type text not null check(item_type in ('folder','file')),
 item_id text not null,
 desired jsonb not null,
 before_value jsonb,
 result jsonb,
 status text not null default 'pending' check(status in ('pending','complete','error')),
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index drive_operations_actor_idx on duuk_private.drive_operations(actor_id);
create index drive_operations_pending_item_idx on duuk_private.drive_operations(item_type,item_id) where status<>'complete';
alter table duuk_private.drive_operations enable row level security;
revoke all on duuk_private.drive_operations from public,anon,authenticated;
grant all on duuk_private.drive_operations to service_role;

-- A permissão acompanha a categoria lógica e o documento, mesmo depois de mover.
create function duuk_private.drive_folder_permissions(folder_key text) returns text[]
 language sql stable set search_path='' as $$
 with recursive ancestry as (
  select f.key,f.parent_key,f.required_permissions,0 as depth from public.duuk_drive_folders f where f.key=folder_key
  union all
  select p.key,p.parent_key,p.required_permissions,a.depth+1 from public.duuk_drive_folders p join ancestry a on p.key=a.parent_key where a.depth<64
 ), permissions as (
  select unnest(required_permissions) as permission from ancestry
  union select 'contracts' from ancestry where key='section:contracts' or key like 'client:contracts:%'
  union select 'crm.clients' from ancestry where key='section:proposals' or key like 'client:proposals:%'
  union select 'drive'
 ) select array_agg(distinct permission order by permission) from permissions;
$$;
create function duuk_private.drive_folder_permission(folder_key text) returns text
 language sql stable set search_path='' as $$
 select case when 'contracts'=any(duuk_private.drive_folder_permissions(folder_key)) then 'contracts'
  when 'crm.clients'=any(duuk_private.drive_folder_permissions(folder_key)) then 'crm.clients' else 'drive' end;
$$;
create function duuk_private.drive_folder_can_access(actor uuid,folder_key text) returns boolean
 language sql stable set search_path='' as $$
 select duuk_private.member_permission(actor,'drive') and not exists(
  select 1 from unnest(duuk_private.drive_folder_permissions(folder_key)) required where not duuk_private.member_permission(actor,required));
$$;
create function duuk_private.drive_folder_pending(folder_key text,except_id uuid default null) returns boolean
 language sql stable set search_path='' as $$
 with recursive ancestry as (
  select f.key,f.parent_key,0 as depth from public.duuk_drive_folders f where f.key=folder_key
  union all select f.key,f.parent_key,a.depth+1 from public.duuk_drive_folders f join ancestry a on f.key=a.parent_key where a.depth<64
 ) select exists(select 1 from duuk_private.drive_operations o join public.duuk_drive_connection c on c.generation=o.generation
  where o.item_type='folder' and o.item_id in(select key from ancestry) and o.status<>'complete' and o.id is distinct from except_id);
$$;

create function duuk_private.drive_folder_trashed(folder_key text) returns boolean
 language sql stable set search_path='' as $$
 with recursive ancestry as (
  select f.key,f.parent_key,f.directly_trashed,0 as depth from public.duuk_drive_folders f where f.key=folder_key
  union all
  select p.key,p.parent_key,p.directly_trashed,a.depth+1 from public.duuk_drive_folders p join ancestry a on p.key=a.parent_key where a.depth<64
 ) select exists(select 1 from ancestry where directly_trashed);
$$;

create function duuk_private.drive_folder_require(actor uuid,folder_key text,descendants boolean default false) returns void
 language plpgsql stable set search_path='' as $$
declare denied boolean;
begin
 if not duuk_private.member_permission(actor,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
 if not exists(select 1 from public.duuk_drive_folders where key=folder_key) then raise exception 'Pasta não encontrada.' using errcode='PT404'; end if;
 if not duuk_private.drive_folder_can_access(actor,folder_key) then raise exception 'Você não tem acesso a esta pasta.' using errcode='PT403'; end if;
 if descendants then
  with recursive tree as (
   select f.key,f.drive_id,0 as depth from public.duuk_drive_folders f where f.key=folder_key
   union all
   select f.key,f.drive_id,t.depth+1 from public.duuk_drive_folders f join tree t on f.parent_key=t.key where t.depth<64
  ) select exists(
   select 1 from tree t where not duuk_private.drive_folder_can_access(actor,t.key)
   union all
   select 1 from public.duuk_drive_documents d join tree t on d.drive_folder_id=t.drive_id or d.managed_folder_key=t.key
    where not duuk_private.member_permission(actor,duuk_private.drive_document_permission(d.kind))
  ) into denied;
  if denied then raise exception 'Esta pasta contém documentos de módulos aos quais você não tem acesso.' using errcode='PT403'; end if;
 end if;
end $$;

create function duuk_private.drive_folder_can_manage(actor uuid,folder_key text) returns boolean
 language plpgsql stable set search_path='' as $$
begin
 perform duuk_private.drive_folder_require(actor,folder_key,true);
 return true;
exception when sqlstate 'PT403' or sqlstate 'PT404' then return false;
end $$;

-- A lixeira de uma pasta é herdada. Restaurá-la não restaura um arquivo que já
-- estava individualmente na lixeira antes de mover a pasta.
create function duuk_private.drive_refresh_trash() returns void
 language plpgsql set search_path='' as $$
begin
 with states as (
  select f.key,duuk_private.drive_folder_trashed(f.key) as trashed from public.duuk_drive_folders f
 ) update public.duuk_drive_folders f set
  trashed_at=case when s.trashed then coalesce(f.trashed_at,now()) else null end,
  revision=f.revision+1,updated_at=now()
 from states s where f.key=s.key and (f.trashed_at is not null) is distinct from s.trashed;
 update public.duuk_drive_documents d set
  drive_trashed_at=case when d.directly_trashed or coalesce(f.trashed_at is not null,false) then coalesce(d.drive_trashed_at,now()) else null end,
  drive_revision=d.drive_revision+1
 from (select doc.id,folder.trashed_at from public.duuk_drive_documents doc left join public.duuk_drive_folders folder
  on folder.key=doc.managed_folder_key or (doc.managed_folder_key is null and folder.drive_id=doc.drive_folder_id)) f
 where d.id=f.id and (d.drive_trashed_at is not null) is distinct from (d.directly_trashed or coalesce(f.trashed_at is not null,false));
end $$;

create function duuk_private.drive_folder_row(actor uuid,folder_key text) returns jsonb
 language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.key,'name',f.name,'description',f.description,'parent_id',f.parent_key,
  'trashed',f.trashed_at is not null,'directly_trashed',f.directly_trashed,'revision',f.revision,
  'can_edit',duuk_private.drive_folder_can_manage(actor,f.key) and f.trashed_at is null,
  'can_move',f.key<>'root' and duuk_private.drive_folder_can_manage(actor,f.key) and f.trashed_at is null,
  'can_trash',f.key<>'root' and duuk_private.drive_folder_can_manage(actor,f.key) and f.trashed_at is null,
  'can_restore',f.key<>'root' and f.directly_trashed and duuk_private.drive_folder_can_manage(actor,f.key),
  'pending_change',(select o.desired||jsonb_build_object('request_id',o.id) from duuk_private.drive_operations o
   where o.item_type='folder' and o.item_id=f.key and o.actor_id=actor and o.status<>'complete' order by o.created_at limit 1),
  'path',(with recursive ancestry as (
   select p.key,p.parent_key,p.name,0 as depth from public.duuk_drive_folders p where p.key=f.key
   union all select p.key,p.parent_key,p.name,a.depth+1 from public.duuk_drive_folders p join ancestry a on p.key=a.parent_key where a.depth<64
  ) select string_agg(name,' / ' order by depth desc) from ancestry))
 from public.duuk_drive_folders f where f.key=folder_key;
$$;

create function duuk_private.drive_operation_visible(actor uuid,change duuk_private.drive_operations) returns boolean
 language sql stable set search_path='' as $$
 select change.actor_id=actor and duuk_private.member_permission(actor,'drive')
  and (case when change.action='folder_create' then duuk_private.drive_folder_can_access(actor,coalesce(change.desired->>'parent_id','root'))
   when change.item_type='folder' then duuk_private.drive_folder_can_access(actor,change.item_id)
   else exists(select 1 from public.duuk_drive_documents d left join public.duuk_drive_folders f on f.drive_id=d.drive_folder_id
    where d.id::text=change.item_id and duuk_private.member_permission(actor,duuk_private.drive_document_permission(d.kind))
     and (coalesce(d.managed_folder_key,f.key) is null or duuk_private.drive_folder_can_access(actor,coalesce(d.managed_folder_key,f.key)))) end)
  and (nullif(change.desired->>'parent_id','') is null or duuk_private.drive_folder_can_access(actor,change.desired->>'parent_id'));
$$;

create function duuk_private.drive_document_folder_key(doc public.duuk_drive_documents) returns text
 language sql stable set search_path='' as $$
 select coalesce(doc.managed_folder_key,(select key from public.duuk_drive_folders where drive_id=doc.drive_folder_id),
  (select f.key from unnest(array[
   'root',
   'section:'||(case when doc.kind in('contract_original','contract_signed') then 'contracts' when doc.kind='proposal' then 'proposals' else 'documents' end),
   'client:'||(case when doc.kind in('contract_original','contract_signed') then 'contracts' when doc.kind='proposal' then 'proposals' else 'documents' end)||':'||doc.client_key,
   case when doc.kind in('contract_original','contract_signed') then 'client:contracts:'||doc.client_key||':'||(case when doc.kind='contract_signed' then 'signed' else 'generated' end) end
  ]) with ordinality choice(key,depth) join public.duuk_drive_folders f on f.key=choice.key order by depth desc limit 1));
$$;
create function duuk_private.drive_document_blocked(doc public.duuk_drive_documents) returns boolean
 language sql stable set search_path='' as $$
 select doc.drive_trashed_at is not null or duuk_private.drive_folder_trashed(duuk_private.drive_document_folder_key(doc))
  or duuk_private.drive_folder_pending(duuk_private.drive_document_folder_key(doc));
$$;

revoke all on function duuk_private.drive_folder_permission(text),duuk_private.drive_folder_trashed(text),duuk_private.drive_folder_require(uuid,text,boolean) from public,anon,authenticated;
grant execute on function duuk_private.drive_folder_permission(text),duuk_private.drive_folder_trashed(text),duuk_private.drive_folder_require(uuid,text,boolean) to service_role;
revoke all on function duuk_private.drive_folder_can_manage(uuid,text),duuk_private.drive_refresh_trash(),duuk_private.drive_folder_row(uuid,text) from public,anon,authenticated;
grant execute on function duuk_private.drive_folder_can_manage(uuid,text),duuk_private.drive_refresh_trash(),duuk_private.drive_folder_row(uuid,text) to service_role;
revoke all on function duuk_private.drive_folder_permissions(text),duuk_private.drive_folder_can_access(uuid,text) from public,anon,authenticated;
grant execute on function duuk_private.drive_folder_permissions(text),duuk_private.drive_folder_can_access(uuid,text) to service_role;
revoke all on function duuk_private.drive_folder_pending(text,uuid),duuk_private.drive_operation_visible(uuid,duuk_private.drive_operations),duuk_private.drive_document_folder_key(public.duuk_drive_documents),duuk_private.drive_document_blocked(public.duuk_drive_documents) from public,anon,authenticated;
grant execute on function duuk_private.drive_folder_pending(text,uuid),duuk_private.drive_operation_visible(uuid,duuk_private.drive_operations),duuk_private.drive_document_folder_key(public.duuk_drive_documents),duuk_private.drive_document_blocked(public.duuk_drive_documents) to service_role;

create function duuk_private.drive_manage_backend(operation text,payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=nullif(payload->>'user_id','')::uuid;
 c public.duuk_drive_connection;
 f public.duuk_drive_folders;
 parent public.duuk_drive_folders;
 d public.duuk_drive_documents;
 change duuk_private.drive_operations;
 action text:=payload->>'action';
 subject_id text:=nullif(payload->>'id','');
 parent_id text:=nullif(payload->>'parent_id','');
 request_id uuid:=nullif(payload->>'request_id','')::uuid;
 requested_name text:=nullif(btrim(payload->>'name'),'');
 requested_description text:=coalesce(payload->>'description','');
 expected_revision integer:=coalesce((payload->>'revision')::integer,0);
 desired jsonb;
 target jsonb;
 results jsonb;
 folders jsonb;
 documents jsonb;
 crumbs jsonb;
 lease uuid;
 folder_key text;
 requested_kind text:=nullif(payload->>'kind','');
 searching text:=nullif(lower(left(btrim(payload->>'search'),120)),'');
 trash boolean:=coalesce((payload->>'trashed')::boolean,false);
 all_items boolean:=coalesce(payload->>'view','folder')='all';
 offset_value integer:=least(greatest(coalesce((payload->>'offset')::integer,0),0),100000);
 profile_name text;
 mode text;
 duplicate boolean;
 extension text;
begin
 if operation in ('browse','folders','upload_folder','prepare') then
  if not duuk_private.member_permission(actor,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
 end if;

 if operation in ('browse','folders') then
  select * into c from public.duuk_drive_connection;
  folder_key:=coalesce(nullif(payload->>'folder_id',''),'root');
  if operation='browse' and not all_items and not trash then
   if exists(select 1 from public.duuk_drive_folders where key=folder_key) then
    perform duuk_private.drive_folder_require(actor,folder_key);
    select * into f from public.duuk_drive_folders where key=folder_key;
    if f.trashed_at is not null then raise exception 'Esta pasta está na lixeira. Restaure-a para abrir.' using errcode='PT409'; end if;
    with recursive ancestry as (
     select p.key,p.parent_key,p.name,0 as depth from public.duuk_drive_folders p where p.key=folder_key
     union all select p.key,p.parent_key,p.name,a.depth+1 from public.duuk_drive_folders p join ancestry a on p.key=a.parent_key where a.depth<64
    ) select coalesce(jsonb_agg(jsonb_build_object('id',key,'name',name) order by depth desc),'[]'::jsonb) into crumbs from ancestry;
   elsif folder_key<>'root' then raise exception 'Pasta não encontrada.' using errcode='PT404'; end if;
  end if;
  select coalesce(jsonb_agg(duuk_private.drive_folder_row(actor,visible.key) order by lower(visible.name),visible.key),'[]'::jsonb) into folders from (
   select x.key,x.name from public.duuk_drive_folders x
   where duuk_private.drive_folder_can_access(actor,x.key)
    and (case when operation='folders' then x.trashed_at is null
     when trash then x.directly_trashed
     when all_items then false else x.parent_key=folder_key and x.trashed_at is null end)
    and (searching is null or position(searching in lower(x.name||' '||x.description))>0)
   order by lower(x.name),x.key limit 1000
  ) visible;
  if operation='folders' then return jsonb_build_object('folders',folders); end if;
  select coalesce(jsonb_agg(to_jsonb(visible) order by visible.created_at desc,visible.id),'[]'::jsonb) into documents from (
   select doc.id,doc.kind,doc.title,doc.file_name,doc.client_name,doc.status,doc.last_error,doc.created_at,doc.synced_at,doc.mime_type,doc.byte_size,
    doc.contract_id,doc.client_id,case when c.status='connected' then doc.drive_link end as drive_link,
    coalesce(doc.managed_folder_key,p.key) as folder_id,doc.drive_description as description,doc.drive_revision as revision,
    doc.drive_trashed_at is not null as trashed,doc.directly_trashed,
    doc.drive_trashed_at is null and doc.status='synced' as can_edit,doc.drive_trashed_at is null and doc.status='synced' as can_move,
    doc.drive_trashed_at is null and doc.status='synced' as can_trash,doc.directly_trashed and doc.status='synced' as can_restore
    ,(select o.desired||jsonb_build_object('request_id',o.id) from duuk_private.drive_operations o
     where o.item_type='file' and o.item_id=doc.id::text and o.actor_id=actor and o.status<>'complete' order by o.created_at limit 1) as pending_change
   from public.duuk_drive_documents doc left join public.duuk_drive_folders p on p.drive_id=doc.drive_folder_id
   where duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind))
    and (coalesce(doc.managed_folder_key,p.key) is null or duuk_private.drive_folder_can_access(actor,coalesce(doc.managed_folder_key,p.key)))
    and (case when trash then doc.directly_trashed
     else doc.drive_trashed_at is null and (all_items or coalesce(doc.managed_folder_key,p.key)=folder_key) end)
    and (requested_kind is null or doc.kind=requested_kind)
    and (searching is null or position(searching in lower(doc.file_name||' '||doc.client_name||' '||doc.title||' '||doc.drive_description))>0)
   order by doc.created_at desc,doc.id limit 51 offset offset_value
  ) visible;
  return jsonb_build_object('folders',folders,'documents',documents,'breadcrumbs',coalesce(crumbs,'[]'::jsonb),
   'folder',case when f.key is not null then duuk_private.drive_folder_row(actor,f.key) else null end,
   'connected',c.status='connected','account_email',c.account_email,'pending_changes',coalesce((select jsonb_agg(o.desired||jsonb_build_object('request_id',o.id) order by o.created_at) from duuk_private.drive_operations o where duuk_private.drive_operation_visible(actor,o) and o.generation=c.generation and o.status<>'complete'),'[]'::jsonb));

 elsif operation='upload_folder' then
  folder_key:=coalesce(nullif(payload->>'folder_id',''),'root');
  perform duuk_private.drive_folder_require(actor,folder_key);
  select * into f from public.duuk_drive_folders where key=folder_key;
  if f.trashed_at is not null then raise exception 'Restaure esta pasta antes de enviar arquivos.' using errcode='PT409'; end if;
  return jsonb_build_object('folder_key',f.key,'drive_id',f.drive_id);

 elsif operation='prepare' then
  if request_id is null or action not in ('folder_create','folder_update','folder_move','folder_trash','folder_restore','document_update','document_move','document_trash','document_restore') then
   raise exception 'Confira a operação solicitada.' using errcode='PT400';
  end if;
  mode:=case when action like 'folder_%' then 'folder' else 'file' end;
  desired:=jsonb_build_object('action',action,'id',subject_id,'parent_id',parent_id,'name',requested_name,'description',requested_description,'revision',expected_revision);
  -- A conexão é o mesmo mutex usado pelo Cron. Nenhum worker pode transferir
  -- para uma pasta enquanto uma operação de organização está em andamento.
  select * into c from public.duuk_drive_connection where singleton=true for update;
  if c.singleton is null or c.status<>'connected' or c.credential_id is null then raise exception 'Conecte o Google Drive antes de organizar os arquivos.' using errcode='PT409'; end if;
  select * into change from duuk_private.drive_operations where id=request_id for update;
  if change.id is not null then
   if change.actor_id<>actor then raise exception 'Operação não disponível para esta conta.' using errcode='PT403'; end if;
   if change.desired<>desired or change.action<>action then raise exception 'Use uma nova operação para estes dados.' using errcode='PT409'; end if;
   if change.generation<>c.generation then raise exception 'A conexão mudou. Atualize a lista e tente novamente.' using errcode='PT409'; end if;
  end if;
  if action='folder_create' then
   folder_key:='custom:'||request_id;
   parent_id:=coalesce(parent_id,'root');
   perform duuk_private.drive_folder_require(actor,parent_id);
   select * into parent from public.duuk_drive_folders where key=parent_id;
   subject_id:=folder_key;
   if parent.trashed_at is not null then raise exception 'Restaure a pasta de destino antes de continuar.' using errcode='PT409'; end if;
   target:=jsonb_build_object('type','folder','id',folder_key,'drive_id',null,'name',requested_name,'description',requested_description,'parent_drive_id',parent.drive_id,'revision',0);
  elsif mode='folder' then
   perform duuk_private.drive_folder_require(actor,subject_id,true);
   select * into f from public.duuk_drive_folders where key=subject_id;
   select * into parent from public.duuk_drive_folders where key=f.parent_key;
   target:=jsonb_build_object('type','folder','id',f.key,'drive_id',f.drive_id,'name',f.name,'description',f.description,'parent_drive_id',parent.drive_id,'revision',f.revision);
   if change.status='complete' then return jsonb_build_object('completed',change.result); end if;
   if f.revision<>expected_revision then raise exception 'Esta pasta foi alterada. Atualize a lista antes de continuar.' using errcode='PT409'; end if;
   if f.key='root' and action in ('folder_move','folder_trash','folder_restore') then raise exception 'A pasta principal da DUUK precisa permanecer disponível.' using errcode='PT400'; end if;
   if action<>'folder_restore' and f.trashed_at is not null then raise exception 'Restaure a pasta antes de alterá-la.' using errcode='PT409'; end if;
   if action='folder_restore' and not f.directly_trashed then raise exception 'Esta pasta não está na lixeira individualmente.' using errcode='PT409'; end if;
  else
   select * into d from public.duuk_drive_documents where id=subject_id::uuid for update;
   if d.id is null then raise exception 'Arquivo não encontrado.' using errcode='PT404'; end if;
   if d.status<>'synced' then raise exception 'Aguarde a sincronização deste arquivo antes de organizá-lo.' using errcode='PT409'; end if;
   if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(d.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode='PT403'; end if;
   select * into parent from public.duuk_drive_folders where key=d.managed_folder_key or (d.managed_folder_key is null and drive_id=d.drive_folder_id);
   if parent.key is not null then perform duuk_private.drive_folder_require(actor,parent.key); end if;
   target:=jsonb_build_object('type','file','id',d.id,'drive_id',d.drive_file_id,'name',d.file_name,'description',d.drive_description,'parent_drive_id',parent.drive_id,'revision',d.drive_revision);
   if change.status='complete' then return jsonb_build_object('completed',change.result); end if;
   if d.drive_revision<>expected_revision then raise exception 'Este arquivo foi alterado. Atualize a lista antes de continuar.' using errcode='PT409'; end if;
   if action<>'document_restore' and d.drive_trashed_at is not null then raise exception 'Restaure o arquivo antes de alterá-lo.' using errcode='PT409'; end if;
   if action='document_restore' and not d.directly_trashed then raise exception 'Este arquivo não está na lixeira individualmente.' using errcode='PT409'; end if;
  end if;
  if change.status='complete' then return jsonb_build_object('completed',change.result); end if;
  if action in ('folder_create','folder_update','document_update') then
   if requested_name is null or char_length(requested_name)>(case when mode='folder' then 90 else 200 end)
    or char_length(requested_name)<1
    or requested_name ~ '[\\/:*?"<>|[:cntrl:]]' or char_length(requested_description)>2000 then raise exception 'Confira o nome e a descrição.' using errcode='PT400'; end if;
   if mode='file' then
    extension:=lower(substring(d.file_name from '\.[^.]+$'));
    if extension is not null and lower(substring(requested_name from '\.[^.]+$')) is distinct from extension then raise exception 'Mantenha a extensão original do arquivo.' using errcode='PT400'; end if;
   end if;
  end if;
  if action in ('folder_move','document_move') then
   if parent_id is null then raise exception 'Escolha a pasta de destino.' using errcode='PT400'; end if;
   perform duuk_private.drive_folder_require(actor,parent_id);
   select * into parent from public.duuk_drive_folders where key=parent_id;
   if parent.trashed_at is not null then raise exception 'Restaure a pasta de destino antes de continuar.' using errcode='PT409'; end if;
   if mode='folder' and exists(with recursive tree as (
    select x.key,0 as depth from public.duuk_drive_folders x where x.key=f.key
    union all select x.key,t.depth+1 from public.duuk_drive_folders x join tree t on x.parent_key=t.key where t.depth<64
   ) select 1 from tree where key=parent_id) then raise exception 'Uma pasta não pode ser movida para dentro dela mesma.' using errcode='PT400'; end if;
  end if;
  -- Limita a profundidade antes de gravar, mantendo completa a verificação dos
  -- descendentes e da lixeira. Nunca permite que o limite da recursão esconda itens.
  if action in ('folder_create','folder_move') then
   if (with recursive ancestry as (
    select x.key,x.parent_key,0 as depth from public.duuk_drive_folders x where x.key=parent.key
    union all select x.key,x.parent_key,a.depth+1 from public.duuk_drive_folders x join ancestry a on x.key=a.parent_key where a.depth<64
   ) select coalesce(max(depth),0) from ancestry)
    + (case when action='folder_create' then 1 else (with recursive tree as (
     select x.key,0 as depth from public.duuk_drive_folders x where x.key=f.key
     union all select x.key,t.depth+1 from public.duuk_drive_folders x join tree t on x.parent_key=t.key where t.depth<64
    ) select coalesce(max(depth),0)+1 from tree) end)>60 then raise exception 'Use uma estrutura com menos níveis de pastas.' using errcode='PT400'; end if;
  end if;
  if action in ('folder_restore','document_restore') and parent.trashed_at is not null then raise exception 'Restaure a pasta que contém este item primeiro.' using errcode='PT409'; end if;
  if mode='folder' and action in ('folder_create','folder_update','folder_move','folder_restore') then
   select exists(select 1 from public.duuk_drive_folders sibling where sibling.parent_key is not distinct from parent.key
    and sibling.key is distinct from f.key and sibling.trashed_at is null and lower(sibling.name)=lower(coalesce(requested_name,f.name))) into duplicate;
   if duplicate then raise exception 'Já existe uma pasta com este nome no destino.' using errcode='PT409'; end if;
  end if;
  if action='folder_create' and exists(select 1 from duuk_private.drive_operations other where other.action='folder_create'
   and other.id<>request_id and other.status<>'complete' and other.generation=c.generation
   and coalesce(other.desired->>'parent_id','root')=parent_id and lower(other.desired->>'name')=lower(requested_name)) then
   raise exception 'Há uma criação pendente desta pasta. Retome a operação anterior na biblioteca.' using errcode='PT409';
  end if;
  if exists(select 1 from duuk_private.drive_operations other where other.item_type=mode and other.item_id=subject_id
   and other.id<>request_id and other.status<>'complete' and other.generation=c.generation) then
   raise exception 'Há uma alteração pendente para este item. Tente novamente a operação anterior.' using errcode='PT409';
  end if;
  if mode='folder' and action<>'folder_create' and exists(with recursive tree as (
   select x.key,x.drive_id,0 as depth from public.duuk_drive_folders x where x.key=subject_id
   union all select x.key,x.drive_id,t.depth+1 from public.duuk_drive_folders x join tree t on x.parent_key=t.key where t.depth<64
  ) select 1 from duuk_private.drive_operations other where other.id<>request_id and other.status<>'complete' and other.generation=c.generation
    and ((other.item_type='folder' and other.item_id in (select key from tree))
     or (other.action='folder_create' and coalesce(other.desired->>'parent_id','root') in(select key from tree))
     or (other.item_type='file' and exists(select 1 from public.duuk_drive_documents doc join tree t on doc.drive_folder_id=t.drive_id or doc.managed_folder_key=t.key where doc.id::text=other.item_id)))) then
   raise exception 'Conclua a alteração pendente em um item desta pasta primeiro.' using errcode='PT409';
  end if;
  if parent.key is not null and exists(select 1 from duuk_private.drive_operations other where other.id<>request_id and other.status<>'complete'
   and other.generation=c.generation and other.item_type='folder' and other.item_id=parent.key) then
   raise exception 'Conclua a alteração pendente na pasta de destino primeiro.' using errcode='PT409';
  end if;
  if (mode='folder' and action<>'folder_create' and duuk_private.drive_folder_pending(f.key,request_id))
   or duuk_private.drive_folder_pending(parent.key,request_id)
   or (mode='file' and duuk_private.drive_folder_pending(duuk_private.drive_document_folder_key(d),request_id)) then
   raise exception 'Conclua a alteração pendente em uma pasta acima deste item primeiro.' using errcode='PT409';
  end if;
  if c.lease_until>now() then raise exception 'O Google Drive está sincronizando. Tente novamente em alguns instantes.' using errcode='PT409'; end if;
  if change.id is null then
   insert into duuk_private.drive_operations(id,actor_id,generation,action,item_type,item_id,desired,before_value)
   values(request_id,actor,c.generation,action,mode,subject_id,desired,target) returning * into change;
  else
   update duuk_private.drive_operations set status='pending',last_error=null,updated_at=now() where id=change.id;
  end if;
  lease:=gen_random_uuid();
  update public.duuk_drive_connection set lease_id=lease,lease_until=now()+interval '5 minutes' where singleton=true;
  select decrypted_secret::jsonb into results from vault.decrypted_secrets where id=c.credential_id;
  return jsonb_build_object('generation',c.generation,'lease_id',lease,'tokens',results,'change_id',change.id,'action',action,
   'target',target,'parent',case when parent.key is null then null else jsonb_build_object('id',parent.key,'drive_id',parent.drive_id) end,
   'folder_key',folder_key,'desired',desired);

 elsif operation in ('check','commit','abort') then
  -- Uma confirmação repetida depois da liberação do lease continua idempotente.
  if operation='commit' then
   select * into change from duuk_private.drive_operations where id=(payload->>'change_id')::uuid and status='complete';
   if change.id is not null and exists(select 1 from public.duuk_drive_connection where singleton=true and generation=(payload->>'generation')::uuid and generation=change.generation)
    and duuk_private.member_permission(change.actor_id,'drive') then return change.result; end if;
  end if;
  select * into c from public.duuk_drive_connection where singleton=true and generation=(payload->>'generation')::uuid
   and lease_id=(payload->>'lease_id')::uuid and lease_until>now() and status='connected' for update;
  if c.singleton is null then raise exception 'A conexão mudou. Operação interrompida.' using errcode='PT409'; end if;
  select * into change from duuk_private.drive_operations where id=(payload->>'change_id')::uuid for update;
  if change.id is null or change.generation<>c.generation then raise exception 'Operação não encontrada.' using errcode='PT409'; end if;
  if change.status='complete' then
   if operation='commit' then return change.result; end if;
   raise exception 'A operação já foi concluída.' using errcode='PT409';
  end if;
  if operation='abort' then
   update duuk_private.drive_operations set status='error',last_error=left(coalesce(payload->>'error','Não foi possível concluir a alteração no Google Drive.'),300),updated_at=now() where id=change.id;
   update public.duuk_drive_connection set lease_id=null,lease_until=null where singleton=true;
   return '{}'::jsonb;
  end if;
  if not duuk_private.member_permission(change.actor_id,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
  action:=change.action;
  mode:=change.item_type;
  subject_id:=change.item_id;
  desired:=change.desired;
  if action='folder_create' then
   parent_id:=coalesce(desired->>'parent_id','root');
   perform duuk_private.drive_folder_require(change.actor_id,parent_id);
  elsif mode='folder' then
   perform duuk_private.drive_folder_require(change.actor_id,subject_id,true);
   select * into f from public.duuk_drive_folders where key=subject_id;
   if f.revision<>(change.before_value->>'revision')::integer then raise exception 'A pasta mudou. Atualize e tente novamente.' using errcode='PT409'; end if;
  else
   select * into d from public.duuk_drive_documents where id=subject_id::uuid for update;
   if d.id is null or not duuk_private.member_permission(change.actor_id,duuk_private.drive_document_permission(d.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode='PT403'; end if;
   if d.drive_revision<>(change.before_value->>'revision')::integer then raise exception 'O arquivo mudou. Atualize e tente novamente.' using errcode='PT409'; end if;
  end if;
  if action in ('folder_create','folder_move','document_move') then
   parent_id:=coalesce(desired->>'parent_id','root');
   perform duuk_private.drive_folder_require(change.actor_id,parent_id);
   if duuk_private.drive_folder_trashed(parent_id) then raise exception 'A pasta de destino está na lixeira.' using errcode='PT409'; end if;
  end if;
  update public.duuk_drive_connection set lease_until=now()+interval '5 minutes' where singleton=true;
  if operation='check' then return '{}'::jsonb; end if;
  results:=payload->'result';
  if results is null or jsonb_typeof(results)<>'object' then raise exception 'A confirmação do Google Drive está incompleta.' using errcode='PT400'; end if;
  if action in ('folder_create','folder_update','document_update') and
   (results->>'name' is distinct from desired->>'name' or coalesce(results->>'description','') is distinct from coalesce(desired->>'description','')) then
   raise exception 'O Google não confirmou o nome e a descrição solicitados.' using errcode='PT409';
  end if;
  if action='folder_create' then
   if coalesce(results->>'drive_id','') !~ '^[a-zA-Z0-9_-]{1,200}$' then raise exception 'A confirmação da pasta está incompleta.' using errcode='PT400'; end if;
   select * into parent from public.duuk_drive_folders where key=parent_id;
   if results->>'parent_drive_id' is distinct from parent.drive_id then raise exception 'A pasta foi criada em outro local. Atualize e tente novamente.' using errcode='PT409'; end if;
   insert into public.duuk_drive_folders(key,drive_id,name,parent_key,description,created_by,required_permissions)
   values(subject_id,results->>'drive_id',desired->>'name',parent.key,coalesce(desired->>'description',''),change.actor_id,duuk_private.drive_folder_permissions(parent.key));
  elsif mode='folder' then
   select * into f from public.duuk_drive_folders where key=subject_id for update;
   if f.revision<>(change.before_value->>'revision')::integer or results->>'drive_id' is distinct from f.drive_id then raise exception 'Esta pasta mudou. Atualize e tente novamente.' using errcode='PT409'; end if;
   if action='folder_update' then
    update public.duuk_drive_folders set name=desired->>'name',description=coalesce(desired->>'description',''),revision=revision+1,updated_at=now() where key=subject_id;
   elsif action='folder_move' then
    select * into parent from public.duuk_drive_folders where key=desired->>'parent_id';
    if results->>'parent_drive_id' is distinct from parent.drive_id then raise exception 'O Google não confirmou a pasta de destino.' using errcode='PT409'; end if;
    update public.duuk_drive_folders set parent_key=parent.key,revision=revision+1,updated_at=now(),required_permissions=(select array_agg(distinct p order by p) from unnest(f.required_permissions||duuk_private.drive_folder_permissions(parent.key)) p) where key=subject_id;
   else
    update public.duuk_drive_folders set directly_trashed=(action='folder_trash'),revision=revision+1,updated_at=now() where key=subject_id;
   end if;
  else
   if d.drive_revision<>(change.before_value->>'revision')::integer or results->>'drive_id' is distinct from d.drive_file_id then raise exception 'Este arquivo mudou. Atualize e tente novamente.' using errcode='PT409'; end if;
   if action='document_update' then
    update public.duuk_drive_documents set file_name=desired->>'name',drive_description=coalesce(desired->>'description',''),drive_revision=drive_revision+1 where id=d.id;
   elsif action='document_move' then
    select * into parent from public.duuk_drive_folders where key=desired->>'parent_id';
    if results->>'parent_drive_id' is distinct from parent.drive_id then raise exception 'O Google não confirmou a pasta de destino.' using errcode='PT409'; end if;
    update public.duuk_drive_documents set managed_folder_key=parent.key,drive_folder_id=case when drive_file_id is not null then parent.drive_id else drive_folder_id end,drive_revision=drive_revision+1 where id=d.id;
   else
    update public.duuk_drive_documents set directly_trashed=(action='document_trash'),drive_revision=drive_revision+1 where id=d.id;
   end if;
  end if;
  perform duuk_private.drive_refresh_trash();
  select name into profile_name from public.duuk_profiles where id=change.actor_id;
  insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary) values(change.actor_id,coalesce(profile_name,''),'drive.'||action,'google_drive',subject_id,
   case when action='folder_create' then 'Pasta criada no Google Drive.' when action like '%_update' then 'Nome e descrição atualizados no Google Drive.'
    when action like '%_move' then 'Item organizado em outra pasta do Google Drive.' when action like '%_trash' then 'Cópia do Google Drive movida para a lixeira.' else 'Item restaurado da lixeira do Google Drive.' end);
  results:=jsonb_build_object('id',subject_id,'type',mode,'action',action,'completed',true,'saved',true,'revision',case when mode='folder' then (select x.revision from public.duuk_drive_folders x where x.key=subject_id) else (select x.drive_revision from public.duuk_drive_documents x where x.id=subject_id::uuid) end);
  update duuk_private.drive_operations set status='complete',result=results,last_error=null,updated_at=now() where id=change.id;
  update public.duuk_drive_connection set last_synced_at=now(),last_error=null,lease_id=null,lease_until=null where singleton=true;
  return results;
 else raise exception 'Operação inválida.' using errcode='PT400';
 end if;
end $$;

create function public.duuk_drive_manage_backend(operation text,payload jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.drive_manage_backend(operation,payload); $$;
revoke all on function duuk_private.drive_manage_backend(text,jsonb),public.duuk_drive_manage_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.drive_manage_backend(text,jsonb),public.duuk_drive_manage_backend(text,jsonb) to service_role;

-- Atualiza apenas a fila existente para respeitar a organização e a lixeira.
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
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'drive_trashed_at',d.drive_trashed_at,'trashed',d.drive_trashed_at is not null,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.kind) from public.duuk_drive_documents d where d.contract_id = (payload->>'contract_id')::uuid),'[]'::jsonb);
  elsif payload->>'client_id' is not null then
   if not duuk_private.member_permission(actor,'crm.clients') then raise exception 'Sem acesso aos clientes.' using errcode = 'PT403'; end if;
   document_kind := coalesce(payload->>'kind','proposal');
   if document_kind not in ('proposal','document') then raise exception 'Tipo de documento inválido.' using errcode='PT400'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'file_name',d.file_name,'status',d.status,'attempts',d.attempts,'last_error',d.last_error,'synced_at',d.synced_at,'drive_trashed_at',d.drive_trashed_at,'trashed',d.drive_trashed_at is not null,'created_at',d.created_at,'can_open',d.drive_link is not null and c.status = 'connected','drive_link',case when c.status = 'connected' then d.drive_link end) order by d.created_at desc) from public.duuk_drive_documents d where d.client_id = (payload->>'client_id')::uuid and d.kind = document_kind),'[]'::jsonb);
  end if;
  raise exception 'Informe o contrato ou o cliente.' using errcode = 'PT400';

 elsif operation = 'file' then
  select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid;
  if doc.id is null then raise exception 'Documento não encontrado.' using errcode = 'PT404'; end if;
  if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode = 'PT403'; end if;
  if doc.kind='file' and not duuk_private.drive_folder_can_access(actor,duuk_private.drive_document_folder_key(doc)) then raise exception 'Você não tem acesso à pasta deste arquivo.' using errcode='PT403'; end if;
  return jsonb_build_object('file_name',doc.file_name,'source_path',doc.source_path,'source_bucket',doc.source_bucket,'mime_type',doc.mime_type);

 elsif operation = 'retry' then
  if payload->>'document_id' is not null then
   select * into doc from public.duuk_drive_documents where id = (payload->>'document_id')::uuid for update;
   if doc.id is null then raise exception 'Documento não encontrado.' using errcode = 'PT404'; end if;
   if not duuk_private.member_permission(actor,duuk_private.drive_document_permission(doc.kind)) then raise exception 'Você não tem acesso a este documento.' using errcode = 'PT403'; end if;
  if doc.kind='file' and not duuk_private.drive_folder_can_access(actor,duuk_private.drive_document_folder_key(doc)) then raise exception 'Você não tem acesso à pasta deste arquivo.' using errcode='PT403'; end if;
   if duuk_private.drive_document_blocked(doc) then raise exception 'Conclua as alterações pendentes ou restaure este item na biblioteca do Google Drive antes de sincronizar.' using errcode='PT409'; end if;
   if doc.status = 'synced' then raise exception 'Este documento já está salvo no Google Drive.' using errcode = 'PT409'; end if;
   update public.duuk_drive_documents set attempts = 0, next_attempt_at = now(), status = 'pending', last_error = null where id = doc.id;
   return jsonb_build_object('queued',1);
  end if;
  perform duuk_private.drive_require_super(actor);
  update public.duuk_drive_documents set attempts = 0, next_attempt_at = now(), status = 'pending', last_error = null where status <> 'synced' and not duuk_private.drive_document_blocked(duuk_drive_documents);
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
   where d.drive_trashed_at is null and duuk_private.member_permission(actor,duuk_private.drive_document_permission(d.kind))
    and (d.kind<>'file' or duuk_private.drive_folder_can_access(actor,duuk_private.drive_document_folder_key(d)))
    and (nullif(payload->>'kind','') is null or d.kind=payload->>'kind')
    and (nullif(payload->>'search','') is null or position(lower(left(payload->>'search',120)) in lower(d.file_name || ' ' || d.client_name || ' ' || d.title))>0)
   order by d.created_at desc,d.id limit 51 offset least(greatest(coalesce((payload->>'offset')::integer,0),0),100000)
  ) items;
  return jsonb_build_object('documents',result,'connected',c.status='connected','account_email',c.account_email);

 elsif operation = 'add_file' then
  if not duuk_private.member_permission(actor,'drive') then raise exception 'Sem acesso ao Google Drive.' using errcode='PT403'; end if;
  if nullif(payload->>'managed_folder_key','') is not null then
   perform duuk_private.drive_folder_require(actor,payload->>'managed_folder_key');
   if duuk_private.drive_folder_trashed(payload->>'managed_folder_key') or duuk_private.drive_folder_pending(payload->>'managed_folder_key') then raise exception 'Restaure a pasta de destino antes de enviar arquivos.' using errcode='PT409'; end if;
  end if;
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
  insert into public.duuk_drive_documents(kind,client_id,client_key,client_name,title,file_name,source_bucket,source_path,source_sha256,mime_type,byte_size,created_by,managed_folder_key)
  values('file',library_client_id,base,label,left(coalesce(payload->>'title',''),160),duuk_private.drive_safe_name(payload->>'file_name','Arquivo'),'duuk-drive-files',payload->>'source_path',payload->>'sha256',payload->>'mime_type',(payload->>'byte_size')::bigint,actor,nullif(payload->>'managed_folder_key','')) returning * into doc;
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
    and (exists(select 1 from public.duuk_drive_documents d where d.status <> 'synced' and not duuk_private.drive_document_blocked(d) and d.attempts < 8 and d.next_attempt_at <= now() and d.source_path is not null)
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
    select id,kind,contract_id,client_key,client_name,file_name,source_path,source_sha256,source_bucket,mime_type,managed_folder_key,drive_description,drive_trashed_at
    from public.duuk_drive_documents
    where status <> 'synced' and not duuk_private.drive_document_blocked(duuk_drive_documents) and source_path is not null and ((payload->>'document_id' is not null and id = (payload->>'document_id')::uuid) or (payload->>'document_id' is null and attempts < 8 and next_attempt_at <= now()))
    order by kind desc, created_at limit least(coalesce((payload->>'limit')::integer,4),10)) j),'[]'::jsonb);
  elsif operation = 'check' then
   if not exists(select 1 from public.duuk_drive_documents where id=(payload->>'document_id')::uuid and status<>'synced'
    and not duuk_private.drive_document_blocked(duuk_drive_documents)
    and source_path is not distinct from payload->>'expected_source_path' and source_sha256 is not distinct from payload->>'expected_source_sha256') then
    raise exception 'O documento mudou. A sincronização será retomada.' using errcode='PT409';
   end if;
  elsif operation = 'tokens' then
   perform vault.update_secret(c.credential_id,(payload->'tokens')::text);
  elsif operation = 'folder_get' then
   return (select to_jsonb(f) from public.duuk_drive_folders f where f.key = payload->>'key');
  elsif operation = 'folder_save' then
   insert into public.duuk_drive_folders(key,drive_id,name,parent_key,client_key) values(payload->>'key',payload->>'drive_id',payload->>'name',nullif(payload->>'parent_key',''),nullif(payload->>'client_key',''))
   on conflict(key) do update set drive_id = excluded.drive_id;
  elsif operation = 'folder_forget' then
   if exists(select 1 from public.duuk_drive_folders where key=payload->>'key') then raise exception 'A pasta mudou no Google Drive. Restaure-a no Google antes de sincronizar novamente.' using errcode='PT409'; end if;
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
   if duuk_private.drive_document_blocked(doc) then raise exception 'O documento está na lixeira ou aguarda uma alteração de pasta.' using errcode='PT409'; end if;
   if doc.managed_folder_key is not null and duuk_private.drive_folder_trashed(doc.managed_folder_key) then raise exception 'A pasta está na lixeira.' using errcode='PT409'; end if;
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

grant select(drive_trashed_at) on public.duuk_drive_documents to authenticated;

-- A metadata dos arquivos gerais também respeita a pasta em consultas diretas.
create function duuk_private.drive_library_file_visible(document_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.duuk_drive_documents d where d.id=document_id and d.kind='file'
  and duuk_private.drive_folder_can_access((select auth.uid()),duuk_private.drive_document_folder_key(d)));
$$;
revoke all on function duuk_private.drive_library_file_visible(uuid) from public,anon;
grant execute on function duuk_private.drive_library_file_visible(uuid) to authenticated,service_role;
drop policy drive_documents_read on public.duuk_drive_documents;
create policy drive_documents_read on public.duuk_drive_documents for select to authenticated using (
 (kind in ('contract_original','contract_signed') and (select duuk_private.has_permission('contracts')))
 or (kind in ('proposal','document') and (select duuk_private.has_permission('crm.clients')))
 or (kind='file' and duuk_private.drive_library_file_visible(id))
);
