create table public.duuk_notification_preferences(user_id uuid primary key references public.duuk_profiles on delete cascade,agenda boolean not null default true,contracts boolean not null default true,finance boolean not null default true,commercial boolean not null default true,system boolean not null default true);
create table public.duuk_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.duuk_profiles on delete cascade,category text not null check(category in ('agenda','contracts','finance','commercial','system')),required_permission text references public.duuk_permission_keys,title text not null,body text not null default '',link text not null check(link like '/admin%'),dedupe_key text not null,read_at timestamptz,push_attempts integer not null default 0,push_sent_at timestamptz,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(user_id,dedupe_key));
create index duuk_notifications_user_time_idx on public.duuk_notifications(user_id,created_at desc);
create index duuk_notifications_push_idx on public.duuk_notifications(next_attempt_at) where push_sent_at is null and push_attempts<4;
create index duuk_notifications_permission_idx on public.duuk_notifications(required_permission);
create table public.duuk_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.duuk_profiles on delete cascade,endpoint text not null unique,keys jsonb not null,device_name text not null default '',created_at timestamptz not null default now(),last_used_at timestamptz not null default now());
create index duuk_push_subscriptions_user_idx on public.duuk_push_subscriptions(user_id);
create table public.duuk_releases(version text primary key,released_at timestamptz not null default now());
create table public.duuk_release_seen(user_id uuid primary key references public.duuk_profiles on delete cascade,version text not null,seen_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['duuk_notification_preferences','duuk_notifications','duuk_push_subscriptions','duuk_releases','duuk_release_seen'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
grant select on public.duuk_notification_preferences,public.duuk_notifications,public.duuk_release_seen to authenticated;
grant insert(user_id,agenda,contracts,finance,commercial,system),update(agenda,contracts,finance,commercial,system) on public.duuk_notification_preferences to authenticated;
grant update(read_at) on public.duuk_notifications to authenticated;
grant insert(user_id,version,seen_at),update(version,seen_at) on public.duuk_release_seen to authenticated;
create policy preferences_own on public.duuk_notification_preferences for all to authenticated using(user_id=(select auth.uid()) and (select duuk_private.has_permission(null))) with check(user_id=(select auth.uid()) and (select duuk_private.has_permission(null)));
create policy notifications_own on public.duuk_notifications for all to authenticated using(user_id=(select auth.uid()) and duuk_private.has_permission(required_permission)) with check(user_id=(select auth.uid()) and duuk_private.has_permission(required_permission));
create policy release_seen_own on public.duuk_release_seen for all to authenticated using(user_id=(select auth.uid()) and (select duuk_private.has_permission(null))) with check(user_id=(select auth.uid()) and (select duuk_private.has_permission(null)));

create function duuk_private.notify_members(cat text,permission text,heading text,message text,destination text,dedupe text,recipient uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.duuk_notifications(user_id,category,required_permission,title,body,link,dedupe_key)
 select p.id,cat,permission,left(heading,180),left(message,500),destination,dedupe from public.duuk_profiles p left join public.duuk_notification_preferences pref on pref.user_id=p.id
 where p.active and (recipient is null or p.id=recipient) and duuk_private.member_permission(p.id,permission) and coalesce((to_jsonb(pref)->>cat)::boolean,true)
 on conflict(user_id,dedupe_key) do nothing;
$$;
create function duuk_private.signature_notification() returns trigger language plpgsql security definer set search_path='' as $$ declare c public.duuk_contracts; begin
 select * into c from public.duuk_contracts where id=new.contract_id;
 perform duuk_private.notify_members('contracts','contracts','Contrato assinado por '||new.signer_name,c.title,'/admin/contratos/'||c.id,'signature:'||new.id);
 return new;
end; $$;
create trigger contract_signed_notification after insert on public.duuk_contract_signatures for each row execute function duuk_private.signature_notification();
create function public.duuk_generate_notifications() returns void language plpgsql security invoker set search_path='' as $$ declare e public.duuk_events; f record; p record; n timestamp:=now() at time zone 'America/Sao_Paulo'; total bigint; begin
 for e in select * from public.duuk_events where status in ('planned','confirmed') and start_date between n::date and n::date+1 loop
  if e.start_date=n::date+1 and extract(hour from n)=9 then perform duuk_private.notify_members('agenda','agenda',e.title||' amanhã',case when e.all_day then 'Dia inteiro' else 'Às '||to_char(e.start_time,'HH24:MI') end,'/admin/agenda','agenda:tomorrow:'||e.id||':'||e.start_date);end if;
  if not e.all_day and (e.start_date+e.start_time) between n+interval '55 minutes' and n+interval '65 minutes' then perform duuk_private.notify_members('agenda','agenda','Compromisso em 1 hora',e.title||' · '||to_char(e.start_time,'HH24:MI'),'/admin/agenda','agenda:hour:'||e.id||':'||e.start_date||':'||e.start_time);end if;
 end loop;
 for f in select u.*,c.name from public.duuk_follow_ups u join public.duuk_clients c on c.id=u.client_id where u.completed_at is null and (u.due_at at time zone 'America/Sao_Paulo')::date=n::date loop perform duuk_private.notify_members('commercial','crm','Follow-up com '||f.name||' hoje',f.notes,'/admin/comercial/follow-ups','followup:'||f.id||':'||n::date,f.owner_id);end loop;
 if extract(hour from n)=9 then
  for p in select owner_id,count(*) as pending from public.duuk_follow_ups where completed_at is null and due_at<now() group by owner_id loop perform duuk_private.notify_members('commercial','crm',p.pending||' follow-ups pendentes','Organize os próximos contatos da equipe.','/admin/comercial/follow-ups','followup:pending:'||n::date,p.owner_id);end loop;
  if extract(day from n)=1 then select coalesce(sum(amount_cents),0) into total from public.duuk_expenses where due_date >= date_trunc('month',n)::date-interval '1 month' and due_date<date_trunc('month',n)::date;
   perform duuk_private.notify_members('finance','finance','Resumo financeiro disponível','O mês anterior terminou com R$ '||to_char(total::numeric/100,'FM999G999G999G990D00')||' em despesas.','/admin/financeiro','finance:month:'||date_trunc('month',n)::date);
  end if;
 end if;
 delete from public.duuk_notifications where created_at<now()-interval '180 days';
end; $$;

create function public.duuk_backend_secrets() returns jsonb language sql security definer set search_path='' as $$ select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in ('duuk.vapid.public','duuk.vapid.private','duuk.push.cron'); $$;
create function public.duuk_init_vapid(public_key text,private_key text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(hashtext('duuk-vapid-init'));
 if not exists(select 1 from vault.secrets where name='duuk.vapid.private') then
  perform vault.create_secret(public_key,'duuk.vapid.public');perform vault.create_secret(private_key,'duuk.vapid.private');
 end if;
end; $$;
do $$ begin if not exists(select 1 from vault.secrets where name='duuk.push.cron') then perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'duuk.push.cron');end if;end $$;
create function public.duuk_release_publish(release_version text) returns void language plpgsql security invoker set search_path='' as $$ begin
 if release_version !~ '^\d+\.\d+\.\d+$' then raise exception 'Versão inválida.' using errcode='PT400';end if;
 insert into public.duuk_releases(version) values(release_version) on conflict do nothing;
 if found then perform duuk_private.notify_members('system',null,'DUUK Admin '||release_version||' disponível','Confira as novidades e atualize quando estiver pronto.','/admin/configuracoes/sobre','release:'||release_version);end if;
end; $$;
-- Server-only wrappers, not callable by any authenticated browser.
revoke all on function public.duuk_backend_secrets(),public.duuk_init_vapid(text,text),public.duuk_generate_notifications(),public.duuk_release_publish(text),duuk_private.notify_members(text,text,text,text,text,text,uuid),duuk_private.signature_notification() from public,anon,authenticated;
grant execute on function public.duuk_backend_secrets(),public.duuk_init_vapid(text,text),public.duuk_generate_notifications(),public.duuk_release_publish(text),duuk_private.notify_members(text,text,text,text,text,text,uuid) to service_role;
create extension if not exists pg_net with schema extensions;
select cron.schedule('duuk-notifications-dispatch','*/5 * * * *',$cron$ select net.http_post(url:='https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-notifications',headers:=jsonb_build_object('Content-Type','application/json','x-duuk-cron',(select decrypted_secret from vault.decrypted_secrets where name='duuk.push.cron')),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=20000); $cron$);
create function public.duuk_claim_push() returns setof public.duuk_notifications language sql security invoker set search_path='' as $$ update public.duuk_notifications set next_attempt_at=now()+interval '2 minutes',push_attempts=push_attempts+1 where id in (select id from public.duuk_notifications where push_sent_at is null and push_attempts<4 and next_attempt_at<=now() order by created_at for update skip locked limit 25) returning *; $$;
revoke all on function public.duuk_claim_push() from public,anon,authenticated;
grant execute on function public.duuk_claim_push() to service_role;
