-- Coexistence fixtures only. No network, real contacts or money; every change rolls back.
begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r uuid:=gen_random_uuid();cfg uuid;gen uuid;s uuid;t uuid;mid uuid;c uuid;result jsonb;input jsonb;batch jsonb;lease uuid;outid uuid:=gen_random_uuid();begin
 insert into public.duuk_roles(id,name,description)values(r,'Fixture sync','Rollback only');
 insert into auth.users(id,email)values(u,u::text||'@test.invalid'),(v,v::text||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin)values(u,'Sync fixture',u::text||'@test.invalid',r,true,true),(v,'Member fixture',v::text||'@test.invalid',r,true,false);
 insert into public.duuk_role_permissions(role_id,permission,allowed)values(r,'whatsapp',true);
 select id,generation into cfg,gen from duuk_private.whatsapp_config where singleton;
 s:=vault.create_secret('{"access_token":"fixture","app_secret":"fixture"}');
 update duuk_private.whatsapp_config set status='connected',phone_id='123456',waba_id='234567',expected_phone='5511999990000',credentials_id=s,token_expires_at=now()+interval '1 hour',onboarded_at=null where singleton;
 begin perform public.duuk_whatsapp_backend(v,'sync_claim','{"kind":"history"}');raise exception 'Member requested initial import';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_whatsapp_backend(null,'sync_claim','{"kind":"history"}');raise exception 'Anonymous initial import';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_whatsapp_backend(u,'sync_claim',jsonb_build_object('kind','history','onboarded_at',now()-interval '25 hours'));raise exception 'Late initial import';exception when sqlstate 'PT409' then null;end;
 result:=public.duuk_whatsapp_backend(u,'sync_claim',jsonb_build_object('kind','history','onboarded_at',now()));if (result->>'execute')::boolean is not true then raise exception 'Missing durable claim';end if;
 result:=public.duuk_whatsapp_backend(u,'sync_claim',jsonb_build_object('kind','history','onboarded_at',now()));if (result->>'execute')::boolean then raise exception 'Initial import repeated';end if;
 perform public.duuk_whatsapp_backend(u,'sync_ack',jsonb_build_object('kind','history','generation',gen,'uncertain',true,'error','Fixture ambiguity'));
 result:=public.duuk_whatsapp_backend(u,'sync_claim',jsonb_build_object('kind','history','onboarded_at',now()));if (result->>'execute')::boolean then raise exception 'Ambiguous request retried';end if;
 batch:=jsonb_build_object('kind','history','phase',0,'chunk_order',1,'progress',55,'messages',jsonb_build_array(
  jsonb_build_object('provider_id','wamid.syncIncoming','from','5511999990011','direction','in','type','text','text','Imported today','occurred_at',now()-interval '1 minute','opens_window',true),
  jsonb_build_object('provider_id','wamid.syncOutgoing','from','5511999990011','direction','out','type','text','text','Imported outgoing','history_status','READ','occurred_at',now()-interval '2 minutes'),
  jsonb_build_object('provider_id','wamid.syncPlaceholder','from','5511999990011','direction','out','type','media_placeholder','history_status','DELIVERED','occurred_at',now()-interval '3 minutes'),
  jsonb_build_object('provider_id','wamid.syncTooOld','from','5511999990011','direction','in','type','text','text','Must discard','occurred_at',now()-interval '91 days')));
 input:=jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch));
 perform public.duuk_whatsapp_backend(null,'ingest',input);perform public.duuk_whatsapp_backend(null,'ingest',input);
 if (select count(*) from duuk_private.whatsapp_sync_jobs where config_id=cfg)<>1 then raise exception 'Duplicate batch stored';end if;
 if exists(select 1 from duuk_private.whatsapp_sync_jobs where payload::text like '%wamid.syncTooOld%')then raise exception 'Expired content persisted in queue';end if;
 if exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncIncoming')then raise exception 'Hook depends on synchronous processing';end if;
 perform duuk_private.whatsapp_sync_drain(4);
 select thread_id,id into t,mid from duuk_private.whatsapp_messages where provider_id='wamid.syncIncoming';
 if (select last_customer_at from duuk_private.whatsapp_threads where id=t) is not null then raise exception 'Imported history opened paid-risk window';end if;
 if (select source from duuk_private.whatsapp_messages where id=mid)<>'history' then raise exception 'Missing history provenance';end if;
 if exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncTooOld')then raise exception 'Imported outside retention';end if;
 if (select status from duuk_private.whatsapp_messages where provider_id='wamid.syncOutgoing')<>'READ' then raise exception 'Provider history receipt lost';end if;
 result:=public.duuk_whatsapp_backend(v,'threads','{"filter":"all"}');if (select (x->>'unread')::int from jsonb_array_elements(result->'items')x where x->>'id'=t::text)<>0 then raise exception 'History inflated unread';end if;
 begin perform public.duuk_whatsapp_backend(u,'send_begin',jsonb_build_object('thread_id',t,'id',outid,'type','text','text','No free window','request_hash','fixture'));raise exception 'History enabled sending';exception when sqlstate 'PT409' then null;end;
 -- Separate signed media completion enriches a placeholder, without changing sender direction.
 batch:=jsonb_build_object('kind','history','media',true,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.syncPlaceholder','from','5511999990011','direction','in','history_media',true,'type','image','media_id','345678','mime','image/jpeg','text','Asset caption','occurred_at',now()-interval '3 minutes')));
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch)));perform duuk_private.whatsapp_sync_drain(4);
 if not exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncPlaceholder' and direction='out' and type='image' and media_id='345678' and status='DELIVERED')then raise exception 'Media placeholder lost direction or receipt';end if;
 -- A standalone media event arriving first must wait for the canonical sender/thread message.
 batch:=jsonb_build_object('kind','history','media',true,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.syncAssetFirst','from','5511999990011','direction','in','history_media',true,'type','image','media_id','456789','mime','image/jpeg','text','Hidden until base','occurred_at',now()-interval '2 days')));
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch)));perform duuk_private.whatsapp_sync_drain(4);
 if exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncAssetFirst')then raise exception 'Asset appeared before canonical direction was known';end if;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'mutations',jsonb_build_array(jsonb_build_object('original','wamid.syncAssetFirst','contact','5511999990011','direction','out','at',now(),'remove',true))));
 batch:=jsonb_build_object('kind','history','phase',0,'chunk_order',3,'progress',90,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.syncAssetFirst','from','5511999990011','direction','out','type','media_placeholder','history_status','SENT','occurred_at',now()-interval '1 day')));
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch)));perform duuk_private.whatsapp_sync_drain(4);
 if not exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncAssetFirst' and direction='out' and retracted_at is not null and media_id is null and body='')then raise exception 'Attachment before base bypassed deletion';end if;
 if exists(select 1 from duuk_private.whatsapp_sync_jobs where state='pending' and payload->'messages' @> '[{"provider_id":"wamid.syncAssetFirst"}]')then raise exception 'Matched media remained queued';end if;
 -- Deletion arriving first must suppress the original, including a later imported media asset.
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'mutations',jsonb_build_array(jsonb_build_object('original','wamid.syncRemovedBefore','contact','5511999990011','direction','in','at',now(),'remove',true))));
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.syncRemovedBefore','from','5511999990011','direction','in','type','location','text','Must not return','details',jsonb_build_object('latitude',1,'longitude',2),'occurred_at',now(),'opens_window',false))));
 if not exists(select 1 from duuk_private.whatsapp_messages where provider_id='wamid.syncRemovedBefore' and retracted_at is not null and body='' and details is null)then raise exception 'Deleted original resurrected';end if;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'mutations',jsonb_build_array(jsonb_build_object('original','wamid.syncEditBefore','contact','5511999990011','direction','in','at',now(),'remove',false,'body','Edited before original'))));
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.syncEditBefore','from','5511999990011','direction','in','type','text','text','Original','occurred_at',now(),'opens_window',false))));
 if (select body from duuk_private.whatsapp_messages where provider_id='wamid.syncEditBefore')<>'Edited before original' then raise exception 'Early edit lost';end if;
 -- A queue can be retried locally after failure; it never replays the external sync request.
 update duuk_private.whatsapp_sync_jobs set state='failed',payload=jsonb_build_object('kind','history','messages','[]'::jsonb),last_error='Fixture' where config_id=cfg;
 perform public.duuk_whatsapp_backend(u,'sync_retry');
 if exists(select 1 from duuk_private.whatsapp_sync_jobs where config_id=cfg and state<>'complete')then raise exception 'Local retry did not process';end if;
 -- Complete and declined are provider events, never fabricated merely because a request was accepted.
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(jsonb_build_object('kind','history','phase',1,'chunk_order',2,'progress',100,'messages','[]'::jsonb))));perform duuk_private.whatsapp_sync_drain(4);
 result:=public.duuk_whatsapp_backend(u,'status');if result->'sync'->'history'->>'state'<>'complete' then raise exception 'Completion metadata lost';end if;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(jsonb_build_object('kind','history','declined',true,'messages','[]'::jsonb))));perform duuk_private.whatsapp_sync_drain(4);
 result:=public.duuk_whatsapp_backend(u,'status');if result->'sync'->'history'->>'state'<>'declined' then raise exception 'Consent refusal ignored';end if;
 -- Contact book state is durable, preserves DUUK edits and never deletes history on remote removal.
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(jsonb_build_object('kind','contacts','contacts',jsonb_build_array(jsonb_build_object('wa_id','5511999990022','name','Phone book','at',now()))))));perform duuk_private.whatsapp_sync_drain(4);
 select id into c from duuk_private.whatsapp_contacts where wa_id='5511999990022';if c is null then raise exception 'Contact sync missing';end if;
 update duuk_private.whatsapp_contacts set custom_name=true,name='DUUK manual name' where id=c;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(jsonb_build_object('kind','contacts','contacts',jsonb_build_array(jsonb_build_object('wa_id','5511999990022','name','Phone changed','at',now()+interval '1 second'))))));perform duuk_private.whatsapp_sync_drain(4);
 if (select name from duuk_private.whatsapp_contacts where id=c)<>'DUUK manual name' then raise exception 'Contact sync overwrote local name';end if;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(jsonb_build_object('kind','contacts','contacts',jsonb_build_array(jsonb_build_object('wa_id','5511999990022','removed',true,'at',now()+interval '2 seconds'))))));perform duuk_private.whatsapp_sync_drain(4);
 if (select remote_removed from duuk_private.whatsapp_contacts where id=c) is not true then raise exception 'Remote removal not recorded';end if;
 -- Read receipts require an incoming live message. Imported data cannot fabricate a read in Meta.
 begin perform public.duuk_whatsapp_backend(u,'receipt_claim',jsonb_build_object('id',mid,'kind','read'));raise exception 'Historical read allowed';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'messages',jsonb_build_array(jsonb_build_object('provider_id','wamid.receiptIncoming','from','5511999990011','direction','in','type','text','text','Visible in central','occurred_at',now(),'opens_window',true))));
 select id into mid from duuk_private.whatsapp_messages where provider_id='wamid.receiptIncoming';
 result:=public.duuk_whatsapp_backend(u,'receipt_claim',jsonb_build_object('id',mid,'kind','typing'));if (result->>'execute')::boolean is not true then raise exception 'Typing unavailable';end if;
 result:=public.duuk_whatsapp_backend(u,'receipt_claim',jsonb_build_object('id',mid,'kind','typing'));if (result->>'execute')::boolean then raise exception 'Typing rate limit bypass';end if;
 if (select business_read_at from duuk_private.whatsapp_messages where id=mid) is not null then raise exception 'Unconfirmed read manufactured';end if;
 perform public.duuk_whatsapp_backend(u,'receipt_ack',jsonb_build_object('id',mid,'kind','read'));
 result:=public.duuk_whatsapp_backend(u,'receipt_claim',jsonb_build_object('id',mid,'kind','read'));if (result->>'execute')::boolean then raise exception 'Read unnecessarily repeated';end if;
 -- Explicit free replies can send a validated location/card, using the same durable send lease.
 update duuk_private.whatsapp_threads set last_customer_at=now() where id=t;
 input:=jsonb_build_object('thread_id',t,'id',outid,'type','location','text','Studio','request_hash','location-fixture','details',jsonb_build_object('latitude',-23.5,'longitude',-46.6,'name','Studio'));
 result:=public.duuk_whatsapp_backend(u,'send_begin',input);lease:=(result->'internal'->>'lease_id')::uuid;
 result:=public.duuk_whatsapp_backend(u,'send_dispatch',jsonb_build_object('id',outid,'lease_id',lease));if result->'details'->>'name'<>'Studio' then raise exception 'Location reply details lost';end if;
 result:=public.duuk_whatsapp_backend(u,'send_begin',jsonb_build_object('thread_id',t,'id',gen_random_uuid(),'type','interactive','text','Escolha','request_hash','interactive-fixture','details',jsonb_build_object('kind','buttons','body','Escolha','options',jsonb_build_array(jsonb_build_object('id','one','title','Sim')))));outid:=(result->'internal'->>'id')::uuid;lease:=(result->'internal'->>'lease_id')::uuid;
 result:=public.duuk_whatsapp_backend(u,'send_dispatch',jsonb_build_object('id',outid,'lease_id',lease));if result->>'status'<>'SENDING' or result->'details'->>'kind'<>'buttons' then raise exception 'Free interactive dispatch failed';end if;
 -- Batch boundaries use actual UTF-8 octets, including large cards and astral emoji.
 select jsonb_build_object('kind','history','phase',1,'chunk_order',10,'progress',100,'messages',jsonb_agg(jsonb_build_object('provider_id','wamid.multibyte_'||i,'from','5511999990011','direction','in','type','text','text',repeat('🎥',4096),'occurred_at',now()-interval '1 day')))into batch from generate_series(1,100)i;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch)));
 if (select count(*) from duuk_private.whatsapp_sync_jobs where payload->>'chunk_order'='10')<3 then raise exception 'Unicode batch was not split by bytes';end if;
 select jsonb_build_object('kind','history','phase',1,'chunk_order',11,'progress',100,'messages',jsonb_agg(jsonb_build_object('provider_id','wamid.largeCard_'||i,'from','5511999990011','direction','in','type','contacts','text','Large card','details',jsonb_build_object('contacts',jsonb_build_array(jsonb_build_object('name',repeat('🎥',4000)))),'occurred_at',now()-interval '1 day')))into batch from generate_series(1,100)i;
 perform public.duuk_whatsapp_backend(null,'ingest',jsonb_build_object('connection_id',cfg,'generation',gen,'sync_batches',jsonb_build_array(batch)));
 if exists(select 1 from duuk_private.whatsapp_sync_jobs where octet_length(payload::text)>512000)then raise exception 'Oversize UTF-8 persisted';end if;
 if (select sum(jsonb_array_length(payload->'messages')) from duuk_private.whatsapp_sync_jobs where payload->>'chunk_order' in ('10','11'))<>200 then raise exception 'Adaptive splitting lost messages';end if;
 if has_function_privilege('authenticated','duuk_private.whatsapp_backend_core(uuid,text,jsonb)','execute') or has_function_privilege('service_role','duuk_private.whatsapp_sync_drain(integer)','execute') or has_table_privilege('authenticated','duuk_private.whatsapp_sync_jobs','select')then raise exception 'Private sync internals exposed';end if;
end $$;
rollback;
