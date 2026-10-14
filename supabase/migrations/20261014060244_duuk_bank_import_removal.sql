-- Minimal private receipts prevent a lost import response from restoring a removed file.
create table duuk_private.bank_import_removals (
 import_id uuid primary key,
 created_by uuid not null references auth.users(id) on delete cascade,
 client_request_id uuid not null,
 removed_by uuid references auth.users(id) on delete set null,
 removed_at timestamptz not null default now(),
 unique(created_by,client_request_id)
);
create index bank_import_removals_actor_idx on duuk_private.bank_import_removals(removed_by);
alter table duuk_private.bank_import_removals enable row level security;
revoke all on duuk_private.bank_import_removals from public, anon, authenticated;
grant all on duuk_private.bank_import_removals to service_role;

create or replace function public.duuk_import_bank_statement(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid(); request uuid; account text; bank text; account_id text; label text; file_name text; file_hash text;
 item jsonb; posted date; amount bigint; title text; description text; fit text; target uuid; previous public.duuk_bank_transactions;
 first_day date; last_day date; balance bigint; balance_day date; imported public.duuk_bank_imports; inserted integer := 0; duplicates integer := 0;
begin
 if actor is null or not duuk_private.member_permission(actor,'finance') then raise exception 'Sem acesso ao Financeiro.' using errcode='PT403'; end if;
 if jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 2097152 or jsonb_typeof(payload->'transactions') <> 'array' then raise exception 'Confira o arquivo OFX.' using errcode='PT400'; end if;
 if jsonb_array_length(payload->'transactions') not between 1 and 2000 then raise exception 'Importe de 1 a 2.000 movimentações por arquivo.' using errcode='PT400'; end if;
 request := (payload->>'request_id')::uuid;
 bank := upper(trim(payload->>'bank_id')); account_id := upper(regexp_replace(payload->>'account_id','\s','','g')); label := trim(payload->>'account_label');
 file_name := payload->>'file_name'; file_hash := payload->>'file_hash';
 if request is null or bank is null or bank !~ '^[A-Z0-9_.-]{1,80}$' or account_id is null or account_id !~ '^[A-Z0-9_.-]{1,160}$' or label is null or char_length(label) not between 1 and 80 or file_name is null or char_length(file_name) not between 1 and 180 or file_hash is null or file_hash !~ '^[a-f0-9]{64}$' or payload->>'currency' <> 'BRL' or payload->>'currency' is null then raise exception 'Confira a conta, moeda e identificação do arquivo.' using errcode='PT400'; end if;
 account := encode(extensions.digest(bank||':'||account_id||':BRL','sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('duuk:bank:'||account,0));
 if exists(select 1 from duuk_private.bank_import_removals where created_by=actor and client_request_id=request) then raise exception 'Esta tentativa corresponde a um extrato removido. Escolha o arquivo novamente para iniciar outra importação.' using errcode='PT409'; end if;
 select * into imported from public.duuk_bank_imports where created_by=actor and client_request_id=request;
 if found then
  if imported.account_key<>account or imported.file_hash<>file_hash or imported.request_hash<>encode(extensions.digest(payload::text,'sha256'),'hex') then raise exception 'Esta tentativa pertence a outro arquivo ou campos.' using errcode='PT400'; end if;
  return jsonb_build_object('import_id',imported.id,'inserted',imported.inserted_count,'duplicates',imported.duplicate_count,'replayed',true);
 end if;
 target := gen_random_uuid();
 if payload->'balance' is not null and payload->'balance' <> 'null'::jsonb then
  if coalesce(payload#>>'{balance,amount_cents}','') !~ '^-?\d{1,12}$' or coalesce(payload#>>'{balance,date}','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Confira o saldo do extrato.' using errcode='PT400'; end if;
  balance := (payload#>>'{balance,amount_cents}')::bigint; balance_day := (payload#>>'{balance,date}')::date;
  if abs(balance::numeric)>100000000000 or balance_day not between '1900-01-01'::date and (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Confira o saldo e a data do extrato.' using errcode='PT400'; end if;
 end if;
 -- Validate the entire batch before changing any business record. A conflict
 -- later in the loop rolls back the statement, including its import record.
 for item in select value from jsonb_array_elements(payload->'transactions') loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'posted_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(item->>'amount_cents','') !~ '^-?\d{1,12}$' then raise exception 'Uma movimentação tem data ou valor inválido.' using errcode='PT400'; end if;
  posted := (item->>'posted_date')::date; amount := (item->>'amount_cents')::bigint; title := trim(item->>'title'); description := coalesce(item->>'description','');
  if posted not between '1900-01-01'::date and (now() at time zone 'America/Sao_Paulo')::date or amount=0 or abs(amount::numeric)>100000000000 or title is null or char_length(title) not between 1 and 160 or char_length(description)>500 or coalesce(char_length(item->>'fit_id'),0) not between 1 and 250 then raise exception 'Uma movimentação tem campos inválidos.' using errcode='PT400'; end if;
  first_day := least(coalesce(first_day,posted),posted); last_day := greatest(coalesce(last_day,posted),posted);
 end loop;
 insert into public.duuk_bank_imports(id,account_key,bank_id,account_last_four,account_label,file_name,file_hash,request_hash,from_date,to_date,balance_cents,balance_date,created_by,client_request_id)
 values(target,account,bank,right(account_id,4),label,'Extrato OFX '||first_day::text||' a '||last_day::text||'.ofx',file_hash,encode(extensions.digest(payload::text,'sha256'),'hex'),first_day,last_day,balance,balance_day,actor,request);
 for item in select value from jsonb_array_elements(payload->'transactions') loop
  posted := (item->>'posted_date')::date; amount := (item->>'amount_cents')::bigint;
  fit := encode(extensions.digest(item->>'fit_id','sha256'),'hex');
  select * into previous from public.duuk_bank_transactions where account_key=account and fit_key=fit;
  if found then
   if previous.posted_date<>posted or previous.amount_cents<>amount then raise exception 'Uma movimentação já importada possui outro valor ou data. Confira o OFX no banco.' using errcode='PT409'; end if;
   duplicates:=duplicates+1;
  else
   insert into public.duuk_bank_transactions(import_id,account_key,fit_key,posted_date,amount_cents,title,description,created_by)
   values(target,account,fit,posted,amount,trim(item->>'title'),coalesce(item->>'description',''),actor);
   inserted:=inserted+1;
  end if;
 end loop;
 update public.duuk_bank_imports set inserted_count=inserted,duplicate_count=duplicates where id=target;
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details)
 values(actor,(select name from public.duuk_profiles where id=actor),'insert','duuk_bank_imports',target::text,'Extrato OFX importado',jsonb_build_object('inserted',inserted,'duplicates',duplicates,'from',first_day,'to',last_day));
 return jsonb_build_object('import_id',target,'inserted',inserted,'duplicates',duplicates,'replayed',false);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'O extrato contém campos inválidos.' using errcode='PT400';
end;
$$;
revoke all on function public.duuk_import_bank_statement(jsonb) from public, anon;
grant execute on function public.duuk_import_bank_statement(jsonb) to authenticated;

-- Finance-only removal of a selected import. Financial entries are preserved.
create function public.duuk_remove_bank_import(import_id uuid, expected_created_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); item public.duuk_bank_imports; account text; removed integer; linked integer;
begin
 if actor is null or not duuk_private.member_permission(actor,'finance') then raise exception 'Sem acesso ao Financeiro.' using errcode='PT403'; end if;
 if import_id is null or expected_created_at is null then raise exception 'Escolha uma importação válida.' using errcode='PT400'; end if;
 select account_key into account from public.duuk_bank_imports where id=import_id;
 if not found then return jsonb_build_object('removed',true,'already_removed',true,'movements',0); end if;
 -- Use the same lock order as imports: account, then the import/rows.
 perform pg_advisory_xact_lock(hashtextextended('duuk:bank:'||account,0));
 select * into item from public.duuk_bank_imports where id=import_id for update;
 if not found then return jsonb_build_object('removed',true,'already_removed',true,'movements',0); end if;
 if item.created_at is distinct from expected_created_at then raise exception 'A importação mudou. Atualize os extratos antes de remover.' using errcode='PT409'; end if;
 perform 1 from public.duuk_bank_transactions where duuk_bank_transactions.import_id=item.id order by id for update;
 select count(*) into linked from public.duuk_bank_transactions where duuk_bank_transactions.import_id=item.id and (linked_income_id is not null or linked_expense_id is not null);
 insert into duuk_private.bank_import_removals(import_id,created_by,client_request_id,removed_by) values(item.id,item.created_by,item.client_request_id,actor);
 delete from public.duuk_bank_transactions where duuk_bank_transactions.import_id=item.id;
 get diagnostics removed=row_count;
 delete from public.duuk_bank_imports where id=item.id;
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details)
 values(actor,(select name from public.duuk_profiles where id=actor),'delete','duuk_bank_imports',item.id::text,'Extrato removido',jsonb_build_object('removed_movements',removed,'linked_movements',linked,'financial_entries_preserved',true));
 return jsonb_build_object('removed',true,'already_removed',false,'movements',removed,'financial_entries_preserved',true);
end;
$$;
revoke all on function public.duuk_remove_bank_import(uuid,timestamptz) from public, anon;
grant execute on function public.duuk_remove_bank_import(uuid,timestamptz) to authenticated;
