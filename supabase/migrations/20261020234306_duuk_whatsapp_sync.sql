-- Durable, bounded free coexistence synchronization; imported data never opens a reply window.
alter table duuk_private.whatsapp_messages add column details jsonb check(details is null or octet_length(details::text)<=20000),add column source text not null default 'live' check(source in ('live','history','business_app')),add column business_read_at timestamptz,add column typing_last_at timestamptz;
alter table duuk_private.whatsapp_config add column onboarded_at timestamptz;
create table duuk_private.whatsapp_sync_state(
 config_id uuid not null references duuk_private.whatsapp_config(id),kind text not null check(kind in ('contacts','history')),state text not null default 'idle' check(state in ('idle','requesting','requested','receiving','complete','declined','uncertain','failed')),
 request_id text check(length(request_id)<=255),requested_at timestamptz,last_event_at timestamptz,progress integer check(progress between 0 and 100),last_error text check(length(last_error)<=240),primary key(config_id,kind)
);
create table duuk_private.whatsapp_sync_jobs(
 id bigint generated always as identity primary key,config_id uuid not null references duuk_private.whatsapp_config(id),generation uuid not null,kind text not null check(kind in ('contacts','history')),dedupe text not null unique,
 payload jsonb not null check(octet_length(payload::text)<=512000),state text not null default 'pending' check(state in ('pending','complete','failed')),attempts integer not null default 0,last_error text,created_at timestamptz not null default now(),processed_at timestamptz
);
create index whatsapp_sync_jobs_pending_idx on duuk_private.whatsapp_sync_jobs(created_at,id) where state='pending';
create index whatsapp_sync_jobs_config_idx on duuk_private.whatsapp_sync_jobs(config_id);
create table duuk_private.whatsapp_mutations(
 config_id uuid not null references duuk_private.whatsapp_config(id),provider_id text not null,contact text not null,direction text not null check(direction in ('in','out')),remove boolean not null,body text check(length(body)<=4096),occurred_at timestamptz not null,primary key(config_id,provider_id,contact,direction)
);
create index whatsapp_mutations_retention_idx on duuk_private.whatsapp_mutations(occurred_at);
do $$declare t text;begin foreach t in array array['whatsapp_sync_state','whatsapp_sync_jobs','whatsapp_mutations'] loop execute format('alter table duuk_private.%I enable row level security',t);execute format('revoke all on duuk_private.%I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence duuk_private.whatsapp_sync_jobs_id_seq from public,anon,authenticated;
create function duuk_private.whatsapp_apply_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare mutation duuk_private.whatsapp_mutations;begin
 select mm.* into mutation from duuk_private.whatsapp_mutations mm join duuk_private.whatsapp_threads t on t.config_id=mm.config_id join duuk_private.whatsapp_contacts c on c.id=t.contact_id and c.wa_id=mm.contact where t.id=new.thread_id and mm.provider_id=new.provider_id and mm.direction=new.direction;
 if mutation.remove then new.body:='';new.media_id:=null;new.mime:=null;new.filename:=null;new.sha256:=null;new.details:=null;new.retracted_at:=mutation.occurred_at;
 elsif mutation.body is not null and (new.edited_at is null or new.edited_at<=mutation.occurred_at) then new.body:=mutation.body;new.edited_at:=mutation.occurred_at;end if;
 return new;
end $$;
revoke all on function duuk_private.whatsapp_apply_mutation() from public,anon,authenticated;
create trigger whatsapp_message_mutation before insert or update of body,media_id,details,direction on duuk_private.whatsapp_messages for each row execute function duuk_private.whatsapp_apply_mutation();
create or replace function duuk_private.whatsapp_backend_core(actor uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg duuk_private.whatsapp_config;c duuk_private.whatsapp_contacts;t duuk_private.whatsapp_threads;m duuk_private.whatsapp_messages;target duuk_private.whatsapp_messages;
 item jsonb;result jsonb;rows jsonb;secret uuid;nonce uuid;when_at timestamptz;offset_value integer:=least(10000,greatest(0,coalesce((payload->>'offset')::integer,0)));name_value text;new_status text;
begin
 if actor is null then
  if operation not in ('hook_credentials','hook_verified','ingest') then raise exception 'Acesso restrito.' using errcode='PT403';end if;
 elsif not duuk_private.member_permission(actor,'whatsapp') then raise exception 'Sua conta precisa de acesso ao WhatsApp.' using errcode='PT403';end if;
 select * into cfg from duuk_private.whatsapp_config where singleton;
 if operation in ('messages','get_message') then
  update duuk_private.whatsapp_messages set status='UNCERTAIN',last_error='O envio não foi confirmado. Confira antes de reenviar.' where status in ('PREPARING','SENDING') and created_at<now()-interval '2 minutes';
 end if;
 if operation='status' then
  return jsonb_build_object('configured',cfg.credentials_id is not null,'connected',cfg.status='connected' and (cfg.token_expires_at is null or cfg.token_expires_at>now()),'state',cfg.status,'expected_phone',cfg.expected_phone,'message_count',(select count(*) from duuk_private.whatsapp_messages),'contact_count',(select count(*) from duuk_private.whatsapp_contacts),'display_phone',cfg.display_phone,'verified_name',cfg.verified_name,'hook_verified_at',cfg.hook_verified_at,'token_expires_at',cfg.token_expires_at,'generation',cfg.generation,'free_only',true,'retention_days',90,'message_limit',10000);
 elsif operation='directory' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.duuk_profiles p where p.active and duuk_private.member_permission(p.id,'whatsapp'));
 elsif operation in ('configure','setup','disconnect','ready','reconnect','expected_phone') then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Somente um super administrador configura o WhatsApp.' using errcode='PT403';end if;
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-config'));
  select * into cfg from duuk_private.whatsapp_config where singleton for update;
  if operation in ('configure','disconnect') and exists(select 1 from duuk_private.whatsapp_messages where status in ('PREPARING','SENDING') and created_at>now()-interval '2 minutes') then raise exception 'Aguarde o envio atual antes de alterar a conexão.' using errcode='PT409';end if;
  if operation='expected_phone' then
   update duuk_private.whatsapp_config set expected_phone=payload->>'phone',updated_by=actor,updated_at=now() where singleton and credentials_id is null;
  elsif operation='configure' then
   if cfg.phone_id is not null and cfg.phone_id<>payload->>'phone_id' and exists(select 1 from duuk_private.whatsapp_messages) then raise exception 'Há histórico deste número. Reconecte o mesmo número para preservar as conversas.' using errcode='PT409';end if;
   if cfg.credentials_id is null then secret:=vault.create_secret((payload->'credentials')::text);else secret:=cfg.credentials_id;perform vault.update_secret(secret,(payload->'credentials')::text);end if;
   update duuk_private.whatsapp_config set app_id=payload->>'app_id',waba_id=payload->>'waba_id',phone_id=payload->>'phone_id',display_phone=left(payload->>'display_phone',50),verified_name=left(payload->>'verified_name',160),credentials_id=secret,verify_hash=payload->>'verify_hash',status='pending',generation=gen_random_uuid(),token_expires_at=(payload->>'token_expires_at')::timestamptz,hook_verified_at=null,subscribed_at=null,updated_by=actor,updated_at=now() where singleton returning * into cfg;
  elsif operation='disconnect' then
   delete from vault.secrets where id=cfg.credentials_id;
   update duuk_private.whatsapp_config set credentials_id=null,verify_hash=null,status='disconnected',generation=gen_random_uuid(),updated_by=actor,updated_at=now() where singleton;
  elsif operation='ready' then
   update duuk_private.whatsapp_config set status=case when hook_verified_at is not null then 'connected' else 'pending' end,subscribed_at=now(),updated_at=now() where singleton and generation=(payload->>'generation')::uuid;
  elsif operation='reconnect' then
   update duuk_private.whatsapp_config set status='reconnect',updated_at=now() where singleton and generation=(payload->>'generation')::uuid;
  else
   if cfg.credentials_id is null then raise exception 'Conecte o aplicativo da Meta primeiro.' using errcode='PT409';end if;
   return jsonb_build_object('connection_id',cfg.id,'app_id',cfg.app_id,'waba_id',cfg.waba_id,'phone_id',cfg.phone_id,'verify_token',(select decrypted_secret::jsonb->>'verify_token' from vault.decrypted_secrets where id=cfg.credentials_id));
  end if;
  return jsonb_build_object('generation',cfg.generation,'connection_id',cfg.id);
 elsif operation in ('credentials','hook_credentials') then
  if cfg.credentials_id is null or operation='hook_credentials' and cfg.id is distinct from (payload->>'connection_id')::uuid then raise exception 'Conexão indisponível.' using errcode='PT403';end if;
  if operation='credentials' and cfg.token_expires_at<=now() then raise exception 'A autorização da Meta expirou. Reconecte o aplicativo.' using errcode='PT409';end if;
  return to_jsonb(cfg)-'credentials_id'||jsonb_build_object('credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=cfg.credentials_id));
 elsif operation='hook_verified' then
  update duuk_private.whatsapp_config set hook_verified_at=now(),status=case when subscribed_at is not null then 'connected' else status end where singleton and id=(payload->>'connection_id')::uuid and generation=(payload->>'generation')::uuid and credentials_id is not null;
  return '{}';
 end if;
 if operation='contacts' then
  select coalesce(jsonb_agg(duuk_private.whatsapp_contact_view(x) order by x.updated_at desc,x.id),'[]') into rows from (
   select * from duuk_private.whatsapp_contacts where coalesce(payload->>'search','')='' or name ilike '%'||left(payload->>'search',160)||'%' or wa_id like '%'||left(payload->>'search',160)||'%' or company ilike '%'||left(payload->>'search',160)||'%' or email ilike '%'||left(payload->>'search',160)||'%'
   order by updated_at desc,id limit 21 offset offset_value) x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(v) from (select v from jsonb_array_elements(rows) with ordinality a(v,n) where n<=20) p),'[]'),'has_more',jsonb_array_length(rows)>20);
 elsif operation='contact_save' then
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-contacts'));
  if payload->>'id' is not null then
   select * into c from duuk_private.whatsapp_contacts where id=(payload->>'id')::uuid for update;
   if c.id is null or c.version is distinct from (payload->>'version')::bigint then raise exception 'O contato mudou. Atualize antes de salvar.' using errcode='PT409';end if;
   if c.wa_id<>payload->>'wa_id' and exists(select 1 from duuk_private.whatsapp_threads t2 join duuk_private.whatsapp_messages m2 on m2.thread_id=t2.id where t2.contact_id=c.id) then raise exception 'Este número já possui histórico. Cadastre outro contato para o novo número.' using errcode='PT409';end if;
   update duuk_private.whatsapp_contacts set name=btrim(payload->>'name'),custom_name=true,wa_id=payload->>'wa_id',email=coalesce(payload->>'email',''),company=coalesce(payload->>'company',''),notes=coalesce(payload->>'notes',''),tags=array(select jsonb_array_elements_text(coalesce(payload->'tags','[]'))),version=version+1,updated_at=now() where id=c.id returning * into c;
  else
   if (select count(*) from duuk_private.whatsapp_contacts)>=2000 then raise exception 'O limite gratuito de 2.000 contatos foi atingido.' using errcode='PT409';end if;
   insert into duuk_private.whatsapp_contacts(wa_id,name,custom_name,email,company,notes,tags,created_by) values(payload->>'wa_id',btrim(payload->>'name'),true,coalesce(payload->>'email',''),coalesce(payload->>'company',''),coalesce(payload->>'notes',''),array(select jsonb_array_elements_text(coalesce(payload->'tags','[]'))),actor) returning * into c;
  end if;
  return duuk_private.whatsapp_contact_view(c);
 elsif operation in ('photo_save','photo') then
  select * into c from duuk_private.whatsapp_contacts where id=(payload->>'id')::uuid;
  if c.id is null then raise exception 'Contato não encontrado.' using errcode='PT404';end if;
  if operation='photo' then return jsonb_build_object('base64',c.photo_base64,'mime',c.photo_mime);end if;
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-contacts'));
  if payload->>'base64' is not null and c.photo_base64 is null and (select count(*) from duuk_private.whatsapp_contacts where photo_base64 is not null)>=250 then raise exception 'Limite gratuito de 250 fotos atingido. Remova uma foto antes de adicionar outra.' using errcode='PT409';end if;
  update duuk_private.whatsapp_contacts set photo_base64=payload->>'base64',photo_mime=payload->>'mime',photo_version=gen_random_uuid(),version=version+1,updated_at=now() where id=c.id and version=(payload->>'version')::bigint returning * into c;
  if c.id is null then raise exception 'O contato mudou. Atualize antes de enviar a foto.' using errcode='PT409';end if;
  return duuk_private.whatsapp_contact_view(c);
 elsif operation='open_thread' then
  select * into c from duuk_private.whatsapp_contacts where id=(payload->>'contact_id')::uuid;
  if c.id is null then raise exception 'Contato não encontrado.' using errcode='PT404';end if;
  insert into duuk_private.whatsapp_threads(config_id,contact_id) values(cfg.id,c.id) on conflict(config_id,contact_id) do update set contact_id=excluded.contact_id returning * into t;
  return to_jsonb(t);
 elsif operation='threads' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc,x.id),'[]') into rows from (
   select t2.*,duuk_private.whatsapp_contact_view(c2) as contact,
    (select count(*) from duuk_private.whatsapp_messages m2 where m2.thread_id=t2.id and m2.direction='in' and m2.source<>'history' and (m2.type<>'reaction' or m2.direction='out' and m2.status in ('PREPARING','SENDING','UNCERTAIN','FAILED')) and m2.occurred_at>coalesce((select seen_at from duuk_private.whatsapp_reads r where r.user_id=actor and r.thread_id=t2.id),'-infinity')) as unread
   from duuk_private.whatsapp_threads t2 join duuk_private.whatsapp_contacts c2 on c2.id=t2.contact_id where t2.config_id=cfg.id
    and (coalesce(payload->>'filter','open')='all' or payload->>'filter'='mine' and t2.assigned_to=actor or payload->>'filter'='unassigned' and t2.assigned_to is null and t2.status='open' or t2.status=coalesce(payload->>'filter','open'))
    and (coalesce(payload->>'search','')='' or c2.name ilike '%'||left(payload->>'search',160)||'%' or c2.wa_id like '%'||left(payload->>'search',160)||'%')
    order by t2.updated_at desc,t2.id limit 21 offset offset_value) x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(v) from (select v from jsonb_array_elements(rows) with ordinality a(v,n) where n<=20) p),'[]'),'has_more',jsonb_array_length(rows)>20);
 end if;
 if operation in ('messages','thread','thread_update','seen','analytics','send_begin') then
  select * into t from duuk_private.whatsapp_threads where id=(payload->>'thread_id')::uuid and config_id=cfg.id;
  if t.id is null then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
  select * into c from duuk_private.whatsapp_contacts where id=t.contact_id;
 end if;
 if operation='thread' then return to_jsonb(t)||jsonb_build_object('contact',duuk_private.whatsapp_contact_view(c));
 elsif operation='messages' then
  select coalesce(jsonb_agg(duuk_private.whatsapp_message_view(x,actor) order by x.occurred_at,x.sequence,x.id),'[]') into rows from (
   select * from duuk_private.whatsapp_messages m2 where m2.thread_id=t.id and (m2.type<>'reaction' or m2.direction='out' and m2.status in ('PREPARING','SENDING','UNCERTAIN','FAILED'))
    and (coalesce((payload->>'starred')::boolean,false)=false or exists(select 1 from duuk_private.whatsapp_stars s where s.user_id=actor and s.message_id=m2.id))
    and (payload->>'before' is null or (m2.occurred_at,m2.sequence,m2.id)<((payload->>'before')::timestamptz,(payload->>'before_sequence')::bigint,(payload->>'before_id')::uuid))
    order by m2.occurred_at desc,m2.sequence desc,m2.id desc limit 51) x;
  return jsonb_build_object('thread',to_jsonb(t)||jsonb_build_object('contact',duuk_private.whatsapp_contact_view(c)),'items',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(rows) with ordinality a(v,n) where n>greatest(0,jsonb_array_length(rows)-50)),'[]'),'has_more',jsonb_array_length(rows)>50,'server_time',now());
 elsif operation='seen' then
  when_at:=least((payload->>'seen_at')::timestamptz,coalesce(t.last_customer_at,now()),now());
  if when_at is not null then insert into duuk_private.whatsapp_reads(user_id,thread_id,seen_at) values(actor,t.id,when_at) on conflict(user_id,thread_id) do update set seen_at=greatest(whatsapp_reads.seen_at,excluded.seen_at);end if;
  return '{}';
 elsif operation='thread_update' then
  if payload->>'assigned_to' is not null and not duuk_private.member_permission((payload->>'assigned_to')::uuid,'whatsapp') then raise exception 'Esta pessoa não tem acesso ao WhatsApp.' using errcode='PT403';end if;
  if coalesce(payload->>'status',t.status) not in ('open','resolved') then raise exception 'Situação inválida.' using errcode='PT400';end if;
  update duuk_private.whatsapp_threads set assigned_to=case when payload ? 'assigned_to' then (payload->>'assigned_to')::uuid else assigned_to end,status=coalesce(payload->>'status',status),version=version+1,updated_at=now() where id=t.id and version=(payload->>'version')::bigint returning * into t;
  if t.id is null then raise exception 'A conversa mudou. Atualize antes de alterar.' using errcode='PT409';end if;
  return to_jsonb(t);
 elsif operation='analytics' then
  select jsonb_build_object('incoming',count(*) filter(where direction='in'),'outgoing',count(*) filter(where direction='out'),'media',count(*) filter(where type in ('audio','image','video','document','sticker')),'sent',count(*) filter(where direction='out' and status in ('SENT','DELIVERED','READ')),'delivered',count(*) filter(where direction='out' and status in ('DELIVERED','READ')),'read',count(*) filter(where direction='out' and status='READ'),'failed',count(*) filter(where direction='out' and status='FAILED'),'first_message_at',min(occurred_at),'last_message_at',max(occurred_at)) into result from duuk_private.whatsapp_messages where thread_id=t.id and type<>'reaction' and created_at>=now()-interval '90 days';
  return result||jsonb_build_object('days',90,'daily',(select coalesce(jsonb_agg(to_jsonb(x) order by x.day),'[]') from (select to_char(occurred_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day,count(*) filter(where direction='in') as incoming,count(*) filter(where direction='out') as outgoing from duuk_private.whatsapp_messages where thread_id=t.id and type<>'reaction' and occurred_at>=now()-interval '7 days' group by 1) x));
 end if;
 if operation='send_begin' then
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-send:'||t.id));
  select * into m from duuk_private.whatsapp_messages where id=(payload->>'id')::uuid;
  if m.id is not null then
   if m.thread_id<>t.id or m.actor_id is distinct from actor or m.request_hash is distinct from payload->>'request_hash' then raise exception 'Esta tentativa pertence a outra mensagem.' using errcode='PT409';end if;
   return jsonb_build_object('execute',false,'message',duuk_private.whatsapp_message_view(m,actor));
  end if;
  select * into cfg from duuk_private.whatsapp_config where singleton for share;
  select x.* into t from duuk_private.whatsapp_threads x where x.id=t.id for update;
  if cfg.status<>'connected' or cfg.credentials_id is null or cfg.token_expires_at<=now() then raise exception 'Conclua a conexão oficial da Meta antes de enviar.' using errcode='PT409';end if;
  if t.status<>'open' or t.last_customer_at is null or t.last_customer_at<now()-interval '23 hours 58 minutes' then raise exception 'A janela gratuita terminou ou está encerrando. Aguarde uma nova mensagem do cliente.' using errcode='PT409';end if;
  if payload->>'type' not in ('text','image','audio','video','document','sticker','reaction','contacts','location','interactive') then raise exception 'Somente respostas gratuitas são permitidas.' using errcode='PT400';end if;
  if exists(select 1 from duuk_private.whatsapp_messages where thread_id=t.id and request_hash=payload->>'request_hash' and status in ('PREPARING','SENDING','UNCERTAIN')) then raise exception 'Uma mensagem igual ainda está em confirmação. Confira a tentativa anterior.' using errcode='PT409';end if;
  if (select count(*) from duuk_private.whatsapp_messages)>=10000 then raise exception 'O histórico atingiu o limite gratuito. Consulte o administrador.' using errcode='PT507';end if;
  if payload->>'reply_to' is not null then
   select * into target from duuk_private.whatsapp_messages where id=(payload->>'reply_to')::uuid and thread_id=t.id and provider_id is not null and type not in ('reaction','system','unsupported') and retracted_at is null;
   if target.id is null then raise exception 'A mensagem original não está disponível nesta conversa.' using errcode='PT409';end if;
   if payload->>'type'='reaction' and target.occurred_at<now()-interval '30 days' then raise exception 'O WhatsApp não permite reagir a esta mensagem antiga.' using errcode='PT409';end if;
  end if;
  nonce:=gen_random_uuid();
  insert into duuk_private.whatsapp_messages(id,thread_id,direction,type,body,status,request_hash,actor_id,config_generation,lease_id,mime,filename,byte_size,sha256,context_provider_id,emoji,details)
   values((payload->>'id')::uuid,t.id,'out',payload->>'type',coalesce(payload->>'text',''),'PREPARING',payload->>'request_hash',actor,cfg.generation,nonce,payload->>'mime',payload->>'filename',(payload->>'byte_size')::integer,payload->>'sha256',target.provider_id,payload->>'emoji',payload->'details') returning * into m;
  return jsonb_build_object('execute',true,'internal',to_jsonb(m),'to',c.wa_id);
 elsif operation in ('get_message','message_media','star') then
  select x.* into m from duuk_private.whatsapp_messages x join duuk_private.whatsapp_threads t2 on t2.id=x.thread_id where x.id=(payload->>'id')::uuid and t2.config_id=cfg.id;
  if m.id is null then raise exception 'Mensagem não encontrada.' using errcode='PT404';end if;
  if operation='star' then
   if coalesce((payload->>'starred')::boolean,false) then insert into duuk_private.whatsapp_stars(user_id,message_id) values(actor,m.id) on conflict do nothing;else delete from duuk_private.whatsapp_stars where user_id=actor and message_id=m.id;end if;
  elsif operation='message_media' then
   if m.media_id is null then raise exception 'A mensagem não tem mídia disponível.' using errcode='PT404';end if;
   return jsonb_build_object('media_id',m.media_id,'mime',m.mime,'filename',m.filename,'sha256',m.sha256,'type',m.type);
  end if;
  return duuk_private.whatsapp_message_view(m,actor);
 elsif operation in ('send_uploaded','send_dispatch','send_ack','send_error') then
  select * into m from duuk_private.whatsapp_messages where id=(payload->>'id')::uuid for update;
  if m.id is null or m.actor_id is distinct from actor or m.lease_id is distinct from (payload->>'lease_id')::uuid or m.config_generation is distinct from cfg.generation then raise exception 'O envio ou a conexão mudou. Confira a mensagem.' using errcode='PT409';end if;
  if operation='send_uploaded' then
   if m.status<>'PREPARING' then raise exception 'O envio já começou.' using errcode='PT409';end if;
   update duuk_private.whatsapp_messages set media_id=payload->>'media_id' where id=m.id returning * into m;
  elsif operation='send_dispatch' then
   select * into t from duuk_private.whatsapp_threads where id=m.thread_id;
   if cfg.status<>'connected' or cfg.credentials_id is null or cfg.token_expires_at<=now() or t.status<>'open' or t.last_customer_at<now()-interval '23 hours 59 minutes 30 seconds' or t.last_customer_at is null then raise exception 'A janela gratuita terminou. Aguarde uma nova mensagem do cliente.' using errcode='PT409';end if;
   if m.status<>'PREPARING' or m.type not in ('text','reaction','contacts','location','interactive') and m.media_id is null then raise exception 'O envio já começou ou a mídia está incompleta.' using errcode='PT409';end if;
   update duuk_private.whatsapp_messages set status='SENDING' where id=m.id returning * into m;
  elsif operation='send_ack' then
   if m.provider_id is not null and m.provider_id is distinct from payload->>'provider_id' then raise exception 'A confirmação pertence a outra mensagem.' using errcode='PT409';end if;
   update duuk_private.whatsapp_messages set provider_id=payload->>'provider_id',status=case when status in ('DELIVERED','READ','FAILED') then status else 'SENT' end,last_error=case when status='FAILED' then last_error else null end where id=m.id returning * into m;
   if m.type='reaction' and m.status<>'FAILED' then
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select id,'business',coalesce(m.emoji,''),m.occurred_at from duuk_private.whatsapp_messages where provider_id=m.context_provider_id and thread_id=m.thread_id
     on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
   end if;
   update duuk_private.whatsapp_threads set last_message_at=greatest(last_message_at,m.occurred_at),preview=case when last_message_at is null or last_message_at<=m.occurred_at then left(case when m.type='text' then m.body when m.type='reaction' then 'Reação' else coalesce(nullif(m.body,''),m.filename,m.type) end,160) else preview end,updated_at=now() where id=m.thread_id;
  else
   update duuk_private.whatsapp_messages set status=case when status in ('SENT','DELIVERED','READ') then status when (payload->>'uncertain')::boolean then 'UNCERTAIN' else 'FAILED' end,last_error=case when status in ('SENT','DELIVERED','READ') then null else left(payload->>'error',240) end where id=m.id returning * into m;
  end if;
  return to_jsonb(m);
 end if;
 if operation='ingest' then
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-ingest'));
  select * into cfg from duuk_private.whatsapp_config where singleton;
  if cfg.credentials_id is null or cfg.id is distinct from (payload->>'connection_id')::uuid or cfg.generation is distinct from (payload->>'generation')::uuid then return '{}';end if;
  if coalesce((payload->>'disconnected')::boolean,false) then update duuk_private.whatsapp_config set status='reconnect',updated_at=now() where singleton;end if;
  for item in select value from jsonb_array_elements(coalesce(payload->'contacts','[]')) loop
   select * into c from duuk_private.whatsapp_contacts where wa_id=item->>'wa_id';
   if c.id is null then
    if (select count(*) from duuk_private.whatsapp_contacts)>=2000 then raise exception 'Limite gratuito de contatos atingido.' using errcode='PT507';end if;
    insert into duuk_private.whatsapp_contacts(wa_id,name,remote_updated_at) values(item->>'wa_id',coalesce(nullif(item->>'name',''),item->>'wa_id'),(item->>'at')::timestamptz);
   elsif c.id is not null and not c.custom_name and coalesce(item->>'name','')<>'' and (c.remote_updated_at is null or c.remote_updated_at<(item->>'at')::timestamptz) then
    update duuk_private.whatsapp_contacts set name=left(item->>'name',120),remote_updated_at=(item->>'at')::timestamptz,version=version+1,updated_at=now() where id=c.id;
   end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload->'messages','[]')) loop
   if exists(select 1 from duuk_private.whatsapp_messages where provider_id=item->>'provider_id') then continue;end if;
   if (select count(*) from duuk_private.whatsapp_messages)>=10000 then raise exception 'Limite gratuito de histórico atingido.' using errcode='PT507';end if;
   when_at:=(item->>'occurred_at')::timestamptz;
   if when_at>now()+interval '1 minute' or when_at<now()-interval '90 days' then continue;end if;
   select * into c from duuk_private.whatsapp_contacts where wa_id=item->>'from';
   if c.id is null then
    if (select count(*) from duuk_private.whatsapp_contacts)>=2000 then raise exception 'Limite gratuito de contatos atingido.' using errcode='PT507';end if;
    insert into duuk_private.whatsapp_contacts(wa_id,name) values(item->>'from',coalesce(nullif(item->>'name',''),item->>'from')) returning * into c;
   elsif not c.custom_name and coalesce(item->>'name','')<>'' and c.name<>item->>'name' then
    update duuk_private.whatsapp_contacts set name=left(item->>'name',120),version=version+1,updated_at=now() where id=c.id returning * into c;
   end if;
   insert into duuk_private.whatsapp_threads(config_id,contact_id) values(cfg.id,c.id) on conflict(config_id,contact_id) do update set contact_id=excluded.contact_id returning * into t;
   when_at:=(item->>'occurred_at')::timestamptz;
   if when_at>now()+interval '1 minute' or when_at<now()-interval '90 days' then continue;end if;
   insert into duuk_private.whatsapp_messages(thread_id,provider_id,direction,type,body,status,media_id,mime,filename,sha256,context_provider_id,emoji,occurred_at,details,source)
    values(t.id,item->>'provider_id',case when item->>'direction'='out' then 'out' else 'in' end,item->>'type',coalesce(item->>'text',''),case when item->>'direction'<>'out' or item->>'direction' is null then 'RECEIVED' when item->>'source'='history' then case item->>'history_status' when 'READ' then 'READ' when 'PLAYED' then 'READ' when 'DELIVERED' then 'DELIVERED' when 'ERROR' then 'FAILED' when 'PENDING' then 'UNCERTAIN' else 'SENT' end else 'SENT' end,item->>'media_id',item->>'mime',item->>'filename',item->>'sha256',item->>'context_id',item->>'emoji',least(when_at,now()),item->'details',coalesce(item->>'source','live')) returning * into m;
   if m.type='reaction' then
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select id,case when m.direction='out' then 'business' else c.wa_id end,coalesce(m.emoji,''),m.occurred_at from duuk_private.whatsapp_messages where provider_id=m.context_provider_id and thread_id=t.id
     on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
   else
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select distinct on (x.direction) m.id,case when x.direction='in' then c.wa_id else 'business' end,coalesce(x.emoji,''),x.occurred_at from duuk_private.whatsapp_messages x where x.thread_id=t.id and x.type='reaction' and x.context_provider_id=m.provider_id and (x.direction='in' or x.status in ('SENT','DELIVERED','READ')) order by x.direction,x.occurred_at desc on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
    update duuk_private.whatsapp_threads set last_customer_at=case when m.direction='in' and coalesce((item->>'opens_window')::boolean,false) then greatest(last_customer_at,m.occurred_at) else last_customer_at end,last_message_at=greatest(last_message_at,m.occurred_at),preview=case when last_message_at is null or last_message_at<=m.occurred_at then left(case when m.retracted_at is not null then 'Mensagem apagada' else coalesce(nullif(m.body,''),m.filename,m.type) end,160) else preview end,status=case when coalesce((item->>'opens_window')::boolean,false) then 'open' else status end,version=version+1,updated_at=greatest(updated_at,m.occurred_at) where id=t.id;
   end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload->'mutations','[]')) loop
   select x.* into m from duuk_private.whatsapp_messages x join duuk_private.whatsapp_threads t2 on t2.id=x.thread_id join duuk_private.whatsapp_contacts c2 on c2.id=t2.contact_id where t2.config_id=cfg.id and c2.wa_id=item->>'contact' and x.provider_id=item->>'original' and x.direction=item->>'direction' for update of x;
   if m.id is null or m.retracted_at is not null or m.edited_at>(item->>'at')::timestamptz then continue;end if;
   if (item->>'remove')::boolean then
    update duuk_private.whatsapp_messages set body='',media_id=null,mime=null,filename=null,sha256=null,retracted_at=(item->>'at')::timestamptz where id=m.id;
    delete from duuk_private.whatsapp_reactions where message_id=m.id;
   elsif item->>'body' is not null then update duuk_private.whatsapp_messages set body=item->>'body',edited_at=(item->>'at')::timestamptz where id=m.id;end if;
   update duuk_private.whatsapp_threads set preview=case when (item->>'remove')::boolean then 'Mensagem apagada' else left(coalesce(item->>'body','Mensagem editada'),160) end where id=m.thread_id and last_message_at=m.occurred_at;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload->'statuses','[]')) loop
   select x.* into m from duuk_private.whatsapp_messages x join duuk_private.whatsapp_threads t2 on t2.id=x.thread_id join duuk_private.whatsapp_contacts c2 on c2.id=t2.contact_id
    where t2.config_id=cfg.id and c2.wa_id=item->>'recipient' and x.direction='out' and (x.provider_id=item->>'provider_id' or x.id=(item->>'request_id')::uuid and x.status in ('SENDING','UNCERTAIN','SENT','DELIVERED','READ','FAILED')) for update of x;
   if m.id is null or m.provider_id is not null and m.provider_id<>item->>'provider_id' then continue;end if;
   new_status:=item->>'status';
   update duuk_private.whatsapp_messages set provider_id=coalesce(provider_id,item->>'provider_id'),status=case when status='READ' then 'READ' when new_status='READ' then 'READ' when status='DELIVERED' then 'DELIVERED' when new_status='DELIVERED' then 'DELIVERED' when status='FAILED' then 'FAILED' else new_status end,error_code=case when new_status='FAILED' then (item->>'error_code')::integer else error_code end,last_error=case when new_status='FAILED' and status not in ('READ','DELIVERED') then 'O WhatsApp não entregou esta mensagem. Confira a janela e o destinatário.' else null end where id=m.id returning * into m;
   if m.type='reaction' and m.status in ('SENT','DELIVERED','READ') then
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select id,'business',coalesce(m.emoji,''),m.occurred_at from duuk_private.whatsapp_messages where provider_id=m.context_provider_id and thread_id=m.thread_id
     on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
   end if;
   update duuk_private.whatsapp_threads set last_message_at=greatest(last_message_at,m.occurred_at),preview=case when last_message_at is null or last_message_at<=m.occurred_at then left(case when m.retracted_at is not null then 'Mensagem apagada' else coalesce(nullif(m.body,''),m.filename,m.type) end,160) else preview end,updated_at=now() where id=m.thread_id;
  end loop;
  return '{}';
 end if;
 raise exception 'Operação não permitida.' using errcode='PT400';
