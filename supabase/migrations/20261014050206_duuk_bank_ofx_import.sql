-- Private, manual OFX imports. No bank credentials, APIs or raw files are stored.
create table public.duuk_bank_imports (
 id uuid primary key default gen_random_uuid(),
 account_key text not null check (account_key ~ '^[a-f0-9]{64}$'),
 bank_id text not null check (char_length(bank_id) between 1 and 80),
 account_last_four text not null check (char_length(account_last_four) between 1 and 4),
 account_label text not null check (char_length(trim(account_label)) between 1 and 80),
 file_name text not null check (char_length(file_name) between 1 and 180),
 file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
 request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
 from_date date not null, to_date date not null,
 balance_cents bigint check (abs(balance_cents::numeric) <= 100000000000), balance_date date,
 inserted_count integer not null default 0, duplicate_count integer not null default 0,
 created_by uuid not null default auth.uid() references auth.users(id),
 client_request_id uuid not null,
 created_at timestamptz not null default now(),
 unique(created_by, client_request_id),
 check (from_date >= '1900-01-01' and to_date <= '2099-12-31' and from_date <= to_date),
 check ((balance_cents is null and balance_date is null) or (balance_cents is not null and balance_date is not null and balance_date between '1900-01-01' and '2099-12-31'))
);
create index duuk_bank_imports_created_by_idx on public.duuk_bank_imports(created_by);
create index duuk_bank_imports_created_at_idx on public.duuk_bank_imports(created_at desc);
create table public.duuk_bank_transactions (
 id uuid primary key default gen_random_uuid(),
 import_id uuid not null references public.duuk_bank_imports(id),
 account_key text not null check (account_key ~ '^[a-f0-9]{64}$'),
 fit_key text not null check (fit_key ~ '^[a-f0-9]{64}$'),
 posted_date date not null check (posted_date between '1900-01-01' and '2099-12-31'),
 amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents::numeric) <= 100000000000),
 title text not null check (char_length(trim(title)) between 1 and 160),
 description text not null default '' check (char_length(description) <= 500),
 linked_income_id uuid references public.duuk_income(id) on delete set null,
 linked_expense_id uuid references public.duuk_expenses(id) on delete set null,
 ignored_at timestamptz, ignored_by uuid references auth.users(id),
 created_by uuid not null default auth.uid() references auth.users(id),
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_action_request_id uuid, last_action_hash text,
 unique(account_key, fit_key),
 check (linked_income_id is null or (amount_cents > 0 and linked_expense_id is null)),
 check (linked_expense_id is null or amount_cents < 0),
 check (ignored_at is null or (linked_income_id is null and linked_expense_id is null))
);
create index duuk_bank_transactions_date_idx on public.duuk_bank_transactions(posted_date, id);
create index duuk_bank_transactions_import_idx on public.duuk_bank_transactions(import_id);
create index duuk_bank_transactions_created_by_idx on public.duuk_bank_transactions(created_by);
create index duuk_bank_transactions_ignored_by_idx on public.duuk_bank_transactions(ignored_by);
create unique index duuk_bank_transactions_income_idx on public.duuk_bank_transactions(linked_income_id) where linked_income_id is not null;
create unique index duuk_bank_transactions_expense_idx on public.duuk_bank_transactions(linked_expense_id) where linked_expense_id is not null;
create trigger bank_transaction_revision before update on public.duuk_bank_transactions for each row execute function duuk_private.expense_revision();
alter table public.duuk_bank_imports enable row level security;
alter table public.duuk_bank_transactions enable row level security;
revoke all on public.duuk_bank_imports, public.duuk_bank_transactions from public, anon, authenticated;
grant select on public.duuk_bank_imports, public.duuk_bank_transactions to authenticated;
grant all on public.duuk_bank_imports, public.duuk_bank_transactions to service_role;
create policy bank_imports_select on public.duuk_bank_imports for select to authenticated using ((select duuk_private.has_permission('finance')));
create policy bank_transactions_select on public.duuk_bank_transactions for select to authenticated using ((select duuk_private.has_permission('finance')));

create or replace function duuk_private.finance_audit_scope() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.entity in ('duuk_income', 'duuk_finance_goals', 'duuk_bank_imports', 'duuk_bank_transactions') then new.required_permission := 'finance'; end if;
 return new;
end;
$$;
revoke all on function duuk_private.finance_audit_scope() from public, anon, authenticated;

create function public.duuk_import_bank_statement(payload jsonb) returns jsonb
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
 values(target,account,bank,right(account_id,4),label,file_name,file_hash,encode(extensions.digest(payload::text,'sha256'),'hex'),first_day,last_day,balance,balance_day,actor,request);
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

