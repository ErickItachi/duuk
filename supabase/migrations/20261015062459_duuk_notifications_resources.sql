-- Future real actions only. Existing data is neither backfilled nor changed.
alter table public.duuk_notification_preferences add column social boolean not null default true;
grant insert(social), update(social) on public.duuk_notification_preferences to authenticated;
alter table public.duuk_notifications drop constraint duuk_notifications_category_check;
alter table public.duuk_notifications add constraint duuk_notifications_category_check
  check(category in ('agenda','projects','contracts','finance','commercial','social','system'));

create function duuk_private.finance_action_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; heading text; noun text; source text; period text;
begin
 source := case when TG_TABLE_NAME='duuk_income' then 'income' else 'expense' end;
 noun := case when source='income' then 'receita' else 'despesa' end;
 if TG_OP='DELETE' then item:=to_jsonb(old); heading:=initcap(noun)||' removida';
 else
  item:=to_jsonb(new);
  if TG_OP='INSERT' then
   heading:=case when new.status='paid' then case when source='income' then 'Receita recebida registrada' else 'Despesa paga registrada' end else 'Nova '||noun||' prevista' end;
  elsif new.status is distinct from old.status then
   heading:=case when new.status='paid' then case when source='income' then 'Recebimento confirmado' else 'Pagamento de despesa confirmado' end else 'Baixa de '||noun||' desfeita' end;
  elsif new.due_date is distinct from old.due_date then heading:='Vencimento de '||noun||' alterado';
  else return new;
  end if;
 end if;
 period:=left(coalesce(item->>'due_date',''),7);
 perform duuk_private.notify_action('finance','finance',heading,item->>'title',
  '/admin/financeiro?aba=contas&mes='||period,'finance:'||source||':'||(item->>'id')||':'||TG_OP||':'||(item->>'version'));
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
create trigger finance_income_notification after insert or update or delete on public.duuk_income
 for each row execute function duuk_private.finance_action_notification();
create trigger finance_expense_notification after insert or update or delete on public.duuk_expenses
 for each row execute function duuk_private.finance_action_notification();

create function duuk_private.finance_goals_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.revenue_goal_cents=old.revenue_goal_cents and new.expense_budget_cents=old.expense_budget_cents then return new;end if;
 if TG_OP='INSERT' and new.revenue_goal_cents=0 and new.expense_budget_cents=0 then return new;end if;
 perform duuk_private.notify_action('finance','finance',
  case when new.revenue_goal_cents=0 and new.expense_budget_cents=0 then 'Metas financeiras removidas' else 'Metas financeiras atualizadas' end,
  'O planejamento de '||to_char(new.month,'MM/YYYY')||' foi atualizado.',
  '/admin/financeiro?aba=contas&mes='||to_char(new.month,'YYYY-MM'),'finance:goals:'||new.month||':'||new.version);
 return new;
end $$;
create trigger finance_goals_notification after insert or update on public.duuk_finance_goals
 for each row execute function duuk_private.finance_goals_notification();

create function duuk_private.social_action_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare heading text; message text; key text;
begin
 if TG_OP='UPDATE' and new.status=old.status and (new.status<>'scheduled' or new.scheduled_at is not distinct from old.scheduled_at) then return new;end if;
 if new.status='scheduled' then
  heading:=case when TG_OP='UPDATE' and old.status='scheduled' then 'Publicação do Instagram reagendada' else 'Publicação do Instagram agendada' end;
  message:='Programada para '||to_char(new.scheduled_at at time zone 'America/Sao_Paulo','DD/MM/YYYY às HH24:MI')||' (Brasília).';
 elsif new.status='published' then heading:='Publicado no Instagram';message:='A publicação foi confirmada pelo Instagram.';
 elsif new.status='failed' then heading:='Não foi possível publicar no Instagram';message:='Abra a publicação para conferir o motivo e revisar a próxima tentativa.';
 elsif TG_OP='UPDATE' and old.status='scheduled' and new.status='draft' then heading:='Agendamento do Instagram cancelado';message:='A publicação voltou para rascunho e não será enviada neste agendamento.';
 else return new;
 end if;
 -- Same keys as the worker: it may additionally notify the requester, once.
 key:='social:'||new.status||':'||new.id||':'||new.version;
 perform duuk_private.notify_action('social','social',heading,message,'/admin/social/calendario?post='||new.id,key);
 return new;
end $$;
create trigger social_action_notification after insert or update on public.duuk_social_posts
 for each row execute function duuk_private.social_action_notification();

-- The existing backend already sends delivery and reconnection notices. Keep
-- their exact behavior/keys while letting the member control the Social category.
do $$ declare definition text; begin
 select pg_get_functiondef('public.duuk_social_backend(text,jsonb)'::regprocedure) into definition;
 if position('notify_members(''system'', ''social''' in definition)=0 then raise exception 'Social notification call sites changed; review migration';end if;
 execute replace(definition,'notify_members(''system'', ''social''','notify_members(''social'', ''social''');
end $$;

create function duuk_private.pluggy_action_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.item_id is not distinct from old.item_id and new.account_id is not distinct from old.account_id then return new;end if;
 perform duuk_private.notify_action('system','finance',
  case when new.account_id is null then 'Conexão bancária removida' else 'Conta bancária do Financeiro atualizada' end,
  case when new.account_id is null then 'Reconecte o Meu Pluggy para consultar saldo e extrato. Os lançamentos cadastrados continuam disponíveis.' else 'A equipe já pode consultar a conta selecionada no Meu Pluggy.' end,
  '/admin/configuracoes/integracoes','pluggy:connection:'||new.version);
 return new;
end $$;
create trigger pluggy_action_notification after update on duuk_private.pluggy_settings
 for each row execute function duuk_private.pluggy_action_notification();

revoke all on function duuk_private.finance_action_notification(),duuk_private.finance_goals_notification(),
 duuk_private.social_action_notification(),duuk_private.pluggy_action_notification() from public,anon,authenticated;
