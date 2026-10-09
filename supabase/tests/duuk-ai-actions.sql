-- Run after duuk-ai-actions.sql and duuk-ai-actions-lock.sql. Synthetic accounts, actions, calendar queue,
-- business records and notifications are contained in this rollback transaction.
begin;
create function pg_temp.ai_action_fixture(actor uuid,content text,tools jsonb,status text default 'complete') returns jsonb
 language plpgsql set search_path='' as $$
declare started jsonb; rid uuid:=gen_random_uuid(); begin
 started:=public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',actor,'request_id',rid,'message',content,'mode','free','selected_model','gemini-3.5-flash-lite'));
 return public.duuk_ai_action_backend('finish',jsonb_build_object('user_id',actor,'request_id',rid,'lease_id',started->'request'->>'lease_id',
  'content',content,'status',status,'model','gemini-3.5-flash-lite','prompt_version','test-actions','usage_known',true,'tokens_input',20,'tokens_output',30,'tool_calls',tools));
end;
$$;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid(); restricted uuid:=gen_random_uuid(); v_client_id uuid:=gen_random_uuid(); client2 uuid:=gen_random_uuid();
 receipt jsonb; again jsonb; draft jsonb; proposal jsonb; request jsonb; result jsonb; options jsonb; query jsonb;
 action_id uuid; second_id uuid; v_event_id uuid; followup_id uuid; execution uuid; original_actor text; old_version bigint; day date;
 consent_version text; owner_name text; client_name text; listing jsonb; count_before bigint; req_id uuid; c_id uuid; m_id uuid; started jsonb;
