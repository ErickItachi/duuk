create or replace function public.duuk_generate_notifications() returns void language plpgsql security invoker set search_path='' as $$ declare e public.duuk_events; f record; p record; n timestamp:=now() at time zone 'America/Sao_Paulo'; total bigint; begin
 for e in select * from public.duuk_events where status in ('planned','confirmed') and start_date between n::date and n::date+1 loop
  if e.start_date=n::date+1 and extract(hour from n)=9 then perform duuk_private.notify_members('agenda','agenda',e.title||' amanhã',case when e.all_day then 'Dia inteiro' else 'Às '||to_char(e.start_time,'HH24:MI') end,'/admin/agenda?dia='||e.start_date,'agenda:tomorrow:'||e.id||':'||e.start_date);end if;
  if not e.all_day and (e.start_date+e.start_time) between n+interval '55 minutes' and n+interval '65 minutes' then perform duuk_private.notify_members('agenda','agenda','Compromisso em 1 hora',e.title||' · '||to_char(e.start_time,'HH24:MI'),'/admin/agenda?dia='||e.start_date,'agenda:hour:'||e.id||':'||e.start_date||':'||e.start_time);end if;
 end loop;
 for f in select u.*,c.name from public.duuk_follow_ups u join public.duuk_clients c on c.id=u.client_id where u.completed_at is null and (u.due_at at time zone 'America/Sao_Paulo')::date=n::date loop perform duuk_private.notify_members('commercial','crm','Follow-up com '||f.name||' hoje',f.notes,'/admin/comercial/follow-ups?filtro=today','followup:'||f.id||':'||n::date,f.owner_id);end loop;
 if extract(hour from n)=9 then
  for p in select owner_id,count(*) as pending from public.duuk_follow_ups where completed_at is null and due_at<now() group by owner_id loop perform duuk_private.notify_members('commercial','crm',p.pending||' follow-ups pendentes','Organize os próximos contatos da equipe.','/admin/comercial/follow-ups?filtro=overdue','followup:pending:'||n::date,p.owner_id);end loop;
  if extract(day from n)=1 then select coalesce(sum(amount_cents),0) into total from public.duuk_expenses where due_date >= date_trunc('month',n)::date-interval '1 month' and due_date<date_trunc('month',n)::date;
   perform duuk_private.notify_members('finance','finance','Resumo financeiro de '||to_char(n-interval '1 month','MM/YYYY'),'O mês anterior terminou com R$ '||replace(to_char(total::numeric/100,'FM999999999990.00'),'.',',')||' em despesas.','/admin/financeiro?mes='||to_char(n-interval '1 month','YYYY-MM'),'finance:month:'||date_trunc('month',n)::date);
  end if;
 end if;
 delete from public.duuk_notifications where created_at<now()-interval '180 days';
end; $$;
