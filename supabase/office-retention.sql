-- Daily retention for aggregate analytics. No billing changes or external calls.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('duuk-analytics-retention','15 3 * * *',$job$
  delete from duuk_private.metric_limits where day < timezone('America/Sao_Paulo',now())::date;
  delete from public.duuk_daily_metrics where day < timezone('America/Sao_Paulo',now())::date - 89;
$job$);
