-- Stops only the new generators. Keep preferences/category and delivered rows,
-- so reversing the frontend never loses notification history or member choices.
drop trigger if exists finance_income_notification on public.duuk_income;
drop trigger if exists finance_expense_notification on public.duuk_expenses;
drop trigger if exists finance_goals_notification on public.duuk_finance_goals;
drop trigger if exists social_action_notification on public.duuk_social_posts;
drop trigger if exists pluggy_action_notification on duuk_private.pluggy_settings;
drop function if exists duuk_private.finance_action_notification();
drop function if exists duuk_private.finance_goals_notification();
drop function if exists duuk_private.social_action_notification();
drop function if exists duuk_private.pluggy_action_notification();
do $$ declare definition text; begin
 select pg_get_functiondef('public.duuk_social_backend(text,jsonb)'::regprocedure) into definition;
 execute replace(definition,'notify_members(''social'', ''social''','notify_members(''system'', ''social''');
end $$;
