-- Preserve provider batch arrival order when timestamps have only second precision.
alter table duuk_private.whatsapp_messages add column sequence bigint generated always as identity;
revoke all on sequence duuk_private.whatsapp_messages_sequence_seq from public,anon,authenticated;
drop index duuk_private.whatsapp_messages_thread_idx;
create index whatsapp_messages_thread_idx on duuk_private.whatsapp_messages(thread_id,occurred_at desc,sequence desc,id desc);
create or replace function public.duuk_whatsapp_backend(actor uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
    (select count(*) from duuk_private.whatsapp_messages m2 where m2.thread_id=t2.id and m2.direction='in' and (m2.type<>'reaction' or m2.direction='out' and m2.status in ('PREPARING','SENDING','UNCERTAIN','FAILED')) and m2.occurred_at>coalesce((select seen_at from duuk_private.whatsapp_reads r where r.user_id=actor and r.thread_id=t2.id),'-infinity')) as unread
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
  if payload->>'type' not in ('text','image','audio','video','document','sticker','reaction') then raise exception 'Somente respostas gratuitas são permitidas.' using errcode='PT400';end if;
  if exists(select 1 from duuk_private.whatsapp_messages where thread_id=t.id and request_hash=payload->>'request_hash' and status in ('PREPARING','SENDING','UNCERTAIN')) then raise exception 'Uma mensagem igual ainda está em confirmação. Confira a tentativa anterior.' using errcode='PT409';end if;
  if (select count(*) from duuk_private.whatsapp_messages)>=10000 then raise exception 'O histórico atingiu o limite gratuito. Consulte o administrador.' using errcode='PT507';end if;
  if payload->>'reply_to' is not null then
   select * into target from duuk_private.whatsapp_messages where id=(payload->>'reply_to')::uuid and thread_id=t.id and provider_id is not null and type not in ('reaction','system','unsupported') and retracted_at is null;
   if target.id is null then raise exception 'A mensagem original não está disponível nesta conversa.' using errcode='PT409';end if;
   if payload->>'type'='reaction' and target.occurred_at<now()-interval '30 days' then raise exception 'O WhatsApp não permite reagir a esta mensagem antiga.' using errcode='PT409';end if;
  end if;
  nonce:=gen_random_uuid();
  insert into duuk_private.whatsapp_messages(id,thread_id,direction,type,body,status,request_hash,actor_id,config_generation,lease_id,mime,filename,byte_size,sha256,context_provider_id,emoji)
   values((payload->>'id')::uuid,t.id,'out',payload->>'type',coalesce(payload->>'text',''),'PREPARING',payload->>'request_hash',actor,cfg.generation,nonce,payload->>'mime',payload->>'filename',(payload->>'byte_size')::integer,payload->>'sha256',target.provider_id,payload->>'emoji') returning * into m;
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
   if m.status<>'PREPARING' or m.type not in ('text','reaction') and m.media_id is null then raise exception 'O envio já começou ou a mídia está incompleta.' using errcode='PT409';end if;
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
   insert into duuk_private.whatsapp_messages(thread_id,provider_id,direction,type,body,status,media_id,mime,filename,sha256,context_provider_id,emoji,occurred_at)
    values(t.id,item->>'provider_id',case when item->>'direction'='out' then 'out' else 'in' end,item->>'type',coalesce(item->>'text',''),case when item->>'direction'='out' then 'SENT' else 'RECEIVED' end,item->>'media_id',item->>'mime',item->>'filename',item->>'sha256',item->>'context_id',item->>'emoji',least(when_at,now())) returning * into m;
   if m.type='reaction' then
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select id,case when m.direction='out' then 'business' else c.wa_id end,coalesce(m.emoji,''),m.occurred_at from duuk_private.whatsapp_messages where provider_id=m.context_provider_id and thread_id=t.id
     on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
   else
    insert into duuk_private.whatsapp_reactions(message_id,sender,emoji,occurred_at) select distinct on (x.direction) m.id,case when x.direction='in' then c.wa_id else 'business' end,coalesce(x.emoji,''),x.occurred_at from duuk_private.whatsapp_messages x where x.thread_id=t.id and x.type='reaction' and x.context_provider_id=m.provider_id and (x.direction='in' or x.status in ('SENT','DELIVERED','READ')) order by x.direction,x.occurred_at desc on conflict(message_id,sender) do update set emoji=excluded.emoji,occurred_at=excluded.occurred_at where whatsapp_reactions.occurred_at<=excluded.occurred_at;
    update duuk_private.whatsapp_threads set last_customer_at=case when m.direction='in' and coalesce((item->>'opens_window')::boolean,false) then greatest(last_customer_at,m.occurred_at) else last_customer_at end,last_message_at=greatest(last_message_at,m.occurred_at),preview=case when last_message_at is null or last_message_at<=m.occurred_at then left(coalesce(nullif(m.body,''),m.filename,m.type),160) else preview end,status=case when coalesce((item->>'opens_window')::boolean,false) then 'open' else status end,version=version+1,updated_at=greatest(updated_at,m.occurred_at) where id=t.id;
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
   update duuk_private.whatsapp_threads set last_message_at=greatest(last_message_at,m.occurred_at),preview=case when last_message_at is null or last_message_at<=m.occurred_at then left(coalesce(nullif(m.body,''),m.filename,m.type),160) else preview end,updated_at=now() where id=m.thread_id;
  end loop;
  return '{}';
 end if;
 raise exception 'Operação não permitida.' using errcode='PT400';
exception when unique_violation then raise exception 'Este telefone ou identificador já está cadastrado. Atualize a lista.' using errcode='PT409';
end $$;
