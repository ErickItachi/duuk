-- Server-only outbound Google Calendar integration. No personal event reader exists.
create table public.duuk_calendar_connections (
 user_id uuid primary key references public.duuk_profiles(id) on delete cascade,
 generation uuid not null default gen_random_uuid(),
 google_subject text not null, account_email text not null, calendar_id text not null,
 credential_id uuid, status text not null default 'connected' check(status in ('connected','error','disconnected')),
 last_synced_at timestamptz, last_error text, lease_id uuid, lease_until timestamptz,
 connected_at timestamptz not null default now()
);
create table public.duuk_calendar_sync (
 user_id uuid not null references public.duuk_calendar_connections on delete cascade,
 event_id uuid not null, -- deliberately no event FK: deletion must retain its Google tombstone job
 calendar_id text not null, google_event_id text not null default ('duuk'||replace(gen_random_uuid()::text,'-','')),
 revision bigint not null default 1, desired_action text not null check(desired_action in ('upsert','delete')),
 status text not null default 'pending' check(status in ('pending','synced','error')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 last_synced_at timestamptz, last_error text,
 primary key(user_id,event_id), unique(user_id,google_event_id)
);
create index duuk_calendar_sync_pending_idx on public.duuk_calendar_sync(next_attempt_at) where status<>'synced';
create table duuk_private.calendar_oauth_states (
 state_hash text primary key, user_id uuid not null references public.duuk_profiles on delete cascade,
 verifier text not null, consumed_at timestamptz, expires_at timestamptz not null default now()+interval '10 minutes'
);
create index calendar_oauth_user_idx on duuk_private.calendar_oauth_states(user_id);
do $$ declare t text; begin foreach t in array array['duuk_calendar_connections','duuk_calendar_sync'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
alter table duuk_private.calendar_oauth_states enable row level security;
revoke all on duuk_private.calendar_oauth_states from public,anon,authenticated;
grant all on duuk_private.calendar_oauth_states to service_role;

create function duuk_private.calendar_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid:=case when TG_OP='DELETE' then old.id else new.id end; begin
 insert into public.duuk_calendar_sync(user_id,event_id,calendar_id,desired_action)
 select c.user_id,eid,c.calendar_id,case when TG_OP='DELETE' then 'delete' else 'upsert' end
 -- Retain source changes during a permission block; worker authorization prevents export.
 from public.duuk_calendar_connections c where c.status<>'disconnected'
 on conflict(user_id,event_id) do update set desired_action=excluded.desired_action,revision=duuk_calendar_sync.revision+1,
 status='pending',attempts=0,next_attempt_at=now(),last_error=null;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
revoke all on function duuk_private.calendar_enqueue() from public,anon,authenticated;
create trigger calendar_event_queue after insert or update or delete on public.duuk_events for each row execute function duuk_private.calendar_enqueue();

-- Privileged RPC is callable only by the Edge Function service role. Browser receives no tokens.
create function duuk_private.calendar_backend(operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(payload->>'user_id')::uuid; c public.duuk_calendar_connections; s duuk_private.calendar_oauth_states;
 secret uuid; result jsonb; job public.duuk_calendar_sync; lease uuid; begin
 if operation='status' then
  select * into c from public.duuk_calendar_connections where user_id=actor;
  return jsonb_build_object('connection',case when c.user_id is null then null else
   jsonb_build_object('account_email',c.account_email,'status',c.status,'last_synced_at',c.last_synced_at,'last_error',coalesce((select last_error from public.duuk_calendar_sync where user_id=actor and status='error' order by next_attempt_at desc limit 1),c.last_error),
    'pending',(select count(*) from public.duuk_calendar_sync where user_id=actor and status<>'synced')) end);
 elsif operation='start' then
  if not duuk_private.member_permission(actor,'agenda') then raise exception 'Sem acesso à agenda.' using errcode='PT403'; end if;
  delete from duuk_private.calendar_oauth_states where user_id=actor or expires_at<now();
  insert into duuk_private.calendar_oauth_states(state_hash,user_id,verifier) values(payload->>'state_hash',actor,payload->>'verifier');
  return '{}'::jsonb;
 elsif operation='consume' then
  update duuk_private.calendar_oauth_states set consumed_at=now() where state_hash=payload->>'state_hash' and user_id=actor and expires_at>now() and consumed_at is null returning * into s;
  if s.user_id is null or not duuk_private.member_permission(s.user_id,'agenda') then raise exception 'Conexão expirada. Tente novamente no painel.' using errcode='PT400'; end if;
  select * into c from public.duuk_calendar_connections where user_id=s.user_id;
  return jsonb_build_object('user_id',s.user_id,'verifier',s.verifier,'google_subject',c.google_subject,'calendar_id',c.calendar_id);
 elsif operation='connect' then
  if not duuk_private.member_permission(actor,'agenda') then raise exception 'Sem acesso à agenda.' using errcode='PT403'; end if;
  perform pg_advisory_xact_lock(hashtext('duuk-calendar:'||actor));
  delete from duuk_private.calendar_oauth_states where user_id=actor and state_hash=payload->>'state_hash' and consumed_at is not null and expires_at>now() returning * into s;
  if s.user_id is null then raise exception 'A conexão mudou. Comece novamente no painel.' using errcode='PT409'; end if;
  select * into c from public.duuk_calendar_connections where user_id=actor for update;
  if c.credential_id is not null then delete from vault.secrets where id=c.credential_id; end if;
  secret:=vault.create_secret((payload->'tokens')::text);
  if c.calendar_id is distinct from payload->>'calendar_id' then delete from public.duuk_calendar_sync where user_id=actor; end if;
  insert into public.duuk_calendar_connections(user_id,google_subject,account_email,calendar_id,credential_id)
  values(actor,payload->>'google_subject',payload->>'account_email',payload->>'calendar_id',secret)
  on conflict(user_id) do update set generation=gen_random_uuid(),google_subject=excluded.google_subject,account_email=excluded.account_email,
   calendar_id=excluded.calendar_id,credential_id=secret,status='connected',last_error=null,lease_id=null,lease_until=null,connected_at=now();
  insert into public.duuk_calendar_sync(user_id,event_id,calendar_id,desired_action)
  select actor,e.id,payload->>'calendar_id','upsert' from public.duuk_events e where e.end_date >= (now() at time zone 'America/Sao_Paulo')::date
  on conflict(user_id,event_id) do update set revision=duuk_calendar_sync.revision+1,status='pending',attempts=0,next_attempt_at=now(),desired_action='upsert';
  -- Retain deletion jobs missed while disconnected; never import anything from Google.
  update public.duuk_calendar_sync set desired_action='delete',status='pending',revision=revision+1,attempts=0,next_attempt_at=now()
   where user_id=actor and not exists(select 1 from public.duuk_events e where e.id=event_id);
  return '{}'::jsonb;
 elsif operation='disconnect' then
  perform pg_advisory_xact_lock(hashtext('duuk-calendar:'||actor));
  select * into c from public.duuk_calendar_connections where user_id=actor for update;
  if c.credential_id is not null then select decrypted_secret::jsonb into result from vault.decrypted_secrets where id=c.credential_id;
   delete from vault.secrets where id=c.credential_id; end if;
  delete from duuk_private.calendar_oauth_states where user_id=actor;
  update public.duuk_calendar_connections set status='disconnected',credential_id=null,generation=gen_random_uuid(),lease_id=null,lease_until=null,last_error=null where user_id=actor;
  return coalesce(result,'{}');
 elsif operation='retry' then
  insert into public.duuk_calendar_sync(user_id,event_id,calendar_id,desired_action)
   select c.user_id,e.id,c.calendar_id,'upsert' from public.duuk_calendar_connections c cross join public.duuk_events e
   where c.user_id=actor and c.status<>'disconnected' and e.end_date >= (now() at time zone 'America/Sao_Paulo')::date
   on conflict(user_id,event_id) do update set desired_action='upsert',revision=duuk_calendar_sync.revision+1,status='pending',attempts=0,next_attempt_at=now(),last_error=null;
  update public.duuk_calendar_sync set attempts=0,next_attempt_at=now(),status='pending',last_error=null where user_id=actor and status<>'synced';
  update public.duuk_calendar_connections set status='connected',last_error=null where user_id=actor and credential_id is not null;
  return '{}'::jsonb;
 elsif operation='claim' then
  delete from duuk_private.calendar_oauth_states where expires_at<now();
  -- Backfill after access is restored; reconcile source deletions missed during a permission block.
  insert into public.duuk_calendar_sync(user_id,event_id,calendar_id,desired_action)
   select x.user_id,e.id,x.calendar_id,'upsert' from public.duuk_calendar_connections x cross join public.duuk_events e
   where x.status='connected' and (actor is null or x.user_id=actor) and duuk_private.member_permission(x.user_id,'agenda')
   and e.end_date >= (now() at time zone 'America/Sao_Paulo')::date on conflict(user_id,event_id) do nothing;
  update public.duuk_calendar_sync j set desired_action='delete',revision=j.revision+1,status='pending',attempts=0,next_attempt_at=now()
   where j.desired_action<>'delete' and (actor is null or j.user_id=actor) and exists(select 1 from public.duuk_calendar_connections x where x.user_id=j.user_id and x.status='connected' and duuk_private.member_permission(x.user_id,'agenda'))
   and not exists(select 1 from public.duuk_events e where e.id=j.event_id);
  -- Inactive/revoked members never receive further exports. Credentials remain private until disconnect.
  select x.* into c from public.duuk_calendar_connections x where x.status='connected' and x.credential_id is not null
   and (actor is null or x.user_id=actor)
   and duuk_private.member_permission(x.user_id,'agenda') and (x.lease_until is null or x.lease_until<now())
   and exists(select 1 from public.duuk_calendar_sync j where j.user_id=x.user_id and j.status<>'synced' and j.attempts<8 and j.next_attempt_at<=now())
   order by x.last_synced_at nulls first,x.user_id for update skip locked limit 1;
  if c.user_id is null then return null; end if;
  lease:=gen_random_uuid(); update public.duuk_calendar_connections set lease_id=lease,lease_until=now()+interval '90 seconds' where user_id=c.user_id;
  select decrypted_secret::jsonb into result from vault.decrypted_secrets where id=c.credential_id;
  return jsonb_build_object('user_id',c.user_id,'generation',c.generation,'calendar_id',c.calendar_id,'lease_id',lease,'tokens',result);
 elsif operation in ('jobs','tokens','finish','rotate','release','error') then
  select * into c from public.duuk_calendar_connections where user_id=actor and generation=(payload->>'generation')::uuid
   and lease_id=(payload->>'lease_id')::uuid and lease_until>now() and status='connected' and duuk_private.member_permission(actor,'agenda') for update;
  if c.user_id is null then raise exception 'A conexão mudou. Operação interrompida.' using errcode='PT409'; end if;
  if operation='jobs' then
   select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('event',(select to_jsonb(e) from public.duuk_events e where e.id=j.event_id))), '[]') into result
    from (select * from public.duuk_calendar_sync where user_id=actor and status<>'synced' and attempts<8 and next_attempt_at<=now() order by next_attempt_at,event_id limit 10) j;
   return result;
  elsif operation='tokens' then perform vault.update_secret(c.credential_id,(payload->'tokens')::text);
  elsif operation='rotate' then
   update public.duuk_calendar_sync set google_event_id='duuk'||replace(gen_random_uuid()::text,'-','')
    where user_id=actor and event_id=(payload->>'event_id')::uuid and revision=(payload->>'revision')::bigint returning * into job;
   return to_jsonb(job);
  elsif operation='finish' then
   update public.duuk_calendar_sync set status=case when payload->>'error' is null then 'synced' else 'error' end,
    attempts=case when payload->>'error' is null then 0 else attempts+1 end,
    next_attempt_at=now()+least(interval '6 hours',interval '1 minute'*power(2,attempts+1))+interval '1 second'*random()*30,last_error=payload->>'error',
    last_synced_at=case when payload->>'error' is null then now() else last_synced_at end
    where user_id=actor and event_id=(payload->>'event_id')::uuid and revision=(payload->>'revision')::bigint;
   update public.duuk_calendar_connections set last_synced_at=case when payload->>'error' is null then now() else last_synced_at end,last_error=payload->>'error' where user_id=actor;
   if payload->>'error' is not null then perform duuk_private.notify_members('system','agenda','Google Calendar precisa de atenção',payload->>'error','/admin/configuracoes/integracoes','calendar:error:'||actor||':'||current_date,actor); end if;
  elsif operation='error' then
   update public.duuk_calendar_connections set status='error',last_error=payload->>'error',lease_id=null,lease_until=null where user_id=actor;
   perform duuk_private.notify_members('system','agenda','Reconecte o Google Calendar',payload->>'error','/admin/configuracoes/integracoes','calendar:auth:'||actor||':'||current_date,actor);
  else update public.duuk_calendar_connections set lease_id=null,lease_until=null where user_id=actor;
  end if;
  return '{}'::jsonb;
 else raise exception 'Operação inválida.' using errcode='PT400'; end if;
end $$;
create function public.duuk_calendar_backend(operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select duuk_private.calendar_backend(operation,payload); $$;
revoke all on function duuk_private.calendar_backend(text,jsonb),public.duuk_calendar_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.calendar_backend(text,jsonb),public.duuk_calendar_backend(text,jsonb) to service_role;
select cron.schedule('duuk-calendar-sync','* * * * *',$cron$ select net.http_post(url:='https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-calendar',headers:=jsonb_build_object('Content-Type','application/json','x-duuk-cron',(select decrypted_secret from vault.decrypted_secrets where name='duuk.push.cron')),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=55000); $cron$);
