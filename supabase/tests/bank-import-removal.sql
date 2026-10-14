-- Only synthetic users/records; every mutation and audit entry rolls back.
begin;
do $$
declare
 actor uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); finance_role uuid:=gen_random_uuid(); denied_role uuid:=gen_random_uuid();
 payload jsonb; result jsonb; imported public.duuk_bank_imports; other public.duuk_bank_imports; credit public.duuk_bank_transactions; debit public.duuk_bank_transactions;
 receipt_id uuid; expense_id uuid; request uuid:=gen_random_uuid(); original_count integer;
begin
 insert into public.duuk_roles(id,name) values(finance_role,'QA removal '||finance_role),(denied_role,'QA removal denied '||denied_role);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(finance_role,'finance',true),(finance_role,'audit',true),(denied_role,'audit',true);
 insert into auth.users(id,email) values(actor,actor||'@test.invalid'),(denied,denied||'@test.invalid'),(disabled,disabled||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active) values(actor,'QA removal',actor||'@test.invalid',finance_role,true),(denied,'QA denied',denied||'@test.invalid',denied_role,true),(disabled,'QA disabled',disabled||'@test.invalid',finance_role,false);
 if has_table_privilege('authenticated','duuk_private.bank_import_removals','select') or has_table_privilege('anon','duuk_private.bank_import_removals','select') then raise exception 'Private receipts exposed'; end if;
 if has_function_privilege('anon','public.duuk_remove_bank_import(uuid,timestamptz)','execute') then raise exception 'Anonymous removal grant'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true); execute 'set local role authenticated';
 payload:=jsonb_build_object('request_id',request,'bank_id','260','account_id',gen_random_uuid()::text,'account_label','QA account','currency','BRL','file_name','NU_PRIVATE_ACCOUNT_2020.ofx','file_hash',repeat('b',64),'transactions',jsonb_build_array(jsonb_build_object('fit_id','qa-credit','posted_date','2020-01-15','amount_cents',12000,'title','QA receipt'),jsonb_build_object('fit_id','qa-debit','posted_date','2020-01-15','amount_cents',-5000,'title','QA expense')));
 result:=public.duuk_import_bank_statement(payload);
 select * into imported from public.duuk_bank_imports where id=(result->>'import_id')::uuid;
 if imported.file_name<>'Extrato OFX 2020-01-15 a 2020-01-15.ofx' then raise exception 'Source filename retained'; end if;
 select * into credit from public.duuk_bank_transactions where import_id=imported.id and amount_cents>0;
 select * into debit from public.duuk_bank_transactions where import_id=imported.id and amount_cents<0;
 result:=public.duuk_reconcile_bank_transaction(credit.id,credit.version,'create',jsonb_build_object('request_id',gen_random_uuid(),'title','QA preserved receipt','category','Projetos'));
 receipt_id:=(result->>'linked_income_id')::uuid;
 result:=public.duuk_reconcile_bank_transaction(debit.id,debit.version,'create',jsonb_build_object('request_id',gen_random_uuid(),'title','QA preserved expense','category','other'));
 expense_id:=(result->>'linked_expense_id')::uuid;
 result:=public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{account_id}',to_jsonb(gen_random_uuid()::text)));
 select * into other from public.duuk_bank_imports where id=(result->>'import_id')::uuid;
 begin perform public.duuk_remove_bank_import(imported.id,imported.created_at+interval '1 second');raise exception 'Stale removal accepted';exception when sqlstate 'PT409' then null;end;
 if (select count(*) from public.duuk_bank_transactions where import_id=imported.id)<>2 then raise exception 'Stale removal mutated movements'; end if;
 begin perform public.duuk_remove_bank_import(imported.id,null);raise exception 'Missing revision accepted';exception when sqlstate 'PT400' then null;end;
 result:=public.duuk_remove_bank_import(imported.id,imported.created_at);
 if result->>'removed'<>'true' or result->>'already_removed'<>'false' or (result->>'movements')::integer<>2 or result->>'financial_entries_preserved'<>'true' then raise exception 'Removal result incorrect'; end if;
 if exists(select 1 from public.duuk_bank_imports where id=imported.id) or exists(select 1 from public.duuk_bank_transactions where import_id=imported.id) then raise exception 'Removal left bank records'; end if;
 if not exists(select 1 from public.duuk_income where id=receipt_id and status='paid' and amount_cents=12000 and paid_date='2020-01-15') or not exists(select 1 from public.duuk_expenses where id=expense_id and status='paid' and amount_cents=5000 and paid_date='2020-01-15') then raise exception 'Removal changed financial entries'; end if;
 if not exists(select 1 from public.duuk_bank_imports where id=other.id) or (select count(*) from public.duuk_bank_transactions where import_id=other.id)<>2 then raise exception 'Removal crossed imports'; end if;
 result:=public.duuk_remove_bank_import(imported.id,imported.created_at);
 if result->>'already_removed'<>'true' then raise exception 'Removal retry not idempotent'; end if;
 if (select count(*) from public.duuk_audit where entity='duuk_bank_imports' and entity_id=imported.id::text and action='delete')<>1 then raise exception 'Retry duplicated audit'; end if;
 if not exists(select 1 from public.duuk_audit where entity='duuk_bank_imports' and entity_id=imported.id::text and action='delete' and required_permission='finance' and details->>'linked_movements'='2') then raise exception 'Removal audit not private or incomplete'; end if;
 begin perform public.duuk_import_bank_statement(payload);raise exception 'Delayed import restored removed file';exception when sqlstate 'PT409' then null;end;
 -- Choosing the file again creates a new request and may import it intentionally.
 result:=public.duuk_import_bank_statement(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())));
 if (result->>'inserted')::integer<>2 then raise exception 'Explicit fresh import rejected'; end if;
 execute 'reset role';
 if not exists(select 1 from duuk_private.bank_import_removals where import_id=imported.id and created_by=actor and removed_by=actor and client_request_id=request) then raise exception 'Missing replay tombstone'; end if;
 select count(*) into original_count from public.duuk_bank_imports where created_by=actor;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',denied,'role','authenticated')::text,true); execute 'set local role authenticated';
 begin perform public.duuk_remove_bank_import(other.id,other.created_at);raise exception 'Nonfinance removal allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_remove_bank_import(imported.id,imported.created_at);raise exception 'Missing record disclosed to nonfinance';exception when sqlstate 'PT403' then null;end;
 if exists(select 1 from public.duuk_audit where entity='duuk_bank_imports' and entity_id=imported.id::text) then raise exception 'Removal audit leaked'; end if;
 execute 'reset role'; perform set_config('request.jwt.claims',jsonb_build_object('sub',disabled,'role','authenticated')::text,true); execute 'set local role authenticated';
 begin perform public.duuk_remove_bank_import(other.id,other.created_at);raise exception 'Disabled removal allowed';exception when sqlstate 'PT403' then null;end;
 execute 'reset role'; perform set_config('request.jwt.claims','{}',true); execute 'set local role anon';
 begin perform public.duuk_remove_bank_import(other.id,other.created_at);raise exception 'Anonymous removal allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if (select count(*) from public.duuk_bank_imports where created_by=actor)<>original_count then raise exception 'Denied removals changed imports'; end if;
end;
$$;
rollback;
