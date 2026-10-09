-- Apply after duuk-ai.sql and duuk-ai-consent.sql. Actions remain server-only.
-- The development Mac has no working Supabase CLI; this repository keeps
-- reviewed standalone SQL migrations alongside its rollback fixtures.
create table duuk_private.ai_actions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.duuk_profiles(id) on delete cascade,
 conversation_id uuid not null references public.duuk_ai_conversations(id) on delete cascade,
 message_id uuid not null references public.duuk_ai_messages(id) on delete cascade,
 request_id uuid not null references public.duuk_ai_requests(id) on delete cascade,
 ordinal integer not null check(ordinal between 1 and 3),
 kind text not null check(kind in ('agenda.create','expense.create','followup.create','agenda.list')),
 status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16000),
 expires_at timestamptz not null default now()+interval '1 day',
 result jsonb,
 execution_request_id uuid,
 execution_hash text check(execution_hash is null or execution_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(request_id,ordinal),unique(user_id,execution_request_id),
 check((execution_request_id is null)=(execution_hash is null)),
 check(status<>'completed' or result is not null)
);
create index ai_actions_owner_conversation on duuk_private.ai_actions(user_id,conversation_id,created_at);
create index ai_actions_message on duuk_private.ai_actions(message_id);
alter table duuk_private.ai_actions enable row level security;
revoke all on duuk_private.ai_actions from public,anon,authenticated;
grant all on duuk_private.ai_actions to service_role;

create function duuk_private.ai_action_permission(kind text) returns text
 language sql immutable security invoker set search_path='' as $$
 select case kind when 'agenda.create' then 'agenda' when 'agenda.list' then 'agenda'
 when 'expense.create' then 'finance' when 'followup.create' then 'crm.followups' end;
$$;

-- Names are resolved within the authorized module, without sharing this
-- directory with Gemini. A single-word first name is usable only when unique.
create function duuk_private.ai_action_name(actor uuid,area text,hint text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare matches jsonb; needle text:=lower(trim(coalesce(hint,''))); begin
 if needle='' then return null;end if;
 if area='people' then
  if not (duuk_private.member_permission(actor,'agenda') or duuk_private.member_permission(actor,'crm.followups')) then return null;end if;
  select jsonb_agg(jsonb_build_object('id',id,'name',name)) into matches from public.duuk_profiles where active and lower(trim(name))=needle;
  if matches is null and needle !~ '\s' then
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) into matches from public.duuk_profiles p where p.active
   and exists(select 1 from regexp_split_to_table(trim(p.name),'\s+') part where lower(part)=needle);
  end if;
 elsif area='clients' then
  if not duuk_private.member_permission(actor,'crm.followups') then return null;end if;
  select jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version)) into matches from public.duuk_clients where lower(trim(name))=needle;
  if matches is null and needle !~ '\s' then
   select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'version',c.version)) into matches from public.duuk_clients c
   where exists(select 1 from regexp_split_to_table(trim(c.name),'\s+') part where lower(part)=needle);
  end if;
 end if;
 return case when jsonb_array_length(matches)=1 then matches->0 else null end;
end;
$$;

-- This validator accepts incomplete drafts. Execution requires all mandatory
-- fields; the browser supplies only a patch of these same whitelisted fields.
create function duuk_private.ai_action_payload(actor uuid,kind text,value jsonb,complete boolean default false,replay boolean default false) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare
 keys text[]; strings text[]; entry record; field text; output jsonb; person uuid; client uuid; resolved jsonb;
 first_day date; last_day date; first_time time; last_time time; full_day boolean; amount bigint; revision bigint; due timestamptz;
begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>16000 then raise exception 'Confira os dados da ação.' using errcode='PT400';end if;
 if kind='agenda.create' then
  keys:=array['title','description','location','client_name','start_date','end_date','all_day','start_time','end_time','category','status','responsible_id','responsible_hint'];
  strings:=array['title','description','location','client_name','start_date','end_date','start_time','end_time','category','status','responsible_id','responsible_hint'];
 elsif kind='expense.create' then
  keys:=array['title','description','amount_cents','category','due_date','status','paid_date'];
  strings:=array['title','description','category','due_date','status','paid_date'];
 elsif kind='followup.create' then
  keys:=array['client_id','client_hint','notes','due_at','owner_id','owner_hint','client_version'];
  strings:=array['client_id','client_hint','notes','due_at','owner_id','owner_hint'];
 elsif kind='agenda.list' then
  keys:=array['date_start','date_end'];strings:=keys;
 else raise exception 'Esta ação não está disponível.' using errcode='PT400';end if;
 for entry in select * from jsonb_each(value) loop
  if not entry.key=any(keys) then raise exception 'A ação contém um campo não permitido.' using errcode='PT400';end if;
  if entry.key=any(strings) and jsonb_typeof(entry.value) not in ('string','null') then raise exception 'Confira os campos de texto da ação.' using errcode='PT400';end if;
 end loop;
 if kind='agenda.create' then
  if value ? 'all_day' and jsonb_typeof(value->'all_day')<>'boolean' then raise exception 'Informe se o compromisso dura o dia inteiro.' using errcode='PT400';end if;
  full_day:=coalesce((value->>'all_day')::boolean,false);
  output:=jsonb_build_object('title',trim(coalesce(value->>'title','')),'description',trim(coalesce(value->>'description','')),
   'location',trim(coalesce(value->>'location','')),'client_name',trim(coalesce(value->>'client_name','')),
   'start_date',coalesce(value->>'start_date',''),'end_date',coalesce(nullif(value->>'end_date',''),value->>'start_date',''),
   'all_day',full_day,'start_time',nullif(value->>'start_time',''),'end_time',nullif(value->>'end_time',''),
   'category',coalesce(nullif(value->>'category',''),'other'),'status',coalesce(nullif(value->>'status',''),'planned'),
   'responsible_hint',trim(coalesce(value->>'responsible_hint','')));
  if char_length(output->>'title')>160 or char_length(output->>'description')>2000 or char_length(output->>'location')>200
   or char_length(output->>'client_name')>160 or char_length(output->>'responsible_hint')>160 then raise exception 'Reduza os textos do compromisso.' using errcode='PT400';end if;
  if output->>'category' not in ('filming','editing','meeting','delivery','other') or output->>'status' not in ('planned','confirmed','done','cancelled') then raise exception 'Confira o tipo e a situação do compromisso.' using errcode='PT400';end if;
  foreach field in array array['start_date','end_date'] loop
   if output->>field<>'' then
    if output->>field !~ '^\d{4}-\d{2}-\d{2}$' or (output->>field)::date not between date '1900-01-01' and date '2100-12-31' then raise exception 'Confira as datas do compromisso.' using errcode='PT400';end if;
   end if;
  end loop;
  first_day:=nullif(output->>'start_date','')::date;last_day:=nullif(output->>'end_date','')::date;
  if first_day is not null and last_day is not null and (last_day<first_day or last_day>first_day+366) then raise exception 'Use datas em ordem e um período de até um ano.' using errcode='PT400';end if;
  foreach field in array array['start_time','end_time'] loop
   if output->>field is not null then
    if output->>field !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then raise exception 'Confira os horários do compromisso.' using errcode='PT400';end if;
    output:=jsonb_set(output,array[field],to_jsonb(left(((output->>field)::time)::text,5)));
   end if;
  end loop;
  if full_day then output:=output||jsonb_build_object('start_time',null,'end_time',null);end if;
  first_time:=(output->>'start_time')::time;last_time:=(output->>'end_time')::time;
  if first_day=last_day and first_time is not null and last_time is not null and last_time<=first_time then raise exception 'O horário final deve ser posterior ao inicial.' using errcode='PT400';end if;
  if nullif(value->>'responsible_id','') is not null then person:=(value->>'responsible_id')::uuid;
  elsif output->>'responsible_hint'<>'' then resolved:=duuk_private.ai_action_name(actor,'people',output->>'responsible_hint');person:=(resolved->>'id')::uuid;
  else person:=actor;end if;
  if not replay and person is not null and not exists(select 1 from public.duuk_profiles where id=person and active) then raise exception 'Escolha uma pessoa ativa como responsável.' using errcode='PT400';end if;
  output:=output||jsonb_build_object('responsible_id',person);
  if complete and (output->>'title'='' or first_day is null or last_day is null or person is null or (not full_day and first_time is null)) then raise exception 'Preencha título, datas, responsável e horário do compromisso.' using errcode='PT400';end if;
 elsif kind='expense.create' then
  if value->'amount_cents' is not null and jsonb_typeof(value->'amount_cents')<>'null' then
   if jsonb_typeof(value->'amount_cents')<>'number' or value->>'amount_cents' !~ '^\d+$' then raise exception 'Informe o valor da despesa em centavos inteiros.' using errcode='PT400';end if;
   amount:=(value->>'amount_cents')::bigint;
   if amount not between 1 and 100000000000 then raise exception 'Informe um valor maior que zero, até R$ 1 bilhão.' using errcode='PT400';end if;
  end if;
  output:=jsonb_build_object('title',trim(coalesce(value->>'title','')),'description',trim(coalesce(value->>'description','')),
   'amount_cents',amount,'category',coalesce(nullif(value->>'category',''),'other'),'due_date',coalesce(value->>'due_date',''),
   'status',coalesce(nullif(value->>'status',''),'pending'),'paid_date',nullif(value->>'paid_date',''));
  if char_length(output->>'title')>160 or char_length(output->>'description')>2000 then raise exception 'Reduza os textos da despesa.' using errcode='PT400';end if;
  if output->>'category' not in ('production','equipment','suppliers','travel','marketing','taxes','other') or output->>'status' not in ('pending','paid') then raise exception 'Confira a categoria e a situação da despesa.' using errcode='PT400';end if;
  foreach field in array array['due_date','paid_date'] loop
   if nullif(output->>field,'') is not null and (output->>field !~ '^\d{4}-\d{2}-\d{2}$' or (output->>field)::date not between date '1900-01-01' and date '2100-12-31') then raise exception 'Confira as datas da despesa.' using errcode='PT400';end if;
  end loop;
  if output->>'status'='pending' then output:=output||jsonb_build_object('paid_date',null);end if;
  if complete and (output->>'title'='' or amount is null or output->>'due_date'='' or (output->>'status'='paid' and output->>'paid_date' is null)) then raise exception 'Preencha título, valor, vencimento e a data de pagamento quando necessário.' using errcode='PT400';end if;
 elsif kind='followup.create' then
  output:=jsonb_build_object('client_hint',trim(coalesce(value->>'client_hint','')),'notes',trim(coalesce(value->>'notes','')),
   'due_at',nullif(value->>'due_at',''),'owner_hint',trim(coalesce(value->>'owner_hint','')));
  if char_length(output->>'client_hint')>160 or char_length(output->>'owner_hint')>160 or char_length(output->>'notes')>2000 then raise exception 'Reduza os textos do follow-up.' using errcode='PT400';end if;
  if output->>'due_at' is not null then
   if output->>'due_at' !~ '^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?([Zz]|[+-]\d{2}:\d{2})$' then raise exception 'Informe a data e hora do follow-up com o fuso horário.' using errcode='PT400';end if;
   due:=(output->>'due_at')::timestamptz;
   if (due at time zone 'America/Sao_Paulo')::date not between date '1900-01-01' and date '2100-12-31' then raise exception 'Confira a data do follow-up.' using errcode='PT400';end if;
   output:=output||jsonb_build_object('due_at',to_char(due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
  if nullif(value->>'owner_id','') is not null then person:=(value->>'owner_id')::uuid;
  elsif output->>'owner_hint'<>'' then resolved:=duuk_private.ai_action_name(actor,'people',output->>'owner_hint');person:=(resolved->>'id')::uuid;
  else person:=actor;end if;
  if not replay and person is not null and not exists(select 1 from public.duuk_profiles where id=person and active) then raise exception 'Escolha uma pessoa ativa para o follow-up.' using errcode='PT400';end if;
  if nullif(value->>'client_id','') is not null then client:=(value->>'client_id')::uuid;
  elsif output->>'client_hint'<>'' then resolved:=duuk_private.ai_action_name(actor,'clients',output->>'client_hint');client:=(resolved->>'id')::uuid;end if;
  if value->'client_version' is not null and jsonb_typeof(value->'client_version')<>'null' then
   if jsonb_typeof(value->'client_version')<>'number' or value->>'client_version' !~ '^\d+$' then raise exception 'Confira a revisão do cliente.' using errcode='PT400';end if;
   revision:=(value->>'client_version')::bigint;if revision<1 then raise exception 'Confira a revisão do cliente.' using errcode='PT400';end if;
  elsif not complete and client is not null then select version into revision from public.duuk_clients where id=client;end if;
  if not replay and client is not null and not exists(select 1 from public.duuk_clients where id=client) then raise exception 'Escolha um cliente disponível.' using errcode='PT400';end if;
  output:=output||jsonb_build_object('owner_id',person,'client_id',client,'client_version',revision);
  if complete and (client is null or revision is null or person is null or due is null or (not replay and due<=now())) then raise exception 'Escolha cliente, responsável e uma data futura para o follow-up.' using errcode='PT400';end if;
 elsif kind='agenda.list' then
  if nullif(value->>'date_start','') is not null and value->>'date_start' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Confira a data inicial da consulta.' using errcode='PT400';end if;
  if nullif(value->>'date_end','') is not null and value->>'date_end' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Confira a data final da consulta.' using errcode='PT400';end if;
  first_day:=coalesce(nullif(value->>'date_start','')::date,(now() at time zone 'America/Sao_Paulo')::date);
  last_day:=coalesce(nullif(value->>'date_end','')::date,first_day+30);
  if first_day not between date '1900-01-01' and date '2100-12-31' or last_day not between first_day and least(first_day+30,date '2100-12-31') then raise exception 'Consulte um período de até 31 dias.' using errcode='PT400';end if;
  output:=jsonb_build_object('date_start',first_day,'date_end',last_day);
 end if;
 return output;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 raise exception 'Confira datas, horários, valores e identificadores da ação.' using errcode='PT400';
end;
$$;

create function duuk_private.ai_action_backend(operation text,payload jsonb) returns jsonb
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
create function public.duuk_ai_action_backend(operation text,payload jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.ai_action_backend(operation,payload); $$;
revoke all on function duuk_private.ai_action_permission(text),duuk_private.ai_action_name(uuid,text,text),duuk_private.ai_action_payload(uuid,text,jsonb,boolean,boolean),duuk_private.ai_action_backend(text,jsonb),public.duuk_ai_action_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.ai_action_permission(text),duuk_private.ai_action_name(uuid,text,text),duuk_private.ai_action_payload(uuid,text,jsonb,boolean,boolean),duuk_private.ai_action_backend(text,jsonb),public.duuk_ai_action_backend(text,jsonb) to service_role;
notify pgrst,'reload schema';