exception when unique_violation then raise exception 'Este telefone ou identificador já está cadastrado. Atualize a lista.' using errcode='PT409';
end $$;

revoke all on function duuk_private.whatsapp_backend_core(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- A SQL worker commits normalized batches even when the browser or Edge request disappears.
create function duuk_private.whatsapp_sync_drain(maximum integer default 4) returns integer language plpgsql security definer set search_path='' as $$
declare job duuk_private.whatsapp_sync_jobs;cfg duuk_private.whatsapp_config;item jsonb;m duuk_private.whatsapp_messages;n integer:=0;batch jsonb;begin
 if not pg_try_advisory_xact_lock(hashtext('duuk-whatsapp-sync-drain')) then return 0;end if;
 select * into cfg from duuk_private.whatsapp_config where singleton;
 for job in select * from duuk_private.whatsapp_sync_jobs where state='pending' order by case when payload->>'media'='true' then 1 else 0 end,coalesce(processed_at,created_at),id limit least(8,greatest(1,maximum)) for update skip locked loop
  begin
   if cfg.credentials_id is null or cfg.generation<>job.generation then
    update duuk_private.whatsapp_sync_jobs set state='failed',attempts=attempts+1,last_error='A conexão mudou. Reconecte e revise a sincronização.',processed_at=now() where id=job.id;continue;
   end if;
   batch:=job.payload;
   if job.kind='contacts' then
    -- Removal from the phone's address book is recorded, without deleting DUUK notes/history.
    for item in select value from jsonb_array_elements(coalesce(batch->'contacts','[]')) where coalesce((value->>'removed')::boolean,false) loop
     update duuk_private.whatsapp_contacts set remote_removed=true,remote_updated_at=(item->>'at')::timestamptz,version=version+1 where wa_id=item->>'wa_id' and (remote_updated_at is null or remote_updated_at<=(item->>'at')::timestamptz);
    end loop;
    perform duuk_private.whatsapp_backend_core(null,'ingest',jsonb_build_object('connection_id',cfg.id,'generation',cfg.generation,'contacts',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(coalesce(batch->'contacts','[]')) where not coalesce((value->>'removed')::boolean,false))));
    for item in select value from jsonb_array_elements(coalesce(batch->'contacts','[]')) where not coalesce((value->>'removed')::boolean,false) loop
     update duuk_private.whatsapp_contacts set remote_removed=false where wa_id=item->>'wa_id' and (remote_updated_at is null or remote_updated_at<=(item->>'at')::timestamptz);
    end loop;
   else
    -- Replace placeholders only from signed history. Preserve canonical direction from the thread batch.
    for item in select value from jsonb_array_elements(coalesce(batch->'messages','[]')) loop
     select x.* into m from duuk_private.whatsapp_messages x join duuk_private.whatsapp_threads t on t.id=x.thread_id join duuk_private.whatsapp_contacts c on c.id=t.contact_id where t.config_id=cfg.id and c.wa_id=item->>'from' and x.provider_id=item->>'provider_id';
     if m.id is not null and m.source='history' and m.retracted_at is null then
      if m.type='media_placeholder' and item->>'media_id' is not null then
       update duuk_private.whatsapp_messages set type=item->>'type',body=coalesce(item->>'text',''),media_id=item->>'media_id',mime=item->>'mime',filename=item->>'filename',sha256=item->>'sha256',details=item->'details' where id=m.id;
       update duuk_private.whatsapp_threads set preview=left(coalesce(nullif(item->>'text',''),item->>'filename',item->>'type'),160) where id=m.thread_id and last_message_at=m.occurred_at;
      elsif not coalesce((item->>'history_media')::boolean,false) then
       update duuk_private.whatsapp_messages set direction=item->>'direction',occurred_at=(item->>'occurred_at')::timestamptz,status=case when item->>'direction'='in' then 'RECEIVED' when status='READ' then 'READ' when item->>'history_status' in ('READ','PLAYED') then 'READ' when status='DELIVERED' then 'DELIVERED' when item->>'history_status'='DELIVERED' then 'DELIVERED' when item->>'history_status'='ERROR' then 'FAILED' when item->>'history_status'='PENDING' then 'UNCERTAIN' else 'SENT' end where id=m.id;
      end if;
     end if;
    end loop;
    if coalesce((batch->>'media')::boolean,false) then
     -- An attachment-only history event does not establish the original sender. Keep it private
     -- until its canonical thread message exists; it must not bypass a directional tombstone.
     batch:=jsonb_set(batch,'{messages}',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(coalesce(batch->'messages','[]')) v where not exists(select 1 from duuk_private.whatsapp_messages x join duuk_private.whatsapp_threads t on t.id=x.thread_id join duuk_private.whatsapp_contacts c on c.id=t.contact_id where t.config_id=cfg.id and c.wa_id=v->>'from' and x.provider_id=v->>'provider_id')));
     if jsonb_array_length(batch->'messages')>0 then update duuk_private.whatsapp_sync_jobs set payload=batch,attempts=attempts+1,processed_at=now() where id=job.id;continue;end if;
    else
     perform duuk_private.whatsapp_backend_core(null,'ingest',jsonb_build_object('connection_id',cfg.id,'generation',cfg.generation,'messages',(select coalesce(jsonb_agg(value||jsonb_build_object('source','history','opens_window',false)),'[]') from jsonb_array_elements(coalesce(batch->'messages','[]')) where (value->>'occurred_at')::timestamptz>=now()-interval '90 days')));
    end if;
    update duuk_private.whatsapp_threads t2 set last_message_at=(select max(x.occurred_at) from duuk_private.whatsapp_messages x where x.thread_id=t2.id) where t2.config_id=cfg.id and t2.id in(select x.thread_id from duuk_private.whatsapp_messages x where x.provider_id in(select v->>'provider_id' from jsonb_array_elements(coalesce(job.payload->'messages','[]')) v));

   end if;
   update duuk_private.whatsapp_sync_jobs set state='complete',attempts=attempts+1,payload='{}',last_error=null,processed_at=now() where id=job.id;
   insert into duuk_private.whatsapp_sync_state(config_id,kind,state,last_event_at,progress) values(cfg.id,job.kind,case when coalesce((batch->>'declined')::boolean,false) then 'declined' else 'receiving' end,now(),(batch->>'progress')::integer)
    on conflict(config_id,kind) do update set state=case when excluded.state='declined' then 'declined' when whatsapp_sync_state.state='declined' then 'declined' else 'receiving' end,last_event_at=now(),progress=greatest(whatsapp_sync_state.progress,excluded.progress),last_error=null;
   n:=n+1;
  exception when others then
   update duuk_private.whatsapp_sync_jobs set state='failed',attempts=attempts+1,last_error=case when sqlstate='PT507' then 'A capacidade gratuita foi atingida. Revise o histórico antes de reprocessar.' else 'O lote não pôde ser processado. Peça ao administrador para revisar.' end,processed_at=now() where id=job.id;
   insert into duuk_private.whatsapp_sync_state(config_id,kind,state,last_error) values(job.config_id,job.kind,'failed','Há um lote pendente de revisão.') on conflict(config_id,kind) do update set state='failed',last_error=excluded.last_error;
  end;
 end loop;
 update duuk_private.whatsapp_sync_state s set state='complete' where s.config_id=cfg.id and s.kind='history' and s.progress=100 and s.state<>'declined' and not exists(select 1 from duuk_private.whatsapp_sync_jobs j where j.config_id=s.config_id and j.kind='history' and j.state<>'complete');
 -- Never keep message content in a failed queue beyond the message retention boundary.
 update duuk_private.whatsapp_sync_jobs j set payload=jsonb_set(j.payload,'{messages}',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(j.payload->'messages') where (value->>'occurred_at')::timestamptz>=now()-interval '90 days')) where j.payload ? 'messages' and j.state<>'complete';
 delete from duuk_private.whatsapp_sync_jobs where created_at<now()-interval '7 days' and state='complete';
 delete from duuk_private.whatsapp_mutations where occurred_at<now()-interval '90 days';
 return n;
