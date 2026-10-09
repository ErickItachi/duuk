-- Apply after duuk-ai-actions.sql. Confirmation, cancellation, regeneration
-- and conversation deletion use the same conversation -> action lock order.
-- CREATE OR REPLACE preserves the existing service-role-only execute grants.
create or replace function duuk_private.ai_action_backend(operation text,payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=nullif(payload->>'user_id','')::uuid; target uuid; conversation uuid; execution uuid; req public.duuk_ai_requests;
 item duuk_private.ai_actions; result jsonb; actions jsonb; errors jsonb:='[]'; calls jsonb; call jsonb; canonical jsonb; outcome jsonb;
 ordinal integer:=0; requested text; was_finished boolean; fingerprint text; people jsonb:='[]'; clients jsonb:='[]'; search_term text;
 event public.duuk_events; expense public.duuk_expenses; followup public.duuk_follow_ups; client public.duuk_clients;
 previous_sub text; previous_claims text;
begin
 if actor is null or not duuk_private.member_permission(actor,'ai') then raise exception 'Você não tem acesso ao DUUK AI.' using errcode='PT403';end if;
 if operation='finish' then
  target:=nullif(payload->>'request_id','')::uuid;
  select * into req from public.duuk_ai_requests where id=target and user_id=actor for update;
  if req.id is null then raise exception 'Solicitação não encontrada.' using errcode='PT404';end if;
  was_finished:=req.status in ('complete','partial');
  result:=duuk_private.ai_backend('finish_generation',payload-'tool_calls');
  if not was_finished and payload->>'status'='complete' and result->'message'->>'id' is not null then
   calls:=coalesce(payload->'tool_calls','[]'::jsonb);
   if jsonb_typeof(calls)<>'array' then
    errors:=jsonb_build_array(jsonb_build_object('error','O assistente propôs uma estrutura inválida. Peça novamente.'));
   elsif jsonb_array_length(calls)>3 then
    errors:=jsonb_build_array(jsonb_build_object('error','O assistente propôs ações demais ou uma estrutura inválida. Peça novamente.'));
   elsif jsonb_array_length(calls)>0 and not coalesce((duuk_private.ai_consent_backend('status',jsonb_build_object('user_id',actor))->>'accepted')::boolean,false) then
    errors:=jsonb_build_array(jsonb_build_object('error','A autorização foi revogada. Nenhuma ação foi preparada.'));
   else
    for call in select * from jsonb_array_elements(calls) loop
     ordinal:=ordinal+1;
     begin
      if jsonb_typeof(call)<>'object' then raise exception 'Estrutura inválida.' using errcode='PT400';end if;
      if exists(select 1 from jsonb_object_keys(call) k where k not in ('kind','payload')) then raise exception 'Estrutura inválida.' using errcode='PT400';end if;
      requested:=duuk_private.ai_action_permission(call->>'kind');
      if requested is null then raise exception 'Esta ação não está disponível.' using errcode='PT400';end if;
      if not duuk_private.member_permission(actor,requested) then raise exception 'Seu acesso não permite essa ação.' using errcode='PT403';end if;
      canonical:=duuk_private.ai_action_payload(actor,call->>'kind',call->'payload',false);outcome:=null;
      if call->>'kind'='agenda.list' then
       select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by x.start_date,x.start_time nulls first,x.id) filter(where x.row_number<=100),'[]'),
        'truncated',count(*)>100,'date_start',canonical->>'date_start','date_end',canonical->>'date_end') into outcome from
        (select e.id,e.title,e.start_date,e.end_date,e.all_day,e.start_time,e.end_time,e.category,e.status,e.location,e.client_name,e.responsible_id,p.name as responsible_name,e.version,
         row_number() over(order by e.start_date,e.start_time nulls first,e.id) from public.duuk_events e left join public.duuk_profiles p on p.id=e.responsible_id
         where e.start_date<=(canonical->>'date_end')::date and e.end_date>=(canonical->>'date_start')::date order by e.start_date,e.start_time nulls first,e.id limit 101) x;
       -- The internal pagination marker is not a product field.
       select outcome||jsonb_build_object('items',coalesce(jsonb_agg(x-'row_number'),'[]')) into outcome from jsonb_array_elements(outcome->'items') x;
      end if;
      insert into duuk_private.ai_actions(user_id,conversation_id,message_id,request_id,ordinal,kind,payload,status,result,completed_at)
       values(actor,(result->>'conversation_id')::uuid,(result->'message'->>'id')::uuid,target,ordinal,call->>'kind',canonical,
        case when outcome is null then 'pending' else 'completed' end,outcome,case when outcome is not null then now() end);
     exception when sqlstate 'PT400' or sqlstate 'PT403' then
      errors:=errors||jsonb_build_array(jsonb_build_object('index',ordinal,'error',SQLERRM));
     when others then errors:=errors||jsonb_build_array(jsonb_build_object('index',ordinal,'error','Não foi possível preparar esta ação. A resposta foi preservada.'));
     end;
    end loop;
   end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.ordinal),'[]') into actions from duuk_private.ai_actions a
   join public.duuk_ai_messages m on m.id=a.message_id
   where a.request_id=target and a.user_id=actor and m.superseded_at is null and duuk_private.member_permission(actor,duuk_private.ai_action_permission(a.kind));
  return result||jsonb_build_object('actions',actions,'action_errors',errors);
 elsif operation='list' then
  conversation:=nullif(payload->>'conversation_id','')::uuid;
  if not exists(select 1 from public.duuk_ai_conversations where id=conversation and user_id=actor) then raise exception 'Conversa não encontrada.' using errcode='PT404';end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.ordinal),'[]') into actions from duuk_private.ai_actions a
   join public.duuk_ai_messages m on m.id=a.message_id where a.user_id=actor and a.conversation_id=conversation
   and m.role='assistant' and m.superseded_at is null and duuk_private.member_permission(actor,duuk_private.ai_action_permission(a.kind));
  return jsonb_build_object('actions',actions);
 elsif operation='options' then
  if duuk_private.member_permission(actor,'agenda') or duuk_private.member_permission(actor,'crm.followups') then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') into people from public.duuk_profiles where active;
  end if;
  search_term:=trim(coalesce(payload->>'term',''));if char_length(search_term)>160 then raise exception 'Reduza a busca de clientes.' using errcode='PT400';end if;
  if duuk_private.member_permission(actor,'crm.followups') then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.name,x.id),'[]') into clients from
    (select id,name,version from public.duuk_clients where search_term='' or position(lower(search_term) in lower(name))>0 order by name,id limit 200) x;
  end if;
  return jsonb_build_object('people',people,'clients',clients);
 elsif operation in ('execute','cancel') then
  target:=nullif(payload->>'id','')::uuid;
  -- Serialize with editing, regeneration and conversation deletion before
  -- locking the action. Those flows lock the conversation first as well.
  -- While confirmation runs, the assistant message cannot become superseded.
  perform 1 from public.duuk_ai_conversations c join duuk_private.ai_actions a on a.conversation_id=c.id
   where a.id=target and a.user_id=actor and c.user_id=actor for update of c;
  if not found then raise exception 'Ação indisponível nesta conversa.' using errcode='PT404';end if;
  select * into item from duuk_private.ai_actions where id=target and user_id=actor for update;
  if item.id is null or not exists(select 1 from public.duuk_ai_conversations c join public.duuk_ai_messages m on m.conversation_id=c.id
   where c.id=item.conversation_id and c.user_id=actor and m.id=item.message_id and m.role='assistant' and m.superseded_at is null) then raise exception 'Ação indisponível nesta conversa.' using errcode='PT404';end if;
  if not duuk_private.member_permission(actor,duuk_private.ai_action_permission(item.kind)) then raise exception 'Seu acesso a este módulo foi alterado.' using errcode='PT403';end if;
  if operation='cancel' then
   if item.status='completed' then return jsonb_build_object('action',to_jsonb(item));end if;
   update duuk_private.ai_actions set status='cancelled' where id=item.id and user_id=actor returning * into item;
   return jsonb_build_object('action',to_jsonb(item));
  end if;
  if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Revise os dados e confirme a ação.' using errcode='PT400';end if;
  if not coalesce((duuk_private.ai_consent_backend('status',jsonb_build_object('user_id',actor))->>'accepted')::boolean,false) then raise exception 'Autorize o DUUK AI nas opções de privacidade antes de confirmar.' using errcode='PT409';end if;
  if item.kind='agenda.list' then raise exception 'Esta consulta já foi realizada.' using errcode='PT409';end if;
  execution:=nullif(payload->>'client_request_id','')::uuid;if execution is null then raise exception 'Identificador da confirmação inválido.' using errcode='PT400';end if;
  if payload->'changes' is not null and jsonb_typeof(payload->'changes')<>'object' then raise exception 'Confira os dados da confirmação.' using errcode='PT400';end if;
  canonical:=duuk_private.ai_action_payload(actor,item.kind,item.payload||coalesce(payload->'changes','{}'::jsonb),true,item.status='completed');
  fingerprint:=encode(extensions.digest(jsonb_build_object('kind',item.kind,'payload',canonical)::text,'sha256'),'hex');
  if item.status='completed' then
   if item.execution_request_id is distinct from execution or item.execution_hash is distinct from fingerprint then raise exception 'A ação já foi confirmada com outros dados.' using errcode='PT409';end if;
   return jsonb_build_object('action',to_jsonb(item));
  end if;
  if item.status<>'pending' or item.expires_at<=now() then raise exception 'Esta ação foi cancelada ou expirou. Faça um novo pedido.' using errcode='PT409';end if;
  if exists(select 1 from duuk_private.ai_actions where user_id=actor and execution_request_id=execution and id<>item.id) then raise exception 'O identificador da confirmação já foi utilizado.' using errcode='PT409';end if;
  -- The transaction-local identity preserves attribution, notifications and
  -- defaults in the same official tables used by the manual Admin flows.
  previous_sub:=current_setting('request.jwt.claim.sub',true);previous_claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  if item.kind='agenda.create' then
   insert into public.duuk_events(title,description,location,client_name,start_date,end_date,all_day,start_time,end_time,category,status,responsible_id,created_by)
    values(canonical->>'title',canonical->>'description',canonical->>'location',canonical->>'client_name',(canonical->>'start_date')::date,(canonical->>'end_date')::date,
     (canonical->>'all_day')::boolean,(canonical->>'start_time')::time,(canonical->>'end_time')::time,canonical->>'category',canonical->>'status',(canonical->>'responsible_id')::uuid,actor)
    returning * into event;
   outcome:=jsonb_build_object('event',to_jsonb(event),'link','/admin/agenda?dia='||event.start_date);
  elsif item.kind='expense.create' then
   insert into public.duuk_expenses(title,description,amount_cents,category,due_date,status,paid_date,created_by)
    values(canonical->>'title',canonical->>'description',(canonical->>'amount_cents')::bigint,canonical->>'category',(canonical->>'due_date')::date,
     canonical->>'status',(canonical->>'paid_date')::date,actor) returning * into expense;
   outcome:=jsonb_build_object('expense',to_jsonb(expense),'link','/admin/financeiro?mes='||to_char(expense.due_date,'YYYY-MM'));
  elsif item.kind='followup.create' then
   select * into client from public.duuk_clients where id=(canonical->>'client_id')::uuid for update;
   if client.id is null or client.version is distinct from (canonical->>'client_version')::bigint then raise exception 'O cliente mudou. Atualize as opções antes de confirmar.' using errcode='PT409';end if;
   insert into public.duuk_follow_ups(client_id,owner_id,due_at,notes)
    values(client.id,(canonical->>'owner_id')::uuid,(canonical->>'due_at')::timestamptz,canonical->>'notes') returning * into followup;
   outcome:=jsonb_build_object('followup',to_jsonb(followup),'link','/admin/comercial/follow-ups');
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  update duuk_private.ai_actions set status='completed',payload=canonical,result=outcome,completed_at=now(),execution_request_id=execution,execution_hash=fingerprint
   where id=item.id and user_id=actor returning * into item;
  return jsonb_build_object('action',to_jsonb(item));
 end if;
 raise exception 'Operação de ações inválida.' using errcode='PT400';
exception when invalid_text_representation then raise exception 'Identificador ou dado inválido.' using errcode='PT400';
 when unique_violation then raise exception 'O identificador da confirmação já foi utilizado.' using errcode='PT409';
end;
$$;
notify pgrst,'reload schema';
