-- Run after 20261013213527_duuk_finance_income_goals.sql.
-- All synthetic users, movements, goals and audit records roll back. No
-- notifications, e-mails, payments, bank APIs or external services are used.
begin;
do $$
declare
  actor uuid := gen_random_uuid(); denied uuid := gen_random_uuid(); disabled uuid := gen_random_uuid();
  finance_role uuid := gen_random_uuid(); denied_role uuid := gen_random_uuid();
  income_id uuid; paid_id uuid; expense_id uuid; revenue_revision bigint; affected integer;
  goal_month date; following_month date; received bigint; paid bigint; due_total bigint;
  audit_count integer; preserved_scope text;
begin
  insert into public.duuk_roles(id, name) values
    (finance_role, 'QA finance ' || finance_role), (denied_role, 'QA denied ' || denied_role);
  insert into public.duuk_role_permissions(role_id, permission, allowed) values
    (finance_role, 'finance', true), (finance_role, 'audit', true), (denied_role, 'audit', true);
  insert into auth.users(id, email) values
    (actor, actor || '@test.invalid'), (denied, denied || '@test.invalid'), (disabled, disabled || '@test.invalid');
  insert into public.duuk_profiles(id, name, email, role_id, active) values
    (actor, 'Fixture financeiro', actor || '@test.invalid', finance_role, true),
    (denied, 'Fixture sem financeiro', denied || '@test.invalid', denied_role, true),
    (disabled, 'Fixture financeiro desativado', disabled || '@test.invalid', finance_role, false);

  if not (select relrowsecurity from pg_class where oid = 'public.duuk_income'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.duuk_finance_goals'::regclass) then
    raise exception 'RLS não ativado no Financeiro';
  end if;
  if has_table_privilege('anon', 'public.duuk_income', 'select')
    or has_table_privilege('anon', 'public.duuk_finance_goals', 'select')
    or has_table_privilege('authenticated', 'public.duuk_income', 'insert')
    or has_table_privilege('authenticated', 'public.duuk_income', 'update')
    or has_column_privilege('authenticated', 'public.duuk_income', 'created_by', 'insert')
    or has_column_privilege('authenticated', 'public.duuk_income', 'version', 'update')
    or has_column_privilege('authenticated', 'public.duuk_finance_goals', 'month', 'update')
    or has_column_privilege('authenticated', 'public.duuk_finance_goals', 'updated_by', 'update') then
    raise exception 'Privilégios amplos ou autoria exposta';
  end if;
  if has_function_privilege('authenticated', 'duuk_private.finance_audit_changes()', 'execute')
    or has_function_privilege('anon', 'duuk_private.finance_audit_changes()', 'execute')
    or has_function_privilege('authenticated', 'duuk_private.finance_goal_revision()', 'execute') then
    raise exception 'Helpers internos expostos';
  end if;
  if not exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'duuk_expenses_paid_date_idx')
    or not exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'duuk_income_paid_date_idx') then
    raise exception 'Índice por baixa ausente';
  end if;

  select d::date into goal_month
  from generate_series(date '1900-01-01', date '1905-01-01', interval '1 month') d
  where not exists(select 1 from public.duuk_finance_goals g where g.month in (d::date, (d + interval '1 month')::date))
  order by d limit 1;
  if goal_month is null then raise exception 'Sem mês livre para fixture'; end if;
  following_month := (goal_month + interval '1 month')::date;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.duuk_income(title, category, counterparty_name, amount_cents, due_date)
    values('Contrato fixture', 'Produção personalizada', 'Cliente fixture', 50000, date '2020-01-15')
    returning id, version into income_id, revenue_revision;
  if (select created_by from public.duuk_income where id = income_id) <> actor or revenue_revision <> 1 then
    raise exception 'Autoria ou primeira revisão incorretas';
  end if;

  begin update public.duuk_income set created_by = denied where id = income_id;
    raise exception 'Autor adulterado'; exception when insufficient_privilege then null; end;
  begin update public.duuk_income set version = 99 where id = income_id;
    raise exception 'Revisão adulterada'; exception when insufficient_privilege then null; end;
  begin update public.duuk_income set id = gen_random_uuid() where id = income_id;
    raise exception 'Identificador adulterado'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date, created_by)
    values('Autor falso', 'Projeto', 1, date '2020-01-01', denied);
    raise exception 'Autor falso inserido'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Zero', 'Projeto', 0, date '2020-01-01');
    raise exception 'Receita zero aceita'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Limite', 'Projeto', 100000000001, date '2020-01-01');
    raise exception 'Limite monetário ignorado'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values(repeat(' ', 161) || 'X', 'Projeto', 1, date '2020-01-01');
    raise exception 'Título excessivo com espaços aceito'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Categoria vazia', '   ', 1, date '2020-01-01');
    raise exception 'Categoria vazia aceita'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Categoria enorme', repeat('X', 81), 1, date '2020-01-01');
    raise exception 'Categoria excessiva aceita'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, counterparty_name, amount_cents, due_date)
    values('Cliente enorme', 'Projeto', repeat('X', 161), 1, date '2020-01-01');
    raise exception 'Nome de pagador excessivo aceito'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date, status)
    values('Recebido sem baixa', 'Projeto', 1, date '2020-01-01', 'paid');
    raise exception 'Recebimento sem data aceito'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date, paid_date)
    values('Pendente com baixa', 'Projeto', 1, date '2020-01-01', date '2020-01-01');
    raise exception 'Pendente com baixa aceito'; exception when check_violation then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date, status, paid_date)
    values('Recebimento futuro', 'Projeto', 1, date '2020-01-01', 'paid', (now() at time zone 'America/Sao_Paulo')::date + 1);
    raise exception 'Recebimento futuro aceito'; exception when sqlstate 'PT400' then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Vencimento infinito', 'Projeto', 1, 'infinity'::date);
    raise exception 'Data infinita aceita'; exception when check_violation then null; end;

  update public.duuk_income set title = 'Contrato fixture revisado'
    where id = income_id and version = revenue_revision;
  if (select version from public.duuk_income where id = income_id) <> 2 then
    raise exception 'Revisão não incrementou';
  end if;
  update public.duuk_income set title = 'Sobrescrever versão antiga'
    where id = income_id and version = revenue_revision;
  get diagnostics affected = row_count;
  if affected <> 0 or (select title from public.duuk_income where id = income_id) <> 'Contrato fixture revisado' then
    raise exception 'Atualização concorrente sobrescreveu receita';
  end if;
  update public.duuk_income set status = 'paid', paid_date = date '2020-02-03'
    where id = income_id and version = 2;
  insert into public.duuk_income(title, category, amount_cents, due_date, status, paid_date)
    values('Outra baixa fixture', 'Projetos', 20000, date '2020-02-05', 'paid', date '2020-02-05')
    returning id into paid_id;
  insert into public.duuk_expenses(title, category, amount_cents, due_date, status, paid_date)
    values('Despesa legada fixture', 'production', 10000, date '2020-01-20', 'paid', date '2020-02-06')
    returning id into expense_id;
  select sum(amount_cents) into received from public.duuk_income
    where created_by = actor and status = 'paid' and paid_date >= date '2020-02-01' and paid_date < date '2020-03-01';
  select sum(amount_cents) into paid from public.duuk_expenses
    where id = expense_id and status = 'paid' and paid_date >= date '2020-02-01' and paid_date < date '2020-03-01';
  select sum(amount_cents) into due_total from public.duuk_income
    where created_by = actor and due_date >= date '2020-02-01' and due_date < date '2020-03-01';
  if received <> 70000 or paid <> 10000 or received - paid <> 60000 or due_total <> 20000 then
    raise exception 'Fluxo de caixa confundiu vencimento com recebimento';
  end if;
  if (select count(*) from public.duuk_income where created_by = actor and
    ((due_date >= date '2020-02-01' and due_date < date '2020-03-01') or
     (status = 'paid' and paid_date >= date '2020-02-01' and paid_date < date '2020-03-01'))) <> 2 then
    raise exception 'Leitura mensal perdeu baixa com vencimento de outro mês';
  end if;
  if (select created_by from public.duuk_expenses where id = expense_id) <> actor then
    raise exception 'Despesas legadas perderam autoria';
  end if;
  update public.duuk_expenses set description = 'Continua editável' where id = expense_id and version = 1;
  if (select version from public.duuk_expenses where id = expense_id) <> 2 then
    raise exception 'Revisão de despesas legadas alterada';
  end if;

  insert into public.duuk_finance_goals(month, revenue_goal_cents, expense_budget_cents)
    values(goal_month, 80000, 40000), (following_month, 90000, 45000);
  if (select created_by from public.duuk_finance_goals where month = goal_month) <> actor then
    raise exception 'Meta perdeu autoria';
  end if;
  update public.duuk_finance_goals set revenue_goal_cents = 100000, expense_budget_cents = 0
    where month = goal_month and version = 1;
  if (select version from public.duuk_finance_goals where month = goal_month) <> 2
    or (select updated_by from public.duuk_finance_goals where month = goal_month) <> actor
    or (select revenue_goal_cents from public.duuk_finance_goals where month = following_month) <> 90000 then
    raise exception 'Revisão ou isolamento de metas mensais falhou';
  end if;
  update public.duuk_finance_goals set revenue_goal_cents = 1 where month = goal_month and version = 1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Meta antiga sobrescrita'; end if;
  begin update public.duuk_finance_goals set month = (goal_month + interval '2 months')::date where month = goal_month;
    raise exception 'Mês de meta alterado'; exception when insufficient_privilege then null; end;
  begin update public.duuk_finance_goals set created_by = denied where month = goal_month;
    raise exception 'Autor de meta alterado'; exception when insufficient_privilege then null; end;
  begin update public.duuk_finance_goals set revenue_goal_cents = -1 where month = goal_month;
    raise exception 'Meta negativa aceita'; exception when check_violation then null; end;
  begin update public.duuk_finance_goals set expense_budget_cents = 100000000001 where month = goal_month;
    raise exception 'Orçamento excessivo aceito'; exception when check_violation then null; end;
  begin insert into public.duuk_finance_goals(month) values(goal_month + 1);
    raise exception 'Meta fora do primeiro dia aceita'; exception when check_violation then null; end;

  select count(*) into audit_count from public.duuk_audit
    where actor_id = actor and entity in ('duuk_income', 'duuk_finance_goals') and required_permission = 'finance';
  if audit_count < 7 or not exists(select 1 from public.duuk_audit where actor_id = actor
    and entity = 'duuk_finance_goals' and entity_id = goal_month::text and details->>'revenue_goal_cents' = '100000') then
    raise exception 'Histórico financeiro não preservado';
  end if;

  execute 'reset role';
  -- Scope addition preserves existing mappings, including Google Drive.
  insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary)
    values(actor, 'Fixture', 'update', 'google_drive', 'fixture-finance', 'Fixture') returning required_permission into preserved_scope;
  if preserved_scope <> 'permissions' then raise exception 'Escopo de auditoria do Drive foi alterado'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', denied, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists(select 1 from public.duuk_income where id in (income_id, paid_id))
    or exists(select 1 from public.duuk_finance_goals where month in (goal_month, following_month))
    or exists(select 1 from public.duuk_audit where actor_id = actor and entity in ('duuk_income', 'duuk_finance_goals')) then
    raise exception 'Financeiro ou auditoria vazaram para membro sem permissão';
  end if;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Negado', 'Projetos', 1, date '2020-01-01');
    raise exception 'Receita sem permissão inserida'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_finance_goals(month) values(goal_month);
    raise exception 'Meta sem permissão inserida'; exception when insufficient_privilege then null; end;
  update public.duuk_income set title = 'Negado' where id = income_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Receita sem permissão alterada'; end if;
  delete from public.duuk_income where id = income_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Receita sem permissão excluída'; end if;
  update public.duuk_finance_goals set revenue_goal_cents = 1 where month = goal_month;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Meta sem permissão alterada'; end if;
  delete from public.duuk_finance_goals where month = goal_month;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Meta sem permissão excluída'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', disabled, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists(select 1 from public.duuk_income where id = income_id) then raise exception 'Conta desativada recebeu receitas'; end if;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Desativado', 'Projetos', 1, date '2020-01-01');
    raise exception 'Conta desativada criou receita'; exception when insufficient_privilege then null; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin perform 1 from public.duuk_income; raise exception 'Visitante leu receitas'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.duuk_finance_goals; raise exception 'Visitante leu metas'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_income(title, category, amount_cents, due_date)
    values('Visitante', 'Projetos', 1, date '2020-01-01');
    raise exception 'Visitante criou receita'; exception when insufficient_privilege then null; end;
  begin update public.duuk_income set title = 'Visitante' where id = income_id;
    raise exception 'Visitante alterou receita'; exception when insufficient_privilege then null; end;
  begin delete from public.duuk_income where id = income_id;
    raise exception 'Visitante excluiu receita'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_finance_goals(month) values(goal_month);
    raise exception 'Visitante criou meta'; exception when insufficient_privilege then null; end;
  begin update public.duuk_finance_goals set revenue_goal_cents = 1 where month = goal_month;
    raise exception 'Visitante alterou meta'; exception when insufficient_privilege then null; end;
  begin delete from public.duuk_finance_goals where month = goal_month;
    raise exception 'Visitante excluiu meta'; exception when insufficient_privilege then null; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.duuk_income where id = income_id and version = 2;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Exclusão concorrente de receita ignorou versão'; end if;
  delete from public.duuk_income where id = income_id and version = 3;
  if exists(select 1 from public.duuk_income where id = income_id) then raise exception 'Exclusão de receita falhou'; end if;
  delete from public.duuk_finance_goals where month = goal_month and version = 1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Exclusão concorrente de meta ignorou versão'; end if;
  delete from public.duuk_finance_goals where month = goal_month and version = 2;
  if exists(select 1 from public.duuk_finance_goals where month = goal_month) then raise exception 'Exclusão de meta falhou'; end if;
  execute 'reset role';
end;
$$;
rollback;
select 'PASS: finance CRUD, finance/anon/disabled access, protected authorship, revisions, monetary/date limits, settlement across months, monthly goals, audit isolation and legacy expense compatibility' result;