end $$;
revoke all on function duuk_private.whatsapp_sync_drain(integer) from public,anon,authenticated,service_role;
alter table duuk_private.whatsapp_contacts add column remote_removed boolean not null default false;

-- Byte-aware splitting happens before this insert; dedupe and total capacity are transactional.
create function duuk_private.whatsapp_sync_enqueue(config_id_value uuid,generation_value uuid,kind_value text,batch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare fingerprint text;begin
 fingerprint:=encode(extensions.digest(config_id_value::text||generation_value::text||batch::text,'sha256'),'hex');
 if exists(select 1 from duuk_private.whatsapp_sync_jobs where dedupe=fingerprint) then return;end if;
 if octet_length(batch::text)>512000 then raise exception 'Este lote excede o limite gratuito de processamento.' using errcode='PT413';end if;
 if (select count(*) from duuk_private.whatsapp_sync_jobs where state<>'complete')>=128 or (select coalesce(sum(octet_length(j.payload::text)),0) from duuk_private.whatsapp_sync_jobs j where j.state<>'complete')+octet_length(batch::text)>8388608 then raise exception 'A fila gratuita está cheia. Os lotes ainda não foram confirmados.' using errcode='PT507';end if;
 insert into duuk_private.whatsapp_sync_jobs(config_id,generation,kind,dedupe,payload) values(config_id_value,generation_value,kind_value,fingerprint,batch);
end $$;
revoke all on function duuk_private.whatsapp_sync_enqueue(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.duuk_whatsapp_backend(actor uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg duuk_private.whatsapp_config;batch jsonb;chunk jsonb;candidate jsonb;items_key text;item jsonb;result jsonb;sync_record duuk_private.whatsapp_sync_state;receipt duuk_private.whatsapp_messages;thread duuk_private.whatsapp_threads;kind_value text;idx integer;length_value integer;onboarded timestamptz;fingerprint text;begin
 if actor is null then
  if operation not in ('hook_credentials','hook_verified','ingest') then raise exception 'Acesso restrito.' using errcode='PT403';end if;
 elsif not duuk_private.member_permission(actor,'whatsapp') then raise exception 'Sua conta precisa de acesso ao WhatsApp.' using errcode='PT403';end if;
 select * into cfg from duuk_private.whatsapp_config where singleton;
 if operation in ('receipt_claim','receipt_ack') then
  if payload->>'kind' not in ('read','typing') then raise exception 'Operação inválida.' using errcode='PT400';end if;
  select m.* into receipt from duuk_private.whatsapp_messages m join duuk_private.whatsapp_threads t on t.id=m.thread_id where m.id=(payload->>'id')::uuid and t.config_id=cfg.id and m.direction='in' and m.source='live' and m.provider_id is not null and m.type not in ('reaction','system','unsupported') and m.retracted_at is null for update of m;
  if receipt.id is null or receipt.occurred_at<now()-interval '30 days' then raise exception 'Esta mensagem não pode receber confirmação de leitura.' using errcode='PT409';end if;
  select * into thread from duuk_private.whatsapp_threads where id=receipt.thread_id;
  if cfg.status<>'connected' or cfg.credentials_id is null or cfg.token_expires_at<=now() then raise exception 'Conecte o WhatsApp antes de confirmar a leitura.' using errcode='PT409';end if;
  if operation='receipt_ack' then
   update duuk_private.whatsapp_messages set business_read_at=coalesce(business_read_at,now()) where thread_id=receipt.thread_id and direction='in' and source='live' and (occurred_at,sequence)<=(receipt.occurred_at,receipt.sequence);return '{}';
  end if;
  if payload->>'kind'='typing' then
   if thread.status<>'open' or thread.last_customer_at is null or thread.last_customer_at<now()-interval '23 hours 58 minutes' then raise exception 'Aguarde uma nova mensagem do cliente para responder.' using errcode='PT409';end if;
   if receipt.typing_last_at>now()-interval '25 seconds' then return jsonb_build_object('execute',false);end if;
   update duuk_private.whatsapp_messages set typing_last_at=now() where id=receipt.id;
  elsif receipt.business_read_at is not null then return jsonb_build_object('execute',false);end if;
  return jsonb_build_object('execute',true,'provider_id',receipt.provider_id);
 end if;
 if operation in ('sync_claim','sync_ack','sync_retry') then
  if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Somente um super administrador configura o WhatsApp.' using errcode='PT403';end if;
  if operation='sync_retry' then
   update duuk_private.whatsapp_sync_jobs set state='pending',last_error=null where config_id=cfg.id and generation=cfg.generation and state='failed';
   perform duuk_private.whatsapp_sync_drain(4);return '{}';
  end if;
  kind_value:=payload->>'kind';if kind_value not in ('contacts','history') then raise exception 'Sincronização inválida.' using errcode='PT400';end if;
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-sync-claim'));
  if operation='sync_claim' then
   if cfg.status<>'connected' or cfg.credentials_id is null then raise exception 'Conclua a conexão oficial antes de sincronizar.' using errcode='PT409';end if;
   onboarded:=(payload->>'onboarded_at')::timestamptz;
   if onboarded is null or onboarded>now()+interval '1 minute' or onboarded<now()-interval '24 hours' then raise exception 'A sincronização inicial precisa começar nas primeiras 24 horas da coexistência.' using errcode='PT409';end if;
   if cfg.onboarded_at is not null and abs(extract(epoch from cfg.onboarded_at-onboarded))>60 then raise exception 'A data do onboarding já foi registrada.' using errcode='PT409';end if;
   update duuk_private.whatsapp_config set onboarded_at=coalesce(onboarded_at,onboarded) where singleton;
   insert into duuk_private.whatsapp_sync_state(config_id,kind,state,requested_at) values(cfg.id,kind_value,'requesting',now()) on conflict do nothing;
   if not found then select * into sync_record from duuk_private.whatsapp_sync_state where config_id=cfg.id and kind=kind_value;return jsonb_build_object('execute',false,'state',sync_record.state);end if;
   return jsonb_build_object('execute',true,'generation',cfg.generation);
  end if;
  if cfg.generation is distinct from (payload->>'generation')::uuid then raise exception 'A conexão mudou. Confira a sincronização.' using errcode='PT409';end if;
  update duuk_private.whatsapp_sync_state set state=case when state in ('receiving','complete','declined') then state when coalesce((payload->>'uncertain')::boolean,false) then 'uncertain' when payload->>'error' is not null then 'failed' else 'requested' end,request_id=left(payload->>'request_id',255),last_error=left(payload->>'error',240) where config_id=cfg.id and kind=kind_value;
  return '{}';
 end if;
 if operation='ingest' then
  perform pg_advisory_xact_lock(hashtext('duuk-whatsapp-ingest'));
  if cfg.credentials_id is null or cfg.id is distinct from (payload->>'connection_id')::uuid or cfg.generation is distinct from (payload->>'generation')::uuid then return '{}';end if;
  -- Keep deletion tombstones even when a provider delivers the mutation before its original.
  for item in select value from jsonb_array_elements(coalesce(payload->'mutations','[]')) loop
   if (item->>'at')::timestamptz<now()-interval '90 days' then continue;end if;
   if (select count(*) from duuk_private.whatsapp_mutations)>=20000 and not exists(select 1 from duuk_private.whatsapp_mutations where config_id=cfg.id and provider_id=item->>'original' and contact=item->>'contact' and direction=item->>'direction') then raise exception 'A retenção gratuita de alterações atingiu a capacidade.' using errcode='PT507';end if;
   insert into duuk_private.whatsapp_mutations(config_id,provider_id,contact,direction,remove,body,occurred_at) values(cfg.id,item->>'original',item->>'contact',item->>'direction',(item->>'remove')::boolean,item->>'body',(item->>'at')::timestamptz)
    on conflict(config_id,provider_id,contact,direction) do update set remove=whatsapp_mutations.remove or excluded.remove,body=case when whatsapp_mutations.remove or excluded.remove then null else excluded.body end,occurred_at=greatest(whatsapp_mutations.occurred_at,excluded.occurred_at) where whatsapp_mutations.occurred_at<=excluded.occurred_at or excluded.remove;
  end loop;
  for batch in select value from jsonb_array_elements(coalesce(payload->'sync_batches','[]')) loop
   kind_value:=batch->>'kind';if kind_value not in ('contacts','history') then continue;end if;
   items_key:=case when kind_value='contacts' then 'contacts' else 'messages' end;
   chunk:=batch||jsonb_build_object(items_key,'[]'::jsonb);
   for item in select value from jsonb_array_elements(coalesce(batch->items_key,'[]')) loop
    if kind_value='history' and ((item->>'occurred_at')::timestamptz<now()-interval '90 days' or (item->>'occurred_at')::timestamptz>now()+interval '1 minute') then continue;end if;
    candidate:=jsonb_set(chunk,array[items_key],(chunk->items_key)||jsonb_build_array(item));
    if jsonb_array_length(chunk->items_key)>=100 or octet_length(candidate::text)>500000 then
     if jsonb_array_length(chunk->items_key)>0 then perform duuk_private.whatsapp_sync_enqueue(cfg.id,cfg.generation,kind_value,chunk);end if;
     chunk:=batch||jsonb_build_object(items_key,'[]'::jsonb);
     candidate:=jsonb_set(chunk,array[items_key],jsonb_build_array(item));
    end if;
    if octet_length(candidate::text)>500000 then raise exception 'Este item excede o limite gratuito de processamento.' using errcode='PT413';end if;
    chunk:=candidate;
   end loop;
   perform duuk_private.whatsapp_sync_enqueue(cfg.id,cfg.generation,kind_value,chunk);
  end loop;
  result:=duuk_private.whatsapp_backend_core(actor,operation,case when exists(select 1 from jsonb_array_elements(coalesce(payload->'sync_batches','[]')) b where b->>'kind'='contacts') then payload-'sync_batches'-'contacts' else payload-'sync_batches' end);
  return result;
 end if;
 result:=duuk_private.whatsapp_backend_core(actor,operation,payload);
 if operation='status' then
  update duuk_private.whatsapp_sync_state set state='uncertain',last_error='A solicitação pode ter sido aceita. Aguarde os eventos; não a repita na Meta.' where config_id=cfg.id and state='requesting' and requested_at<now()-interval '2 minutes';
  return result||jsonb_build_object('sync',jsonb_build_object('contacts',(select to_jsonb(s)-'config_id' from duuk_private.whatsapp_sync_state s where s.config_id=cfg.id and s.kind='contacts'),'history',(select to_jsonb(s)-'config_id' from duuk_private.whatsapp_sync_state s where s.config_id=cfg.id and s.kind='history'),'pending_batches',(select count(*) from duuk_private.whatsapp_sync_jobs where config_id=cfg.id and state='pending'),'failed_batches',(select count(*) from duuk_private.whatsapp_sync_jobs where config_id=cfg.id and state='failed'),'onboarded_at',cfg.onboarded_at));
 end if;
 return result;
end $$;
revoke all on function public.duuk_whatsapp_backend(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.duuk_whatsapp_backend(uuid,text,jsonb) to service_role;
select cron.schedule('duuk-whatsapp-sync','* * * * *','select duuk_private.whatsapp_sync_drain(4);');

create or replace function duuk_private.whatsapp_message_view(m duuk_private.whatsapp_messages,actor uuid) returns jsonb language sql stable set search_path='' as $$ select to_jsonb(m)-'request_hash'-'lease_id'-'config_generation'-'sha256'-'typing_last_at'||jsonb_build_object('starred',exists(select 1 from duuk_private.whatsapp_stars s where s.user_id=actor and s.message_id=m.id),'reactions',coalesce((select jsonb_agg(jsonb_build_object('sender',r.sender,'emoji',r.emoji)) from duuk_private.whatsapp_reactions r where r.message_id=m.id and r.emoji<>''),'[]')); $$;
