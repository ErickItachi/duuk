-- DUUK AI: private conversations, explicit project sharing and metered generation.
-- Standalone migration follows this repository's deployment workflow. The local
-- Supabase CLI cannot run on the development Mac (libicucore _unumrf_close).
insert into public.duuk_permission_keys(key,label) values('ai','DUUK AI') on conflict(key) do nothing;
insert into public.duuk_role_permissions(role_id,permission,allowed)
 select id,'ai',true from public.duuk_roles on conflict(role_id,permission) do nothing;

create table duuk_private.ai_settings (
 singleton boolean primary key default true check(singleton),
 credential_id uuid references vault.secrets(id) on delete set null,
 free_tier_confirmed boolean not null default false,
 fast_model text not null default 'gemini-3.5-flash-lite',
 creative_model text not null default 'gemini-3.5-flash',
 requests_per_minute integer not null default 5 check(requests_per_minute between 1 and 60),
 requests_per_day integer not null default 40 check(requests_per_day between 1 and 500),
 tokens_per_day integer not null default 100000 check(tokens_per_day between 1000 and 1000000),
 configured_by uuid references public.duuk_profiles on delete set null,
 configured_at timestamptz,
 check(fast_model in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite')),
 check(creative_model in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite'))
);
insert into duuk_private.ai_settings(singleton) values(true);
alter table duuk_private.ai_settings enable row level security;
revoke all on duuk_private.ai_settings from public,anon,authenticated;
grant all on duuk_private.ai_settings to service_role;

create table public.duuk_ai_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.duuk_profiles on delete cascade,
 title text not null default 'Nova conversa' check(char_length(trim(title)) between 1 and 160),
 mode text not null default 'free' check(mode in ('free','script','concept','commercial','help')),
 project_id text check(char_length(project_id) between 1 and 160),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index duuk_ai_conversations_owner on public.duuk_ai_conversations(user_id,updated_at desc);
create table public.duuk_ai_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.duuk_ai_conversations on delete cascade,
 position bigint generated always as identity,
 role text not null check(role in ('user','assistant')),
 content text not null check(char_length(content) between 1 and 64000),
 model text,prompt_version text,
 status text not null default 'complete' check(status in ('complete','partial')),
 superseded_at timestamptz,created_at timestamptz not null default now()
);
create index duuk_ai_messages_conversation on public.duuk_ai_messages(conversation_id,position) where superseded_at is null;
create table public.duuk_ai_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.duuk_profiles on delete cascade,
 conversation_id uuid references public.duuk_ai_conversations on delete set null,
 project_id text check(char_length(project_id) between 1 and 160),
 shared boolean not null default false,
 document_type text not null check(document_type in ('script','concept','proposal','briefing','other')),
 title text not null check(char_length(trim(title)) between 1 and 160),
 content text not null check(char_length(trim(content)) between 1 and 64000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(not shared or project_id is not null)
);
create index duuk_ai_documents_owner on public.duuk_ai_documents(user_id,updated_at desc);
create index duuk_ai_documents_project on public.duuk_ai_documents(project_id) where shared;
create index duuk_ai_documents_conversation on public.duuk_ai_documents(conversation_id);
create table public.duuk_ai_document_versions (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.duuk_ai_documents on delete cascade,
 version integer not null check(version>0),
 title text not null,content text not null,document_type text not null,
 created_at timestamptz not null default now(),unique(document_id,version)
);
create table public.duuk_ai_requests (
 id uuid primary key,
 user_id uuid not null references public.duuk_profiles on delete cascade,
 conversation_id uuid references public.duuk_ai_conversations on delete set null,
 user_message_id uuid references public.duuk_ai_messages on delete set null,
 assistant_message_id uuid references public.duuk_ai_messages on delete set null,
 payload_hash text not null,
 status text not null default 'pending' check(status in ('pending','complete','partial','failed')),
 lease_id uuid not null default gen_random_uuid(),lease_until timestamptz not null default now()+interval '5 minutes',
 error_code text check(char_length(error_code)<=100),
 created_at timestamptz not null default now(),finished_at timestamptz,
 unique(user_id,id)
);
create index duuk_ai_requests_user_time on public.duuk_ai_requests(user_id,created_at desc);
create index duuk_ai_requests_conversation on public.duuk_ai_requests(conversation_id) where status='pending';
create table public.duuk_ai_usage (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.duuk_ai_requests on delete cascade,
 lease_id uuid not null,
 reserved_tokens integer not null check(reserved_tokens between 1 and 100000),
 usage_known boolean not null default false,
 user_id uuid not null references public.duuk_profiles on delete cascade,
 model text not null,
 tokens_input integer not null default 0 check(tokens_input between 0 and 1000000),
 tokens_output integer not null default 0 check(tokens_output between 0 and 1000000),
 created_at timestamptz not null default now(),unique(request_id,lease_id)
);
create index duuk_ai_usage_user_time on public.duuk_ai_usage(user_id,created_at desc);

create function duuk_private.ai_project_exists(target text) returns boolean
 language sql stable security definer set search_path='' as $$
 select target is not null and exists(select 1 from public.duuk_content c,
 jsonb_array_elements(c.content->'projects') p where c.key='draft' and p->>'id'=target);
$$;
create function duuk_private.ai_document_readable(target uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select duuk_private.has_permission('ai') and exists(select 1 from public.duuk_ai_documents d
 where d.id=target and (d.user_id=(select auth.uid()) or (d.shared and
 duuk_private.has_permission('site') and duuk_private.ai_project_exists(d.project_id))));
$$;
revoke all on function duuk_private.ai_project_exists(text),duuk_private.ai_document_readable(uuid) from public,anon,authenticated;
grant execute on function duuk_private.ai_project_exists(text) to service_role;
grant execute on function duuk_private.ai_document_readable(uuid) to authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['duuk_ai_conversations','duuk_ai_messages','duuk_ai_documents','duuk_ai_document_versions','duuk_ai_requests','duuk_ai_usage'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.duuk_ai_conversations,public.duuk_ai_messages,public.duuk_ai_documents,public.duuk_ai_document_versions,public.duuk_ai_usage to authenticated;
create policy ai_conversations_owner on public.duuk_ai_conversations for select to authenticated
 using(user_id=(select auth.uid()) and (select duuk_private.has_permission('ai')));
create policy ai_messages_owner on public.duuk_ai_messages for select to authenticated
 using((select duuk_private.has_permission('ai')) and exists(select 1 from public.duuk_ai_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
create policy ai_documents_read on public.duuk_ai_documents for select to authenticated using(duuk_private.ai_document_readable(id));
create policy ai_document_versions_read on public.duuk_ai_document_versions for select to authenticated using(duuk_private.ai_document_readable(document_id));
create policy ai_usage_owner on public.duuk_ai_usage for select to authenticated using(user_id=(select auth.uid()) and (select duuk_private.has_permission('ai')));

create or replace function duuk_private.ai_backend(operation text,payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=nullif(payload->>'user_id','')::uuid;
 c public.duuk_ai_conversations; m public.duuk_ai_messages; d public.duuk_ai_documents;
 req public.duuk_ai_requests; cfg duuk_private.ai_settings;
 target uuid; rid uuid; body text; selected_mode text; fingerprint text;
 result jsonb; history jsonb; item jsonb; n integer; total integer:=0;
 minute_count integer; day_count integer; day_tokens bigint; day_start timestamptz; reserve integer; permissions jsonb;
 shared_value boolean; project text; doc_type text; content_value text; title_value text;
begin
 select * into cfg from duuk_private.ai_settings where singleton=true;
 -- Only the service-only RPC exposes a Vault secret, exclusively to Edge code.
 if operation='configuration' then
  return jsonb_build_object('api_key',(select decrypted_secret from vault.decrypted_secrets where id=cfg.credential_id),
   'free_tier_confirmed',cfg.free_tier_confirmed,'fast_model',cfg.fast_model,'creative_model',cfg.creative_model,
   'requests_per_minute',cfg.requests_per_minute,'requests_per_day',cfg.requests_per_day,'tokens_per_day',cfg.tokens_per_day);
 end if;
 if actor is null or not duuk_private.member_permission(actor,'ai') then
  raise exception 'Você não tem acesso ao DUUK AI.' using errcode='PT403';
 end if;
 if operation='configure' then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Apenas um super administrador pode conectar o Gemini.' using errcode='PT403';end if;
  if coalesce((payload->>'free_tier_confirmed')::boolean,false) is not true then raise exception 'Confirme que o projeto utiliza a modalidade gratuita, sem cobrança.' using errcode='PT400';end if;
  if coalesce(payload->>'fast_model','') not in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite') or coalesce(payload->>'creative_model','') not in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite') then raise exception 'Modelo não permitido na configuração gratuita.' using errcode='PT400';end if;
  if nullif(payload->>'api_key','') is not null then
   if char_length(payload->>'api_key') not between 20 and 300 then raise exception 'Chave Gemini inválida.' using errcode='PT400';end if;
   if cfg.credential_id is null then cfg.credential_id:=vault.create_secret(payload->>'api_key');
   else perform vault.update_secret(cfg.credential_id,payload->>'api_key');end if;
  elsif cfg.credential_id is null then raise exception 'Informe a chave da API Gemini.' using errcode='PT400';end if;
  update duuk_private.ai_settings set credential_id=cfg.credential_id,free_tier_confirmed=true,
   fast_model=payload->>'fast_model',creative_model=payload->>'creative_model',configured_by=actor,configured_at=now()
   where singleton=true;
  return jsonb_build_object('saved',true);
 end if;
 day_start:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 if operation='status' then
  select count(*) filter(where created_at>=now()-interval '1 minute'),count(*) filter(where created_at>=day_start)
   into minute_count,day_count from public.duuk_ai_usage where user_id=actor and created_at>=least(day_start,now()-interval '1 minute');
  select coalesce(sum(case when usage_known then tokens_input::bigint+tokens_output else reserved_tokens end),0) into day_tokens from public.duuk_ai_usage where user_id=actor and created_at>=day_start;
  return jsonb_build_object('configured',cfg.credential_id is not null,'free_tier_confirmed',cfg.free_tier_confirmed,
   'fast_model',cfg.fast_model,'creative_model',cfg.creative_model,
   'limits',jsonb_build_object('requests_per_minute',cfg.requests_per_minute,'requests_per_day',cfg.requests_per_day,'tokens_per_day',cfg.tokens_per_day),
   'usage',jsonb_build_object('requests_minute',minute_count,'requests_today',day_count,'tokens_today',day_tokens));
 elsif operation='permissions' then
  select coalesce(jsonb_object_agg(k.key,duuk_private.member_permission(actor,k.key)),'{}') into result from public.duuk_permission_keys k;
  return result;
 elsif operation='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from
   (select id,title,mode,project_id,created_at,updated_at from public.duuk_ai_conversations where user_id=actor
    order by updated_at desc limit 50 offset least(greatest(coalesce((payload->>'offset')::integer,0),0),5000)) x;
  return jsonb_build_object('conversations',result);
 elsif operation='projects' then
  if not duuk_private.member_permission(actor,'site') then raise exception 'Você não tem acesso aos projetos.' using errcode='PT403';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',project_item->>'id','title',project_item->>'title') order by project_item->>'title'),'[]') into result
   from public.duuk_content source_content,jsonb_array_elements(source_content.content->'projects') project_item where source_content.key='draft';
  return jsonb_build_object('projects',result);
 elsif operation in ('conversation','rename','delete') then
  target:=nullif(coalesce(payload->>'conversation_id',payload->>'id'),'')::uuid;
  select * into c from public.duuk_ai_conversations where id=target and user_id=actor for update;
  if c.id is null then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
  if operation='conversation' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]') into result from
    (select id,role,content,model,status,position,created_at from public.duuk_ai_messages
     where conversation_id=c.id and superseded_at is null order by position desc limit 200) x;
   return jsonb_build_object('conversation',to_jsonb(c),'messages',result,
    'generating',exists(select 1 from public.duuk_ai_requests where conversation_id=c.id and status='pending' and lease_until>now()));
  end if;
  if exists(select 1 from public.duuk_ai_requests where conversation_id=c.id and status='pending' and lease_until>now()) then raise exception 'Interrompa ou aguarde a resposta antes de alterar esta conversa.' using errcode='PT409';end if;
  if operation='rename' then
   title_value:=trim(payload->>'title');
   if title_value is null or char_length(title_value) not between 1 and 160 then raise exception 'Informe um título de até 160 caracteres.' using errcode='PT400';end if;
   update public.duuk_ai_conversations set title=title_value,updated_at=now() where id=c.id returning * into c;
   return jsonb_build_object('conversation',to_jsonb(c),'saved',true);
  end if;
  delete from public.duuk_ai_conversations where id=c.id;
  return jsonb_build_object('deleted',true);
 elsif operation in ('documents','document','versions','save_document') then
  if operation='documents' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from
    (select id,user_id,conversation_id,project_id,shared,document_type,title,version,created_at,updated_at
     from public.duuk_ai_documents where user_id=actor or (shared and duuk_private.member_permission(actor,'site') and duuk_private.ai_project_exists(project_id))
     order by updated_at desc limit 100 offset least(greatest(coalesce((payload->>'offset')::integer,0),0),5000)) x;
   return jsonb_build_object('documents',result);
  end if;
  target:=nullif(coalesce(payload->>'document_id',payload->>'id'),'')::uuid;
  if target is not null then
   select * into d from public.duuk_ai_documents where id=target and (user_id=actor or
    (shared and duuk_private.member_permission(actor,'site') and duuk_private.ai_project_exists(project_id))) for update;
   if d.id is null then raise exception 'Documento não encontrado.' using errcode='PT404';end if;
  elsif operation<>'save_document' then raise exception 'Documento não encontrado.' using errcode='PT404';end if;
  if operation='document' then return jsonb_build_object('document',to_jsonb(d),'can_edit',d.user_id=actor);
  elsif operation='versions' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]') into result from
    (select id,version,title,content,document_type,created_at from public.duuk_ai_document_versions where document_id=d.id order by version desc limit 100) x;
   return jsonb_build_object('versions',result);
  end if;
  if d.id is not null and d.user_id<>actor then raise exception 'Somente quem criou o documento pode editá-lo.' using errcode='PT403';end if;
  if d.id is not null and d.version is distinct from (payload->>'expected_version')::integer then raise exception 'O documento mudou. Atualize antes de salvar.' using errcode='PT409';end if;
  title_value:=trim(payload->>'title');content_value:=trim(payload->>'content');doc_type:=coalesce(payload->>'document_type',d.document_type,'other');
  project:=nullif(payload->>'project_id','');shared_value:=coalesce((payload->>'shared')::boolean,false);
  if title_value is null or char_length(title_value) not between 1 and 160 or content_value is null or char_length(content_value) not between 1 and 64000 or doc_type not in ('script','concept','proposal','briefing','other') then raise exception 'Confira título, conteúdo e tipo do documento.' using errcode='PT400';end if;
  if project is not null and (not duuk_private.member_permission(actor,'site') or not duuk_private.ai_project_exists(project)) then raise exception 'Projeto indisponível para esta conta.' using errcode='PT403';end if;
  if shared_value and project is null then raise exception 'Vincule um projeto para compartilhar o documento.' using errcode='PT400';end if;
  if d.id is null then
   target:=nullif(payload->>'conversation_id','')::uuid;
   if target is not null and not exists(select 1 from public.duuk_ai_conversations where id=target and user_id=actor) then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
   insert into public.duuk_ai_documents(user_id,conversation_id,project_id,shared,document_type,title,content)
    values(actor,target,project,shared_value,doc_type,title_value,content_value) returning * into d;
  else
   if d.version>=100 then raise exception 'Este documento atingiu o limite de 100 versões. Salve uma nova cópia.' using errcode='PT400';end if;
   update public.duuk_ai_documents set title=title_value,content=content_value,document_type=doc_type,project_id=project,shared=shared_value,version=version+1,updated_at=now() where id=d.id returning * into d;
  end if;
  insert into public.duuk_ai_document_versions(document_id,version,title,content,document_type) values(d.id,d.version,d.title,d.content,d.document_type);
  return jsonb_build_object('saved',true,'document',to_jsonb(d),'can_edit',true);
 elsif operation='begin_generation' then
  -- Serialize by member so limits cannot be bypassed using different conversations.
  perform pg_advisory_xact_lock(hashtextextended('duuk-ai:'||actor::text,0));
  rid:=nullif(payload->>'request_id','')::uuid;
  if rid is null then raise exception 'Solicitação inválida.' using errcode='PT400';end if;
  fingerprint:=encode(extensions.digest((payload-'user_id')::text,'sha256'),'hex');
  select * into req from public.duuk_ai_requests where id=rid for update;
  if req.id is not null then
   if req.user_id<>actor or req.payload_hash<>fingerprint then raise exception 'Esta identificação já pertence a outra solicitação.' using errcode='PT409';end if;
   if req.conversation_id is null then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
   if req.status in ('complete','partial') then
    select * into m from public.duuk_ai_messages where id=req.assistant_message_id;
    return jsonb_build_object('completed',jsonb_build_object('conversation_id',req.conversation_id,'request_id',req.id,'message',to_jsonb(m)));
   elsif req.status='pending' and req.lease_until>now() then raise exception 'Esta resposta já está sendo gerada. Aguarde um momento.' using errcode='PT409';end if;
   select * into c from public.duuk_ai_conversations where id=req.conversation_id and user_id=actor for update;
   if c.id is null then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
  else
   body:=trim(payload->>'message');selected_mode:=coalesce(payload->>'mode','free');
   if (not coalesce((payload->>'regenerate')::boolean,false) and (body is null or char_length(body) not between 1 and 32000)) or selected_mode not in ('free','script','concept','commercial','help') then raise exception 'Confira a mensagem e o modo selecionado.' using errcode='PT400';end if;
   target:=nullif(payload->>'conversation_id','')::uuid;
   if target is not null then
    select * into c from public.duuk_ai_conversations where id=target and user_id=actor for update;
    if c.id is null then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
   end if;
  end if;
  if c.id is not null and exists(select 1 from public.duuk_ai_requests where conversation_id=c.id and status='pending' and lease_until>now() and id<>rid) then raise exception 'Aguarde a resposta atual ou interrompa a geração.' using errcode='PT409';end if;
  select count(*) filter(where created_at>=now()-interval '1 minute'),count(*) filter(where created_at>=day_start)
   into minute_count,day_count from public.duuk_ai_usage where user_id=actor and created_at>=least(day_start,now()-interval '1 minute');
  select coalesce(sum(case when usage_known then tokens_input::bigint+tokens_output else reserved_tokens end),0) into day_tokens from public.duuk_ai_usage where user_id=actor and created_at>=day_start;
  if minute_count>=cfg.requests_per_minute or day_count>=cfg.requests_per_day or day_tokens>=cfg.tokens_per_day then raise exception 'Limite de uso do DUUK AI atingido. Tente novamente mais tarde.' using errcode='PT429';end if;
  if req.id is null then
   if c.id is null then
    if coalesce((payload->>'regenerate')::boolean,false) or nullif(payload->>'edit_message_id','') is not null then raise exception 'Abra a conversa antes de refazer uma mensagem.' using errcode='PT400';end if;
    insert into public.duuk_ai_conversations(user_id,title,mode) values(actor,left(regexp_replace(body,'\s+',' ','g'),80),selected_mode) returning * into c;
   end if;
   target:=nullif(payload->>'edit_message_id','')::uuid;
   if coalesce((payload->>'regenerate')::boolean,false) then
    if target is not null then
     select * into m from public.duuk_ai_messages where id=target and conversation_id=c.id and role='user' and superseded_at is null;
    else
     select * into m from public.duuk_ai_messages where conversation_id=c.id and role='user' and superseded_at is null order by position desc limit 1;
    end if;
    if m.id is null then raise exception 'Envie uma mensagem antes de regenerar.' using errcode='PT400';end if;
    update public.duuk_ai_messages set superseded_at=now() where conversation_id=c.id and position>m.position and superseded_at is null;
   elsif target is not null then
    select * into m from public.duuk_ai_messages where id=target and conversation_id=c.id and role='user' and superseded_at is null;
    if m.id is null then raise exception 'Mensagem não encontrada.' using errcode='PT404';end if;
    update public.duuk_ai_messages set superseded_at=now() where conversation_id=c.id and position>=m.position and superseded_at is null;
   end if;
   if not coalesce((payload->>'regenerate')::boolean,false) then
    insert into public.duuk_ai_messages(conversation_id,role,content) values(c.id,'user',body) returning * into m;
   end if;
   insert into public.duuk_ai_requests(id,user_id,conversation_id,user_message_id,payload_hash) values(rid,actor,c.id,m.id,fingerprint) returning * into req;
  else
   update public.duuk_ai_requests set status='pending',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',finished_at=null,error_code=null where id=req.id returning * into req;
  end if;
  update public.duuk_ai_conversations set mode=coalesce(payload->>'mode',mode),updated_at=now() where id=c.id returning * into c;
  history:='[]';
  -- Keep the most recent 20 messages and at most 24k characters sent to Gemini.
  for item in select jsonb_build_object('role',role,'content',content) from public.duuk_ai_messages where conversation_id=c.id and superseded_at is null order by position desc limit 20 loop
   n:=char_length(item->>'content');
   if total+n>24000 then
    if total=0 then history:=jsonb_build_array(jsonb_set(item,'{content}',to_jsonb(left(item->>'content',24000))));end if;
    exit;
   end if;
   history:=jsonb_build_array(item)||history;total:=total+n;
  end loop;
  reserve:=8192+greatest(6000,least(coalesce((payload->>'reserved_input_tokens')::integer,6000),32000))+ceil(char_length(history::text)::numeric/2)::integer;
  if day_tokens+reserve>cfg.tokens_per_day then raise exception 'Limite diário de tokens reservado. Tente novamente amanhã.' using errcode='PT429';end if;
  title_value:=coalesce(payload->>'selected_model',case when c.mode in ('script','concept','commercial') then cfg.creative_model else cfg.fast_model end);
  if title_value not in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite') then raise exception 'Modelo não permitido.' using errcode='PT400';end if;
  insert into public.duuk_ai_usage(request_id,lease_id,user_id,model,reserved_tokens) values(req.id,req.lease_id,actor,title_value,reserve);
  select coalesce(jsonb_object_agg(k.key,duuk_private.member_permission(actor,k.key)),'{}') into permissions from public.duuk_permission_keys k;
  return jsonb_build_object('conversation',to_jsonb(c),'request',jsonb_build_object('id',req.id,'lease_id',req.lease_id,'user_message_id',req.user_message_id),'history',history,'permissions',permissions);
 elsif operation='finish_generation' then
  rid:=nullif(payload->>'request_id','')::uuid;
  select * into req from public.duuk_ai_requests where id=rid and user_id=actor for update;
  if req.id is null then raise exception 'Solicitação não encontrada.' using errcode='PT404';end if;
  if req.status in ('complete','partial') then
   select * into m from public.duuk_ai_messages where id=req.assistant_message_id;
   return jsonb_build_object('conversation_id',req.conversation_id,'request_id',req.id,'message',to_jsonb(m));
  end if;
  if req.status<>'pending' or req.lease_id is distinct from nullif(payload->>'lease_id','')::uuid or req.lease_until<now() then raise exception 'Esta geração expirou. Atualize a conversa.' using errcode='PT409';end if;
  selected_mode:=coalesce(payload->>'status','complete');body:=trim(payload->>'content');
  if selected_mode not in ('complete','partial','failed') or char_length(coalesce(body,''))>64000 or (selected_mode in ('complete','partial') and coalesce(body,'')='') then raise exception 'Resposta inválida.' using errcode='PT400';end if;
  if coalesce(payload->>'model','') not in ('gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite') then raise exception 'Modelo não permitido.' using errcode='PT400';end if;
  if coalesce((payload->>'tokens_input')::integer,0) not between 0 and 1000000 or coalesce((payload->>'tokens_output')::integer,0) not between 0 and 1000000 then raise exception 'Uso inválido.' using errcode='PT400';end if;
  if selected_mode in ('complete','partial') then
   insert into public.duuk_ai_messages(conversation_id,role,content,model,prompt_version,status)
    values(req.conversation_id,'assistant',body,payload->>'model',left(payload->>'prompt_version',100),selected_mode) returning * into m;
  end if;
  update public.duuk_ai_usage set model=payload->>'model',tokens_input=coalesce((payload->>'tokens_input')::integer,0),tokens_output=coalesce((payload->>'tokens_output')::integer,0),usage_known=coalesce((payload->>'usage_known')::boolean,false)
   where request_id=req.id and lease_id=req.lease_id;
  update public.duuk_ai_requests set status=selected_mode,assistant_message_id=m.id,finished_at=now(),lease_until=now(),error_code=left(payload->>'error_code',100) where id=req.id;
  update public.duuk_ai_conversations set updated_at=now() where id=req.conversation_id;
  return jsonb_build_object('conversation_id',req.conversation_id,'request_id',req.id,'message',case when m.id is null then null else to_jsonb(m) end);
 end if;
 raise exception 'Operação DUUK AI inválida.' using errcode='PT400';
end;
$$;
create or replace function public.duuk_ai_backend(operation text,payload jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.ai_backend(operation,payload); $$;
revoke all on function duuk_private.ai_backend(text,jsonb),public.duuk_ai_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.ai_backend(text,jsonb),public.duuk_ai_backend(text,jsonb) to service_role;
notify pgrst,'reload schema';
