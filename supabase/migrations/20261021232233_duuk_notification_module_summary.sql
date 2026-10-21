-- Read-only summary. No caller-provided user, no private message content or credentials.
create or replace function duuk_private.notification_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; modules jsonb;
begin
 if actor is null or not duuk_private.has_permission(null) then
  raise exception 'Confirme os dois fatores para acessar o painel.' using errcode='PT403';
 end if;
 with routes(route) as (values
  ('/admin/agenda'),('/admin/ai'),('/admin/comercial'),('/admin/comercial/clientes'),
  ('/admin/comercial/pipeline'),('/admin/comercial/contatos'),('/admin/comercial/follow-ups'),
  ('/admin/whatsapp'),('/admin/comercial/emails'),('/admin/comercial/modelos'),('/admin/comercial/relatorios'),
  ('/admin/contratos'),('/admin/financeiro'),('/admin/cobrancas'),('/admin/social'),('/admin/portfolio'),
  ('/admin/inicio'),('/admin/midias'),('/admin/insights'),('/admin/spotify'),('/admin/drive'),('/admin/configuracoes')
 ), unread as (
  select case when split_part(split_part(n.link,'?',1),'#',1)='/admin/despesas' then '/admin/financeiro'
   else split_part(split_part(n.link,'?',1),'#',1) end as path
  from public.duuk_notifications n where n.user_id=actor and n.read_at is null
   and duuk_private.has_permission(n.required_permission)
 ), mapped as (
  select (select r.route from routes r where path=r.route or left(path,length(r.route)+1)=r.route||'/' order by length(r.route) desc limit 1) as route from unread
 ), counts as (select route,count(*) n from mapped where route is not null group by route)
 select jsonb_build_object('unread',(select count(*) from unread),'modules',coalesce((select jsonb_object_agg(route,n) from counts),'{}'::jsonb)) into result;
 modules:=result->'modules';
 if duuk_private.has_permission('whatsapp') and exists(
  select 1 from duuk_private.whatsapp_messages m
  join duuk_private.whatsapp_threads t on t.id=m.thread_id
  join duuk_private.whatsapp_config c on c.id=t.config_id
  left join duuk_private.whatsapp_reads r on r.thread_id=t.id and r.user_id=actor
  where c.singleton and m.direction='in' and m.source<>'history' and m.type not in ('reaction','system')
   and m.retracted_at is null and m.occurred_at>coalesce(r.seen_at,'-infinity'::timestamptz)
 ) then modules:=modules||jsonb_build_object('/admin/whatsapp',greatest(1,coalesce((modules->>'/admin/whatsapp')::bigint,0)));end if;
 return jsonb_set(result,'{modules}',modules);
end $$;
revoke all on function duuk_private.notification_summary() from public,anon;
grant execute on function duuk_private.notification_summary() to authenticated;

create or replace function public.duuk_notification_summary() returns jsonb
language sql stable security invoker set search_path='' as $$ select duuk_private.notification_summary(); $$;
revoke all on function public.duuk_notification_summary() from public,anon;
grant execute on function public.duuk_notification_summary() to authenticated;
