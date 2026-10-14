-- Incremental financial management. Expenses remain in duuk_expenses: no
-- copies, migrations of business records, bank connections or public views.
-- Requires the existing office/platform/audit migrations.

create table public.duuk_income (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160 and char_length(trim(title)) >= 1),
  description text not null default '' check (char_length(description) <= 2000),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  category text not null check (char_length(category) <= 80 and char_length(trim(category)) >= 1),
  counterparty_name text not null default '' check (char_length(counterparty_name) <= 160),
  due_date date not null check (due_date between date '1900-01-01' and date '2099-12-31'),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_date date check (paid_date between date '1900-01-01' and date '2099-12-31'),
  created_by uuid not null default auth.uid() references auth.users(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid' and paid_date is not null) or (status = 'pending' and paid_date is null))
);
create index duuk_income_due_date_idx on public.duuk_income(due_date, id);
create index duuk_income_paid_date_idx on public.duuk_income(paid_date, id) where status = 'paid';
create index duuk_income_created_by_idx on public.duuk_income(created_by);
-- Cash movements are read by settlement date even when a bill was due in a
-- different month. This adds only an index to the existing expense table.
create index duuk_expenses_paid_date_idx on public.duuk_expenses(paid_date, id) where status = 'paid';

create function duuk_private.finance_income_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.paid_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do recebimento não pode estar no futuro.' using errcode = 'PT400';
  end if;
  return new;
end;
$$;
revoke all on function duuk_private.finance_income_guard() from public, anon, authenticated;
create trigger finance_income_guard before insert or update on public.duuk_income
for each row execute function duuk_private.finance_income_guard();
create trigger income_revision before update on public.duuk_income
for each row execute function duuk_private.expense_revision();

alter table public.duuk_income enable row level security;
revoke all on public.duuk_income from public, anon, authenticated;
grant select, delete on public.duuk_income to authenticated;
grant insert(title, description, amount_cents, category, counterparty_name, due_date, status, paid_date),
  update(title, description, amount_cents, category, counterparty_name, due_date, status, paid_date)
on public.duuk_income to authenticated;
grant all on public.duuk_income to service_role;
create policy income_select on public.duuk_income for select to authenticated
  using ((select duuk_private.has_permission('finance')));
create policy income_insert on public.duuk_income for insert to authenticated
  with check ((select duuk_private.has_permission('finance')));
create policy income_update on public.duuk_income for update to authenticated
  using ((select duuk_private.has_permission('finance')))
  with check ((select duuk_private.has_permission('finance')));
create policy income_delete on public.duuk_income for delete to authenticated
  using ((select duuk_private.has_permission('finance')));

-- Goals are specific to a month. Changing the October goal never rewrites
-- September. Zero means no goal/budget set, rather than a synthetic target.
create table public.duuk_finance_goals (
  month date primary key check (extract(day from month) = 1 and month between date '1900-01-01' and date '2099-12-01'),
  revenue_goal_cents bigint not null default 0 check (revenue_goal_cents between 0 and 100000000000),
  expense_budget_cents bigint not null default 0 check (expense_budget_cents between 0 and 100000000000),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid default auth.uid() references auth.users(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index duuk_finance_goals_created_by_idx on public.duuk_finance_goals(created_by);
create index duuk_finance_goals_updated_by_idx on public.duuk_finance_goals(updated_by);
create function duuk_private.finance_goal_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;
revoke all on function duuk_private.finance_goal_revision() from public, anon, authenticated;
create trigger finance_goal_revision before update on public.duuk_finance_goals
for each row execute function duuk_private.finance_goal_revision();

alter table public.duuk_finance_goals enable row level security;
revoke all on public.duuk_finance_goals from public, anon, authenticated;
grant select, delete on public.duuk_finance_goals to authenticated;
grant insert(month, revenue_goal_cents, expense_budget_cents), update(revenue_goal_cents, expense_budget_cents)
on public.duuk_finance_goals to authenticated;
grant all on public.duuk_finance_goals to service_role;
create policy finance_goals_select on public.duuk_finance_goals for select to authenticated
  using ((select duuk_private.has_permission('finance')));
create policy finance_goals_insert on public.duuk_finance_goals for insert to authenticated
  with check ((select duuk_private.has_permission('finance')));
create policy finance_goals_update on public.duuk_finance_goals for update to authenticated
  using ((select duuk_private.has_permission('finance')))
  with check ((select duuk_private.has_permission('finance')));
create policy finance_goals_delete on public.duuk_finance_goals for delete to authenticated
  using ((select duuk_private.has_permission('finance')));

-- Append the new financial entities without replacing the existing Drive,
-- contracts, CRM or signing audit mapping. Postgres runs same-event triggers
-- alphabetically: this scope runs after the existing audit_scope trigger.
create function duuk_private.finance_audit_scope() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.entity in ('duuk_income', 'duuk_finance_goals') then
    new.required_permission := 'finance';
  end if;
  return new;
end;
$$;
revoke all on function duuk_private.finance_audit_scope() from public, anon, authenticated;
create trigger duuk_finance_audit_scope before insert on public.duuk_audit
for each row execute function duuk_private.finance_audit_scope();

-- Reuse the private immutable audit table. Capture financial changes rather
-- than PDF bytes, private messages or unrelated client information.
create function duuk_private.finance_audit_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous jsonb; current_record jsonb; actor uuid := auth.uid(); target text;
begin
  -- Only authenticated callers with financial access may attribute actions
  -- to a member; service-side maintenance without a JWT remains system work.
  if actor is not null and not duuk_private.member_permission(actor, 'finance') then
    raise exception 'Sem acesso ao Financeiro.' using errcode = 'PT403';
  end if;
  if tg_op <> 'INSERT' then previous := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then current_record := to_jsonb(new); end if;
  target := coalesce(current_record->>'id', previous->>'id', current_record->>'month', previous->>'month');
  insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details)
  values(actor, coalesce((select name from public.duuk_profiles where id = actor), 'Sistema'),
    lower(tg_op), tg_table_name, target,
    case when tg_table_name = 'duuk_finance_goals' then 'Planejamento financeiro atualizado'
      when tg_op = 'INSERT' then 'Receita criada'
      when tg_op = 'DELETE' then 'Receita excluída' else 'Receita atualizada' end,
    jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(current_record->>'title', previous->>'title'),
      'previous_status', previous->>'status', 'status', current_record->>'status',
      'previous_amount_cents', previous->'amount_cents', 'amount_cents', current_record->'amount_cents',
      'previous_paid_date', previous->>'paid_date', 'paid_date', current_record->>'paid_date',
      'month', coalesce(current_record->>'month', previous->>'month'),
      'previous_revenue_goal_cents', previous->'revenue_goal_cents', 'revenue_goal_cents', current_record->'revenue_goal_cents',
      'previous_expense_budget_cents', previous->'expense_budget_cents', 'expense_budget_cents', current_record->'expense_budget_cents')));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function duuk_private.finance_audit_changes() from public, anon, authenticated;
create trigger duuk_finance_audit_changes after insert or update or delete on public.duuk_income
for each row execute function duuk_private.finance_audit_changes();
create trigger duuk_finance_audit_changes after insert or update or delete on public.duuk_finance_goals
for each row execute function duuk_private.finance_audit_changes();