create function public.duuk_reconcile_bank_transaction(transaction_id uuid, expected_version bigint, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); bank public.duuk_bank_transactions; entry jsonb; entry_id uuid; kind text; request uuid; action_hash text; title text; category text; description text;
begin
 if actor is null or not duuk_private.member_permission(actor,'finance') then raise exception 'Sem acesso ao Financeiro.' using errcode='PT403'; end if;
 if operation not in ('ignore','review','unlink','link','create') or operation is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>10000 then raise exception 'Operação inválida.' using errcode='PT400'; end if;
 request:=(payload->>'request_id')::uuid; if request is null then raise exception 'Confira a identificação desta tentativa.' using errcode='PT400'; end if;
 action_hash:=encode(extensions.digest(operation||':'||payload::text,'sha256'),'hex');
 select * into bank from public.duuk_bank_transactions where id=transaction_id for update;
 if not found then raise exception 'Movimentação não encontrada.' using errcode='PT404'; end if;
 if bank.last_action_request_id=request then
  if bank.last_action_hash<>action_hash then raise exception 'Esta tentativa já foi usada com outros campos.' using errcode='PT400'; end if;
  return to_jsonb(bank);
 end if;
 if expected_version is null or bank.version<>expected_version then raise exception 'A movimentação mudou em outra aba. Atualize o extrato antes de continuar.' using errcode='PT409'; end if;
 kind:=case when bank.amount_cents>0 then 'income' else 'expense' end;
 if operation in ('ignore','review') then
  if bank.linked_income_id is not null or bank.linked_expense_id is not null then raise exception 'Remova o vínculo antes de alterar a revisão.' using errcode='PT409'; end if;
  bank.ignored_at:=case when operation='ignore' then now() end; bank.ignored_by:=case when operation='ignore' then actor end;
 elsif operation='unlink' then
  -- Keep the financial entry. Unlinking is never an instruction to delete a bill.
  bank.linked_income_id:=null; bank.linked_expense_id:=null; bank.ignored_at:=null; bank.ignored_by:=null;
 else
  if bank.linked_income_id is not null or bank.linked_expense_id is not null then raise exception 'Esta movimentação já está vinculada.' using errcode='PT409'; end if;
  if operation='link' then
   entry_id:=(payload->>'entry_id')::uuid;
   if kind='income' then select to_jsonb(r) into entry from public.duuk_income r where id=entry_id for update;
   else select to_jsonb(r) into entry from public.duuk_expenses r where id=entry_id for update; end if;
   if entry is null or (entry->>'version')::bigint is distinct from (payload->>'entry_version')::bigint then raise exception 'O lançamento mudou. Atualize antes de vincular.' using errcode='PT409'; end if;
   if (entry->>'amount_cents')::bigint<>abs(bank.amount_cents) or (entry->>'status'='paid' and (entry->>'paid_date')::date is distinct from bank.posted_date) then raise exception 'O valor ou a data não corresponde ao extrato.' using errcode='PT400'; end if;
   if kind='income' then update public.duuk_income set status='paid',paid_date=bank.posted_date where id=entry_id;
   else update public.duuk_expenses set status='paid',paid_date=bank.posted_date where id=entry_id; end if;
  else
   title:=trim(payload->>'title'); category:=trim(payload->>'category'); description:=coalesce(payload->>'description','');
   if title is null or char_length(title) not between 1 and 160 or category is null or char_length(category) not between 1 and 80 or char_length(description)>2000 or char_length(coalesce(payload->>'counterparty_name',''))>160 then raise exception 'Confira nome, categoria e observações.' using errcode='PT400'; end if;
   if kind='income' then insert into public.duuk_income(title,description,amount_cents,category,counterparty_name,due_date,status,paid_date) values(title,description,bank.amount_cents,category,coalesce(payload->>'counterparty_name',''),bank.posted_date,'paid',bank.posted_date) returning id into entry_id;
   else insert into public.duuk_expenses(title,description,amount_cents,category,due_date,status,paid_date) values(title,description,abs(bank.amount_cents),category,bank.posted_date,'paid',bank.posted_date) returning id into entry_id; end if;
  end if;
  bank.linked_income_id:=case when kind='income' then entry_id end; bank.linked_expense_id:=case when kind='expense' then entry_id end; bank.ignored_at:=null; bank.ignored_by:=null;
 end if;
 update public.duuk_bank_transactions set linked_income_id=bank.linked_income_id,linked_expense_id=bank.linked_expense_id,ignored_at=bank.ignored_at,ignored_by=bank.ignored_by,last_action_request_id=request,last_action_hash=action_hash where id=transaction_id returning * into bank;
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details)
 values(actor,(select name from public.duuk_profiles where id=actor),'update','duuk_bank_transactions',transaction_id::text,'Movimentação do extrato revisada',jsonb_build_object('operation',operation,'kind',kind,'entry_id',entry_id));
 return to_jsonb(bank);
exception when unique_violation then raise exception 'Este lançamento já está vinculado a outra movimentação. Atualize o extrato.' using errcode='PT409';
 when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Confira os campos da revisão.' using errcode='PT400';
end;
$$;
revoke all on function public.duuk_reconcile_bank_transaction(uuid,bigint,text,jsonb) from public, anon;
grant execute on function public.duuk_reconcile_bank_transaction(uuid,bigint,text,jsonb) to authenticated;
