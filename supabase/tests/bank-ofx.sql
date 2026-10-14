-- Synthetic accounts/users only. All imports, records and audit entries roll back.
begin;
do $$
declare
 actor uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); financial uuid:=gen_random_uuid(); other_role uuid:=gen_random_uuid();
 account text:=gen_random_uuid()::text; payload jsonb; result jsonb; credit public.duuk_bank_transactions; debit public.duuk_bank_transactions; extra public.duuk_bank_transactions;
 request uuid:=gen_random_uuid(); action_request uuid:=gen_random_uuid(); entry_id uuid; entry_version bigint; count_before integer;
begin
 insert into public.duuk_roles(id,name) values(financial,'QA OFX '||financial),(other_role,'QA OFX denied '||other_role);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(financial,'finance',true),(financial,'audit',true),(other_role,'audit',true);
 insert into auth.users(id,email) values(actor,actor||'@test.invalid'),(denied,denied||'@test.invalid'),(disabled,disabled||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active) values(actor,'QA OFX',actor||'@test.invalid',financial,true),(denied,'QA OFX denied',denied||'@test.invalid',other_role,true),(disabled,'QA OFX disabled',disabled||'@test.invalid',financial,false);
 if has_table_privilege('authenticated','public.duuk_bank_transactions','insert') or has_table_privilege('authenticated','public.duuk_bank_transactions','update') or has_table_privilege('anon','public.duuk_bank_imports','select') then raise exception 'Broad bank grants'; end if;
 if not (select relrowsecurity from pg_class where oid='public.duuk_bank_transactions'::regclass) or not (select relrowsecurity from pg_class where oid='public.duuk_bank_imports'::regclass) then raise exception 'Missing bank RLS'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true); execute 'set local role authenticated';
 payload:=jsonb_build_object('request_id',request,'bank_id','260','account_id',account,'account_label','QA Nubank PJ','currency','BRL','file_name','qa.ofx','file_hash',repeat('a',64),'balance',jsonb_build_object('amount_cents',7000,'date','2020-01-15'),'transactions',jsonb_build_array(jsonb_build_object('fit_id','credit','posted_date','2020-01-15','amount_cents',12000,'title','QA credit'),jsonb_build_object('fit_id','debit','posted_date','2020-01-15','amount_cents',-5000,'title','QA debit')));
 result:=public.duuk_import_bank_statement(payload);
 if (result->>'inserted')::integer<>2 or (result->>'duplicates')::integer<>0 then raise exception 'Initial import counts'; end if;
 if exists(select 1 from public.duuk_income where created_by=actor) then raise exception 'Import created automatic income'; end if;
 result:=public.duuk_import_bank_statement(payload);
 if result->>'replayed'<>'true' or (select count(*) from public.duuk_bank_imports where created_by=actor)<>1 then raise exception 'Request replay duplicated import'; end if;
 payload:=jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())); result:=public.duuk_import_bank_statement(payload);
 if (result->>'inserted')::integer<>0 or (result->>'duplicates')::integer<>2 then raise exception 'Overlap duplicates not ignored'; end if;
 select * into credit from public.duuk_bank_transactions where created_by=actor and amount_cents=12000;
 select * into debit from public.duuk_bank_transactions where created_by=actor and amount_cents=-5000;
 select count(*) into count_before from public.duuk_bank_imports where created_by=actor;
 begin
  perform public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{transactions}',jsonb_build_array(jsonb_build_object('fit_id','before-conflict','posted_date','2020-01-15','amount_cents',99,'title','Never committed'),jsonb_build_object('fit_id','credit','posted_date','2020-01-15','amount_cents',12001,'title','Conflicting credit'))));
  raise exception 'Conflicting identity accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select count(*) from public.duuk_bank_imports where created_by=actor)<>count_before or exists(select 1 from public.duuk_bank_transactions where created_by=actor and amount_cents=99) then raise exception 'Conflict failed atomic rollback'; end if;
 begin perform public.duuk_import_bank_statement(jsonb_set(payload,'{currency}','"USD"'));raise exception 'Foreign currency accepted';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{transactions,0,posted_date}','"2099-12-31"'));raise exception 'Future bank movement accepted';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{transactions,0,amount_cents}','0'));raise exception 'Zero accepted';exception when sqlstate 'PT400' then null;end;
 begin update public.duuk_bank_transactions set amount_cents=1 where id=credit.id;raise exception 'Direct bank edit accepted';exception when insufficient_privilege then null;end;

 result:=public.duuk_reconcile_bank_transaction(credit.id,credit.version,'create',jsonb_build_object('request_id',action_request,'title','Income from QA bank','category','Projetos'));
 entry_id:=(result->>'linked_income_id')::uuid;
 if not exists(select 1 from public.duuk_income where id=entry_id and created_by=actor and status='paid' and amount_cents=12000 and paid_date='2020-01-15') then raise exception 'Bank income fields/actor invalid'; end if;
 result:=public.duuk_reconcile_bank_transaction(credit.id,credit.version,'create',jsonb_build_object('request_id',action_request,'title','Income from QA bank','category','Projetos'));
 if (select count(*) from public.duuk_income where created_by=actor)<>1 or (result->>'linked_income_id')::uuid<>entry_id then raise exception 'Reconciliation replay duplicated income'; end if;
 begin perform public.duuk_reconcile_bank_transaction(credit.id,credit.version,'create',jsonb_build_object('request_id',gen_random_uuid(),'title','Duplicate','category','Projetos'));raise exception 'Stale bank edit accepted';exception when sqlstate 'PT409' then null;end;

 insert into public.duuk_expenses(title,amount_cents,category,due_date) values('Existing QA payable',5000,'other','2020-02-01') returning id,version into entry_id,entry_version;
 result:=public.duuk_reconcile_bank_transaction(debit.id,debit.version,'link',jsonb_build_object('request_id',gen_random_uuid(),'entry_id',entry_id,'entry_version',entry_version));
 if not exists(select 1 from public.duuk_expenses where id=entry_id and due_date='2020-02-01' and status='paid' and paid_date='2020-01-15' and amount_cents=5000) then raise exception 'Linking existing expense changed due or wrong settlement'; end if;
 select version into entry_version from public.duuk_expenses where id=entry_id;
 perform public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{transactions}',jsonb_build_array(jsonb_build_object('fit_id','other-debit','posted_date','2020-01-15','amount_cents',-5000,'title','Other bank debit'))));
 select * into extra from public.duuk_bank_transactions where created_by=actor and title='Other bank debit';
 begin perform public.duuk_reconcile_bank_transaction(extra.id,extra.version,'link',jsonb_build_object('request_id',gen_random_uuid(),'entry_id',entry_id,'entry_version',entry_version));raise exception 'Same expense linked twice';exception when sqlstate 'PT409' then null;end;
 if (select version from public.duuk_expenses where id=entry_id)<>entry_version then raise exception 'Failed link changed expense revision'; end if;
 result:=public.duuk_reconcile_bank_transaction(extra.id,extra.version,'ignore',jsonb_build_object('request_id',gen_random_uuid()));
 if result->>'ignored_at' is null then raise exception 'Ignore not stored'; end if;
 result:=public.duuk_reconcile_bank_transaction(extra.id,(result->>'version')::bigint,'review',jsonb_build_object('request_id',gen_random_uuid()));
 if result->>'ignored_at' is not null then raise exception 'Review not restored'; end if;
 select * into debit from public.duuk_bank_transactions where id=debit.id;
 perform public.duuk_reconcile_bank_transaction(debit.id,debit.version,'unlink',jsonb_build_object('request_id',gen_random_uuid()));
 if not exists(select 1 from public.duuk_expenses where id=entry_id) or exists(select 1 from public.duuk_bank_transactions where id=debit.id and linked_expense_id is not null) then raise exception 'Unlink deleted expense or kept reference'; end if;
 -- Same FITID from another account is a distinct bank transaction.
 result:=public.duuk_import_bank_statement(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{account_id}',to_jsonb(gen_random_uuid()::text)));
 if (result->>'inserted')::integer<>2 then raise exception 'Dedup crossed accounts'; end if;
 -- Legacy deletion still works; only the reference is cleared, never the
 -- imported bank evidence or its immutable amount/date.
 select linked_income_id into entry_id from public.duuk_bank_transactions where id=credit.id;
 delete from public.duuk_income where id=entry_id;
 if not exists(select 1 from public.duuk_bank_transactions where id=credit.id and linked_income_id is null and amount_cents=12000 and posted_date='2020-01-15') then raise exception 'Ledger deletion broke bank evidence'; end if;
 if exists(select 1 from public.duuk_audit where actor_id=actor and entity in ('duuk_bank_imports','duuk_bank_transactions') and required_permission<>'finance') then raise exception 'Bank audit exposed'; end if;

 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',denied,'role','authenticated')::text,true);execute 'set local role authenticated';
 if exists(select 1 from public.duuk_bank_transactions where created_by=actor) or exists(select 1 from public.duuk_bank_imports where created_by=actor) or exists(select 1 from public.duuk_audit where actor_id=actor and entity in ('duuk_bank_imports','duuk_bank_transactions')) then raise exception 'Bank data/audit leaked to nonfinance member'; end if;
 begin perform public.duuk_import_bank_statement(payload);raise exception 'Denied import allowed';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_reconcile_bank_transaction(extra.id,extra.version,'ignore',jsonb_build_object('request_id',gen_random_uuid()));raise exception 'Denied reconcile allowed';exception when sqlstate 'PT403' then null;end;
 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',disabled,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.duuk_import_bank_statement(payload);raise exception 'Disabled import allowed';exception when sqlstate 'PT403' then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{}',true);execute 'set local role anon';
 begin perform public.duuk_import_bank_statement(payload);raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end;
$$;
rollback;