begin
 insert into public.duuk_roles(id,name) values(r,'AI actions fixture '||r),(restricted,'AI restricted fixture '||restricted);
 insert into public.duuk_role_permissions(role_id,permission,allowed)
  select r,key,true from public.duuk_permission_keys where key in ('ai','agenda','finance','crm','crm.followups');
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(restricted,'ai',true);
 insert into auth.users(id,email) values(a,a||'@test.invalid'),(b,b||'@test.invalid'),(p,p||'@test.invalid'),(p2,p2||'@test.invalid'),(disabled,disabled||'@test.invalid');
 owner_name:='Responsável fixture '||p;client_name:='Cliente fixture '||v_client_id;
 insert into public.duuk_profiles(id,name,email,role_id,active) values
  (a,'Solicitante fixture '||a,a||'@test.invalid',r,true),(b,'Restrito fixture '||b,b||'@test.invalid',restricted,true),
  (p,owner_name,p||'@test.invalid',r,true),(p2,'Responsável fixture '||p2,p2||'@test.invalid',r,true),
  (disabled,'Desativado fixture '||disabled,disabled||'@test.invalid',r,false);
 update duuk_private.ai_settings set requests_per_minute=60,requests_per_day=100,tokens_per_day=1000000 where singleton=true;
 consent_version:=public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',a))->>'version';
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'version',consent_version,'accepted',true));
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',b,'version',consent_version,'accepted',true));
 insert into public.duuk_clients(id,name,created_by) values(v_client_id,client_name,a),(client2,'Cliente fixture '||client2,a);
 -- A fake connection only tests the official transactional queue. No worker can
 -- see this uncommitted account or send these records to Google.
 insert into public.duuk_calendar_connections(user_id,google_subject,account_email,calendar_id)
  values(a,'fixture-'||a,a||'@test.invalid','fixture-calendar-'||a);
 day:=(now() at time zone 'America/Sao_Paulo')::date+10;
 if has_function_privilege('anon','public.duuk_ai_action_backend(text,jsonb)','execute') or has_function_privilege('authenticated','public.duuk_ai_action_backend(text,jsonb)','execute') then raise exception 'Action RPC exposed to browser';end if;
 if has_table_privilege('anon','duuk_private.ai_actions','select') or has_table_privilege('authenticated','duuk_private.ai_actions','insert')
  or has_table_privilege('authenticated','duuk_private.ai_actions','select') then raise exception 'Action journal exposed';end if;
 if not (select relrowsecurity from pg_class where oid='duuk_private.ai_actions'::regclass) then raise exception 'Action journal has no RLS';end if;
 begin perform public.duuk_ai_action_backend('options',jsonb_build_object('user_id',disabled));raise exception 'Disabled member used tools';exception when sqlstate 'PT403' then null;end;
 options:=public.duuk_ai_action_backend('options',jsonb_build_object('user_id',b));
 if jsonb_array_length(options->'people')<>0 or jsonb_array_length(options->'clients')<>0 then raise exception 'Directory leaked without module permission';end if;
 options:=public.duuk_ai_action_backend('options',jsonb_build_object('user_id',a,'term',v_client_id::text));
 if jsonb_array_length(options->'clients')<>1 or options->'clients'->0->>'id'<>v_client_id::text then raise exception 'Authorized bounded client search failed';end if;
 if exists(select 1 from jsonb_array_elements(options->'people') x where x->>'id'=disabled::text) then raise exception 'Inactive person returned';end if;
 if exists(select 1 from jsonb_array_elements(options->'clients') x where exists(select 1 from jsonb_object_keys(x) k where k not in ('id','name','version'))) then raise exception 'Client options exposed unnecessary fields';end if;

 -- Seed this isolated proposal directly so no begin_generation call has yet
 -- acquired a conversation row lock in this transaction. Confirmation must
 -- obtain the row lock that serializes it with regeneration and deletion.
 c_id:=gen_random_uuid();m_id:=gen_random_uuid();req_id:=gen_random_uuid();action_id:=gen_random_uuid();
 insert into public.duuk_ai_conversations(id,user_id,title) values(c_id,a,'Conversation lock fixture');
 insert into public.duuk_ai_messages(id,conversation_id,role,content) values(m_id,c_id,'assistant','Ação isolada para confirmar.');
 insert into public.duuk_ai_requests(id,user_id,conversation_id,assistant_message_id,payload_hash,status)
  values(req_id,a,c_id,m_id,'lock-fixture','complete');
 insert into duuk_private.ai_actions(id,user_id,conversation_id,message_id,request_id,ordinal,kind,payload)
  values(action_id,a,c_id,m_id,req_id,1,'expense.create',jsonb_build_object('title','Lock expense fixture '||a,'amount_cents',100,'due_date',day));
 result:=public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));
 if result->'action'->>'status'<>'completed' or not exists(select 1 from pg_locks
  where pid=pg_backend_pid() and relation='public.duuk_ai_conversations'::regclass and mode='RowShareLock' and granted) then
  raise exception 'Confirmation did not lock the conversation before committing';
 end if;

 -- An incomplete draft is preserved for editing, while invalid tools do not
 -- erase the successfully persisted assistant message or consume another call.
 receipt:=pg_temp.ai_action_fixture(a,'Preparar compromisso fictício',jsonb_build_array(
  jsonb_build_object('kind','agenda.create','payload',jsonb_build_object('title','Compromisso AI fixture '||a,'responsible_hint','Responsável')),
  jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Inválida','amount_cents',-1)),
  jsonb_build_object('kind','mail.send','payload','{}'::jsonb)));
 if receipt->'message'->>'id' is null or jsonb_array_length(receipt->'actions')<>1 or jsonb_array_length(receipt->'action_errors')<>2 then raise exception 'Invalid proposal erased response or escaped whitelist';end if;
 draft:=receipt->'actions'->0;action_id:=(draft->>'id')::uuid;
 if draft->>'status'<>'pending' or draft->'payload'->>'responsible_id' is not null then raise exception 'Ambiguous explicit person silently became actor';end if;
 if exists(select 1 from public.duuk_events where title='Compromisso AI fixture '||a) then raise exception 'Proposal mutated agenda before confirmation';end if;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));raise exception 'Incomplete draft executed';exception when sqlstate 'PT400' then null;end;
 again:=public.duuk_ai_action_backend('finish',jsonb_build_object('user_id',a,'request_id',receipt->>'request_id','tool_calls',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Replay injection')))));
 if again->'message'->>'id'<>receipt->'message'->>'id' or again->'actions'<>receipt->'actions' then raise exception 'Finish replay created different actions';end if;
 begin perform public.duuk_ai_action_backend('list',jsonb_build_object('user_id',b,'conversation_id',receipt->>'conversation_id'));raise exception 'Conversation actions crossed owners';exception when sqlstate 'PT404' then null;end;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',b,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));raise exception 'Action crossed owners';exception when sqlstate 'PT404' then null;end;
 execution:=gen_random_uuid();request:=jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',execution,
  'changes',jsonb_build_object('start_date',day,'end_date',day,'all_day',false,'start_time','09:30','end_time','10:30','responsible_id',p));
 begin perform public.duuk_ai_action_backend('execute',request||jsonb_build_object('confirmed',false));raise exception 'Action skipped confirmation';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_ai_action_backend('execute',request||jsonb_build_object('changes',request->'changes'||jsonb_build_object('created_by',b)));raise exception 'Actor field injected through changes';exception when sqlstate 'PT400' then null;end;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(a,'agenda',false);
 begin perform public.duuk_ai_action_backend('execute',request);raise exception 'Revoked module permission ignored';exception when sqlstate 'PT403' then null;end;
 update public.duuk_user_permissions set allowed=true where user_id=a and permission='agenda';
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'version',consent_version,'accepted',false));
 begin perform public.duuk_ai_action_backend('execute',request);raise exception 'Revoked privacy consent ignored';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'version',consent_version,'accepted',true));
 original_actor:=b::text;perform set_config('request.jwt.claim.sub',original_actor,true);
 result:=public.duuk_ai_action_backend('execute',request);v_event_id:=(result->'action'->'result'->'event'->>'id')::uuid;
 if result->'action'->>'status'<>'completed' or v_event_id is null or result->'action'->'result'->>'link'<>'/admin/agenda?dia='||day then raise exception 'Agenda result not authoritative';end if;
 if current_setting('request.jwt.claim.sub',true)<>original_actor then raise exception 'RPC identity leaked into caller transaction';end if;
 if not exists(select 1 from public.duuk_events where id=v_event_id and created_by=a and responsible_id=p and start_time=time '09:30') then raise exception 'Agenda fields or actor attribution changed';end if;
 if not exists(select 1 from public.duuk_audit where entity='duuk_events' and entity_id=v_event_id::text and actor_id=a) then raise exception 'Official audit missing actor';end if;
 if not exists(select 1 from public.duuk_calendar_sync where user_id=a and event_id=v_event_id and status='pending') then raise exception 'Official outbound calendar queue skipped';end if;
 if not exists(select 1 from public.duuk_notifications where user_id=p and dedupe_key='agenda:assigned:'||v_event_id||':1') then raise exception 'Official assignment notification skipped';end if;
 again:=public.duuk_ai_action_backend('execute',request);
 if again<>result or (select count(*) from public.duuk_events where title='Compromisso AI fixture '||a)<>1 then raise exception 'Agenda replay duplicated a record';end if;
 begin perform public.duuk_ai_action_backend('execute',request||jsonb_build_object('changes',request->'changes'||jsonb_build_object('title','Changed replay')));raise exception 'Replay ignored changed payload';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_action_backend('execute',request||jsonb_build_object('client_request_id',gen_random_uuid()));raise exception 'Replay ignored changed request ID';exception when sqlstate 'PT409' then null;end;
 update public.duuk_user_permissions set allowed=false where user_id=a and permission='agenda';
 begin perform public.duuk_ai_action_backend('execute',request);raise exception 'Completed replay bypassed fresh permission';exception when sqlstate 'PT403' then null;end;
 update public.duuk_user_permissions set allowed=true where user_id=a and permission='agenda';
 if public.duuk_ai_action_backend('cancel',jsonb_build_object('user_id',a,'id',action_id))<>result then raise exception 'Cancel after lost response hid completed result';end if;

 -- Exact names resolve; ambiguous or missing names remain editable, never
 -- silently assigned. Expense drafts similarly require amount and due date.
 receipt:=pg_temp.ai_action_fixture(a,'Preparar despesa fictícia',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Despesa AI fixture '||a))));
 draft:=receipt->'actions'->0;second_id:=(draft->>'id')::uuid;
 if draft->'payload'->>'amount_cents' is not null then raise exception 'Missing price fabricated';end if;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',second_id,'confirmed',true,'client_request_id',execution,'changes',jsonb_build_object('amount_cents',12345,'due_date',day)));raise exception 'Execution ID crossed actions';exception when sqlstate 'PT409' then null;end;
 request:=jsonb_build_object('user_id',a,'id',second_id,'confirmed',true,'client_request_id',gen_random_uuid(),'changes',jsonb_build_object('amount_cents',12345,'due_date',day,'status','paid','paid_date',day));
 result:=public.duuk_ai_action_backend('execute',request);
 if result->'action'->'result'->'expense'->>'created_by'<>a::text or result->'action'->'result'->'expense'->>'amount_cents'<>'12345' then raise exception 'Expense result lost amount or actor';end if;
 if public.duuk_ai_action_backend('execute',request)<>result then raise exception 'Expense replay changed result';end if;
 receipt:=pg_temp.ai_action_fixture(a,'Cancelar rascunho fictício',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Cancelada AI fixture '||a))));
 second_id:=(receipt->'actions'->0->>'id')::uuid;
 result:=public.duuk_ai_action_backend('cancel',jsonb_build_object('user_id',a,'id',second_id));
 if result->'action'->>'status'<>'cancelled' or public.duuk_ai_action_backend('cancel',jsonb_build_object('user_id',a,'id',second_id))<>result then raise exception 'Cancellation not idempotent';end if;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',second_id,'confirmed',true,'client_request_id',gen_random_uuid(),'changes',jsonb_build_object('amount_cents',100,'due_date',day)));raise exception 'Cancelled action executed';exception when sqlstate 'PT409' then null;end;

 select version into old_version from public.duuk_clients where id=v_client_id;
 receipt:=pg_temp.ai_action_fixture(a,'Preparar follow-up fictício',jsonb_build_array(jsonb_build_object('kind','followup.create','payload',
  jsonb_build_object('client_hint',upper(client_name),'owner_hint',upper(owner_name),'notes','Retomar conversa fictícia','due_at',to_char(day,'YYYY-MM-DD')||'T10:00:00-03:00'))));
 proposal:=receipt->'actions'->0;action_id:=(proposal->>'id')::uuid;
 if proposal->'payload'->>'client_id'<>v_client_id::text or proposal->'payload'->>'owner_id'<>p::text or (proposal->'payload'->>'client_version')::bigint<>old_version then raise exception 'Exact casefold name resolution failed';end if;
 if (proposal->'payload'->>'due_at')::timestamptz<>((day+time '10:00') at time zone 'America/Sao_Paulo') then raise exception 'Brasilia date shifted';end if;
 update public.duuk_clients set city='Fixture changed' where id=v_client_id;
 request:=jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid());
 begin perform public.duuk_ai_action_backend('execute',request);raise exception 'Changed client revision accepted';exception when sqlstate 'PT409' then null;end;
 request:=request||jsonb_build_object('changes',jsonb_build_object('client_version',(select version from public.duuk_clients where id=v_client_id)));
 result:=public.duuk_ai_action_backend('execute',request);followup_id:=(result->'action'->'result'->'followup'->>'id')::uuid;
 if followup_id is null or not exists(select 1 from public.duuk_follow_ups where id=followup_id and client_id=v_client_id and owner_id=p) then raise exception 'Follow-up result invalid';end if;
 -- Follow-up creation updates the client's summary/version via the existing
 -- trigger. A confirmed replay must return success before rechecking that version.
 if public.duuk_ai_action_backend('execute',request)<>result or (select count(*) from public.duuk_follow_ups where id=followup_id)<>1 then raise exception 'Client trigger invalidated follow-up replay';end if;
 receipt:=pg_temp.ai_action_fixture(a,'Follow-up com nomes ambíguos',jsonb_build_array(jsonb_build_object('kind','followup.create','payload',jsonb_build_object('client_hint','Cliente','owner_hint','Responsável'))));
 if receipt->'actions'->0->'payload'->>'client_id' is not null or receipt->'actions'->0->'payload'->>'owner_id' is not null then raise exception 'Ambiguous follow-up names silently resolved';end if;

 -- Stale, expired, revoked and partial generations cannot produce executable
 -- cards. Superseded assistant messages disappear from list and execution.
 receipt:=pg_temp.ai_action_fixture(a,'Expirar rascunho',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Expirada AI fixture '||a,'amount_cents',100,'due_date',day))));
 action_id:=(receipt->'actions'->0->>'id')::uuid;update duuk_private.ai_actions set expires_at=now()-interval '1 second' where id=action_id;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));raise exception 'Expired action executed';exception when sqlstate 'PT409' then null;end;
 update public.duuk_ai_messages set superseded_at=now() where id=(receipt->'message'->>'id')::uuid;
 if jsonb_array_length(public.duuk_ai_action_backend('list',jsonb_build_object('user_id',a,'conversation_id',receipt->>'conversation_id'))->'actions')<>0 then raise exception 'Superseded action listed';end if;
 begin perform public.duuk_ai_action_backend('cancel',jsonb_build_object('user_id',a,'id',action_id));raise exception 'Superseded action remained active';exception when sqlstate 'PT404' then null;end;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));raise exception 'Superseded action executed';exception when sqlstate 'PT404' then null;end;
 -- Use the real regeneration RPC instead of only changing superseded_at by
 -- hand. Its conversation lock and message update invalidate the old card.
 receipt:=pg_temp.ai_action_fixture(a,'Regenerar proposta fictícia',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Regenerate expense fixture '||a,'amount_cents',100,'due_date',day))));
 action_id:=(receipt->'actions'->0->>'id')::uuid;c_id:=(receipt->>'conversation_id')::uuid;req_id:=gen_random_uuid();
 started:=public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',req_id,'conversation_id',c_id,'regenerate',true,'mode','free'));
 if jsonb_array_length(public.duuk_ai_action_backend('list',jsonb_build_object('user_id',a,'conversation_id',c_id))->'actions')<>0 then raise exception 'Regeneration retained old card';end if;
 begin perform public.duuk_ai_action_backend('execute',jsonb_build_object('user_id',a,'id',action_id,'confirmed',true,'client_request_id',gen_random_uuid()));raise exception 'Regenerated action executed';exception when sqlstate 'PT404' then null;end;
 perform public.duuk_ai_action_backend('finish',jsonb_build_object('user_id',a,'request_id',req_id,'lease_id',started->'request'->>'lease_id','content','Resposta regenerada sem ação.',
  'status','complete','model','gemini-3.5-flash-lite','prompt_version','test-actions','usage_known',true,'tokens_input',20,'tokens_output',30,'tool_calls','[]'::jsonb));
 receipt:=pg_temp.ai_action_fixture(a,'Resposta parcial fictícia',jsonb_build_array(jsonb_build_object('kind','agenda.create','payload',jsonb_build_object('title','Partial must not create'))),'partial');
 if jsonb_array_length(receipt->'actions')<>0 or receipt->'message'->>'status'<>'partial' then raise exception 'Partial response produced action';end if;
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'version',consent_version,'accepted',false));
 receipt:=pg_temp.ai_action_fixture(a,'Revogação durante geração',jsonb_build_array(jsonb_build_object('kind','agenda.create','payload',jsonb_build_object('title','Revoked must not propose'))));
 if receipt->'message'->>'id' is null or jsonb_array_length(receipt->'actions')<>0 or jsonb_array_length(receipt->'action_errors')<>1 then raise exception 'Revocation erased text or produced action';end if;
 perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'version',consent_version,'accepted',true));
 receipt:=pg_temp.ai_action_fixture(b,'Ação sem permissão',jsonb_build_array(jsonb_build_object('kind','agenda.create','payload',jsonb_build_object('title','Denied must not propose'))));
 if jsonb_array_length(receipt->'actions')<>0 or jsonb_array_length(receipt->'action_errors')<>1 then raise exception 'Module denied proposal accepted';end if;

 -- Agenda reads are rendered only to the authenticated UI, bounded to 31
 -- inclusive days and 100 events. Stored results are never sent back to Gemini.
 insert into public.duuk_events(title,start_date,end_date,created_by,responsible_id)
  select 'Bounded query fixture '||a||' '||n,day+20,day+20,a,a from generate_series(1,101) n;
 receipt:=pg_temp.ai_action_fixture(a,'Consultar agenda fictícia',jsonb_build_array(jsonb_build_object('kind','agenda.list','payload',jsonb_build_object('date_start',day+20,'date_end',day+20))));
 query:=receipt->'actions'->0;
 if query->>'status'<>'completed' or jsonb_array_length(query->'result'->'items')<>100 or query->'result'->>'truncated'<>'true' then raise exception 'Agenda read unbounded or not authoritative';end if;
 if exists(select 1 from jsonb_array_elements(query->'result'->'items') x where x ? 'description' or x ? 'row_number') then raise exception 'Query returned unnecessary internal fields';end if;
 receipt:=pg_temp.ai_action_fixture(a,'Consulta longa inválida',jsonb_build_array(jsonb_build_object('kind','agenda.list','payload',jsonb_build_object('date_start',day,'date_end',day+31))));
 if jsonb_array_length(receipt->'actions')<>0 or jsonb_array_length(receipt->'action_errors')<>1 then raise exception 'Agenda query exceeded 31 days';end if;
 receipt:=pg_temp.ai_action_fixture(a,'Dados inválidos de ferramenta',jsonb_build_array(
  jsonb_build_object('kind','agenda.create','payload',jsonb_build_object('title','Invalid date','start_date','2026-02-30')),
  jsonb_build_object('kind','followup.create','payload',jsonb_build_object('due_at','2030-01-01T10:00')),
  jsonb_build_object('kind','expense.create','payload',jsonb_build_object('amount_cents',1.5))));
 if jsonb_array_length(receipt->'actions')<>0 or jsonb_array_length(receipt->'action_errors')<>3 then raise exception 'Malformed dates, timezone or cents accepted';end if;
 receipt:=pg_temp.ai_action_fixture(a,'Ferramentas demais',jsonb_build_array(
  jsonb_build_object('kind','agenda.create','payload','{}'::jsonb),jsonb_build_object('kind','agenda.create','payload','{}'::jsonb),
  jsonb_build_object('kind','agenda.create','payload','{}'::jsonb),jsonb_build_object('kind','agenda.create','payload','{}'::jsonb)));
 if jsonb_array_length(receipt->'actions')<>0 or jsonb_array_length(receipt->'action_errors')<>1 then raise exception 'More than three tools accepted';end if;
 -- FK cleanup removes proposals without deleting the official records already
 -- created by a confirmed action.
 c_id:=(receipt->>'conversation_id')::uuid;
 receipt:=pg_temp.ai_action_fixture(a,'Excluir conversa fictícia',jsonb_build_array(jsonb_build_object('kind','expense.create','payload',jsonb_build_object('title','Cascade fixture'))));
 req_id:=(receipt->>'request_id')::uuid;action_id:=(receipt->'actions'->0->>'id')::uuid;c_id:=(receipt->>'conversation_id')::uuid;
 perform public.duuk_ai_backend('delete',jsonb_build_object('user_id',a,'id',c_id));
 if exists(select 1 from duuk_private.ai_actions where id=action_id) then raise exception 'Conversation deletion orphaned proposal';end if;
 if not exists(select 1 from public.duuk_events where id=v_event_id) then raise exception 'Deleting chat deleted confirmed agenda record';end if;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(a,'ai',false);
 begin perform public.duuk_ai_action_backend('options',jsonb_build_object('user_id',a));raise exception 'Revoked AI permission ignored';exception when sqlstate 'PT403' then null;end;
end;
$$;
rollback;
select 'PASS: private confirmed actions, conversation lock, real regeneration invalidation, incomplete drafts, name resolution, module/consent/owner checks, idempotence, canonical input, actor attribution, official calendar/notifications, client revisions and bounded agenda reads' result;
