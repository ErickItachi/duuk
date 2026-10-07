-- DUUK Admin: role based access, profiles, CRM and immutable audit history.
create table public.duuk_roles (id uuid primary key default gen_random_uuid(), name text unique not null check(char_length(trim(name)) between 1 and 60), description text not null default '' check(char_length(description)<=300), created_at timestamptz not null default now());
create table public.duuk_permission_keys (key text primary key, label text not null);
insert into public.duuk_permission_keys values ('crm','Comercial'),('mail','E-mails'),('contracts','Contratos'),('agenda','Agenda'),('finance','Financeiro'),('insights','Insights'),('site','Conteúdo do site'),('team','Usuários'),('permissions','Grupos e permissões'),('audit','Histórico de alterações');
create table public.duuk_role_permissions (role_id uuid references public.duuk_roles on delete cascade, permission text references public.duuk_permission_keys, allowed boolean not null default true, primary key(role_id,permission));
create table public.duuk_profiles (id uuid primary key references auth.users on delete cascade, name text not null check(char_length(trim(name)) between 1 and 120), email text not null check(char_length(email)<=254), phone text not null default '' check(char_length(phone)<=40), job_title text not null default '' check(char_length(job_title)<=100), avatar_path text, role_id uuid not null references public.duuk_roles on delete restrict, active boolean not null default true, is_super_admin boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index duuk_profiles_role_idx on public.duuk_profiles(role_id);
create table public.duuk_user_permissions (user_id uuid references public.duuk_profiles on delete cascade, permission text references public.duuk_permission_keys, allowed boolean not null, primary key(user_id,permission));
insert into public.duuk_roles(name,description) values ('Administrador','Gestão dos módulos da DUUK'),('Comercial','Prospecção, clientes e e-mails'),('Financeiro','Controle financeiro'),('Contador','Despesas e exportações'),('Filmmaker','Agenda de produção'),('Editor','Agenda e conteúdo'),('Gestor','Gestão operacional');
insert into public.duuk_role_permissions select r.id,p.key,true from public.duuk_roles r cross join public.duuk_permission_keys p where r.name='Administrador' or (r.name='Comercial' and p.key in ('crm','mail')) or (r.name in ('Financeiro','Contador') and p.key='finance') or (r.name='Filmmaker' and p.key='agenda') or (r.name='Editor' and p.key in ('agenda','site')) or (r.name='Gestor' and p.key in ('crm','contracts','agenda','finance','insights'));
insert into public.duuk_profiles(id,name,email,role_id,is_super_admin) select u.id,coalesce(nullif(u.raw_user_meta_data->>'name',''),'Equipe DUUK'),u.email,r.id,true from auth.users u join public.duuk_admins a on a.user_id=u.id cross join public.duuk_roles r where r.name='Administrador';

create function duuk_private.member_permission(actor uuid, requested text) returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select p.active and (requested is null or p.is_super_admin or coalesce((select x.allowed from public.duuk_user_permissions x where x.user_id=p.id and x.permission=requested),(select x.allowed from public.duuk_role_permissions x where x.role_id=p.role_id and x.permission=requested),false)) from public.duuk_profiles p where p.id=actor),false); $$;
create function duuk_private.has_permission(requested text) returns boolean language sql stable security definer set search_path='' as $$ select duuk_private.member_permission(auth.uid(),requested); $$;
create or replace function duuk_private.is_admin() returns boolean language sql stable security invoker set search_path='' as $$ select duuk_private.has_permission('site'); $$;
create function public.duuk_check_permission(actor uuid, requested text) returns boolean language sql security invoker set search_path='' as $$ select duuk_private.member_permission(actor,requested); $$;
revoke all on function duuk_private.member_permission(uuid,text),public.duuk_check_permission(uuid,text) from public,anon,authenticated;
grant execute on function duuk_private.member_permission(uuid,text),public.duuk_check_permission(uuid,text) to service_role;
revoke all on function duuk_private.has_permission(text) from public,anon;
grant execute on function duuk_private.has_permission(text) to authenticated,service_role;
-- Anonymous published content policies still call is_admin(). It must safely return false.
grant execute on function duuk_private.has_permission(text) to anon;

create function duuk_private.protect_last_super() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(hashtext('duuk-last-super'));
 if old.active and old.is_super_admin and (TG_OP='DELETE' or not new.active or not new.is_super_admin) and not exists(select 1 from public.duuk_profiles where id<>old.id and active and is_super_admin) then raise exception 'Mantenha pelo menos um super administrador ativo.' using errcode='PT409'; end if;
 if TG_OP='DELETE' then return old; end if;
 new.updated_at=now(); return new;
end; $$;
create trigger protect_last_super before update or delete on public.duuk_profiles for each row execute function duuk_private.protect_last_super();

create table public.duuk_audit (id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users on delete set null, actor_name text not null default '', action text not null, entity text not null, entity_id text not null, summary text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index duuk_audit_time_idx on public.duuk_audit(created_at desc);
create index duuk_audit_actor_idx on public.duuk_audit(actor_id);
create function duuk_private.audit_changes() returns trigger language plpgsql security definer set search_path='' as $$ declare old_data jsonb; new_data jsonb; actor uuid:=auth.uid(); target text; begin
 if TG_OP<>'INSERT' then old_data=to_jsonb(old); end if; if TG_OP<>'DELETE' then new_data=to_jsonb(new); end if;
 target=coalesce(new_data->>'id',old_data->>'id',new_data->>'user_id',old_data->>'user_id',new_data->>'role_id',old_data->>'role_id',new_data->>'key',old_data->>'key','');
 -- Never store document bytes, signatures, credentials, tokens or private message bodies.
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details) values(actor,coalesce((select name from public.duuk_profiles where id=actor),'Sistema / link de assinatura'),lower(TG_OP),TG_TABLE_NAME,target,case TG_OP when 'INSERT' then 'Registro criado' when 'DELETE' then 'Registro excluído' else 'Registro atualizado' end,jsonb_strip_nulls(jsonb_build_object('title',coalesce(new_data->>'title',old_data->>'title'),'name',coalesce(new_data->>'name',old_data->>'name'),'previous_stage',old_data->>'stage','stage',new_data->>'stage','previous_status',old_data->>'status','status',new_data->>'status')));
 if TG_OP='DELETE' then return old; else return new; end if;
end; $$;

create table public.duuk_clients (id uuid primary key default gen_random_uuid(), name text not null check(char_length(trim(name)) between 1 and 160), company text not null default '' check(char_length(company)<=160), phone text not null default '' check(char_length(phone)<=40), whatsapp text not null default '' check(char_length(whatsapp)<=40), email text not null default '' check(char_length(email)<=254), instagram text not null default '' check(char_length(instagram)<=160), website text not null default '' check(char_length(website)<=500), city text not null default '' check(char_length(city)<=120), segment text not null default '' check(char_length(segment)<=120), source text not null default '' check(char_length(source)<=120), owner_id uuid references public.duuk_profiles on delete set null, stage text not null default 'new' check(stage in ('new','contacted','waiting','followup','meeting','proposal','negotiation','won','lost')), notes text not null default '' check(char_length(notes)<=5000), first_contact date, last_contact timestamptz, next_follow_up timestamptz, estimated_cents bigint not null default 0 check(estimated_cents between 0 and 999999999999), tags text[] not null default '{}' check(cardinality(tags)<=20), created_by uuid not null default auth.uid() references auth.users, version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index duuk_clients_stage_idx on public.duuk_clients(stage);
create index duuk_clients_owner_idx on public.duuk_clients(owner_id);
create index duuk_clients_created_by_idx on public.duuk_clients(created_by);
create table public.duuk_activities (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.duuk_clients on delete cascade, user_id uuid not null default auth.uid() references public.duuk_profiles, occurred_at timestamptz not null default now(), channel text not null check(channel in ('call','whatsapp','email','instagram','meeting','other')), notes text not null check(char_length(notes) between 1 and 3000), result text not null default '' check(char_length(result)<=500), next_step text not null default '' check(char_length(next_step)<=500), created_at timestamptz not null default now());
create index duuk_activities_client_idx on public.duuk_activities(client_id,occurred_at desc);
create index duuk_activities_user_idx on public.duuk_activities(user_id,occurred_at desc);
create table public.duuk_follow_ups (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.duuk_clients on delete cascade, owner_id uuid not null default auth.uid() references public.duuk_profiles, due_at timestamptz not null, notes text not null default '' check(char_length(notes)<=2000), completed_at timestamptz, result text not null default '' check(char_length(result)<=1000), version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index duuk_followups_client_idx on public.duuk_follow_ups(client_id);
create index duuk_followups_owner_idx on public.duuk_follow_ups(owner_id,due_at) where completed_at is null;
create table public.duuk_client_history (id uuid primary key default gen_random_uuid(), client_id uuid not null references public.duuk_clients on delete cascade, actor_id uuid references auth.users on delete set null, actor_name text not null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index duuk_client_history_client_idx on public.duuk_client_history(client_id,created_at desc);
create index duuk_client_history_actor_idx on public.duuk_client_history(actor_id);
create function duuk_private.crm_history() returns trigger language plpgsql security definer set search_path='' as $$ declare cid uuid; a uuid:=auth.uid(); begin
 if TG_TABLE_NAME='duuk_clients' then cid=new.id; else cid=new.client_id; end if;
 insert into public.duuk_client_history(client_id,actor_id,actor_name,action,details) values(cid,a,coalesce((select name from public.duuk_profiles where id=a),'Equipe DUUK'),case when TG_TABLE_NAME='duuk_clients' then case when TG_OP='INSERT' then 'Cliente criado' when old.stage is distinct from new.stage then 'Etapa alterada' else 'Cadastro atualizado' end when TG_TABLE_NAME='duuk_activities' then 'Contato registrado' else case when new.completed_at is not null then 'Follow-up concluído' else 'Follow-up agendado' end end,case when TG_TABLE_NAME='duuk_clients' then jsonb_build_object('stage',to_jsonb(new)->>'stage','previous_stage',case when TG_OP='UPDATE' then to_jsonb(old)->>'stage' end) else jsonb_strip_nulls(jsonb_build_object('notes',to_jsonb(new)->>'notes','result',to_jsonb(new)->>'result','channel',to_jsonb(new)->>'channel')) end);
 if TG_TABLE_NAME='duuk_activities' then update public.duuk_clients set last_contact=greatest(coalesce(last_contact,new.occurred_at),new.occurred_at), first_contact=coalesce(first_contact,(new.occurred_at at time zone 'America/Sao_Paulo')::date) where id=cid; end if;
 return new;
end; $$;
create trigger client_revision before update on public.duuk_clients for each row execute function duuk_private.expense_revision();
create trigger followup_revision before update on public.duuk_follow_ups for each row execute function duuk_private.expense_revision();
create trigger client_history after insert or update on public.duuk_clients for each row execute function duuk_private.crm_history();
create trigger activity_history after insert on public.duuk_activities for each row execute function duuk_private.crm_history();
create trigger followup_history after insert or update on public.duuk_follow_ups for each row execute function duuk_private.crm_history();

-- Every new table is private by default; service operations validate the caller in Edge Functions.
do $$ declare t text; begin foreach t in array array['duuk_roles','duuk_permission_keys','duuk_role_permissions','duuk_profiles','duuk_user_permissions','duuk_audit','duuk_clients','duuk_activities','duuk_follow_ups','duuk_client_history'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant all on public.%I to service_role',t);
 end loop; end $$;
grant select on public.duuk_clients,public.duuk_activities,public.duuk_follow_ups,public.duuk_client_history,public.duuk_audit to authenticated;
grant delete on public.duuk_clients,public.duuk_follow_ups to authenticated;
grant insert(name,company,phone,whatsapp,email,instagram,website,city,segment,source,owner_id,stage,notes,first_contact,next_follow_up,estimated_cents,tags),update(name,company,phone,whatsapp,email,instagram,website,city,segment,source,owner_id,stage,notes,first_contact,next_follow_up,estimated_cents,tags) on public.duuk_clients to authenticated;
grant insert(client_id,occurred_at,channel,notes,result,next_step) on public.duuk_activities to authenticated;
grant insert(client_id,owner_id,due_at,notes),update(owner_id,due_at,notes) on public.duuk_follow_ups to authenticated;
create policy crm_clients on public.duuk_clients for all to authenticated using((select duuk_private.has_permission('crm'))) with check((select duuk_private.has_permission('crm')));
create policy crm_activities on public.duuk_activities for all to authenticated using((select duuk_private.has_permission('crm'))) with check((select duuk_private.has_permission('crm')));
create policy crm_followups on public.duuk_follow_ups for all to authenticated using((select duuk_private.has_permission('crm'))) with check((select duuk_private.has_permission('crm')));
create policy crm_history on public.duuk_client_history for select to authenticated using((select duuk_private.has_permission('crm')));
create policy audit_read on public.duuk_audit for select to authenticated using((select duuk_private.has_permission('audit')));

create function public.duuk_directory() returns table(id uuid,name text,job_title text) language sql stable security definer set search_path='' as $$ select p.id,p.name,p.job_title from public.duuk_profiles p where p.active and duuk_private.has_permission(null) order by p.name; $$;
revoke all on function public.duuk_directory() from public,anon;
grant execute on function public.duuk_directory() to authenticated,service_role;
create function public.duuk_complete_followup(target uuid,revision bigint,outcome text,next_due timestamptz default null,new_stage text default null) returns jsonb language plpgsql security definer set search_path='' as $$ declare f public.duuk_follow_ups; begin
 if not duuk_private.has_permission('crm') then raise exception 'Sem acesso ao Comercial.' using errcode='PT403'; end if;
 if char_length(trim(outcome)) not between 1 and 1000 then raise exception 'Informe o resultado do contato.' using errcode='PT400'; end if;
 select * into f from public.duuk_follow_ups where id=target for update;
 if not found then raise exception 'Follow-up não encontrado.' using errcode='PT404'; end if;
 if f.version<>revision or f.completed_at is not null then raise exception 'O follow-up mudou. Atualize os dados.' using errcode='PT409'; end if;
 update public.duuk_follow_ups set completed_at=now(),result=trim(outcome) where id=target returning * into f;
 if next_due is not null then insert into public.duuk_follow_ups(client_id,owner_id,due_at,notes) values(f.client_id,f.owner_id,next_due,'Continuação: '||left(outcome,500)); end if;
 if new_stage is not null then update public.duuk_clients set stage=new_stage where id=f.client_id; end if;
 return to_jsonb(f);
end; $$;
revoke all on function public.duuk_complete_followup(uuid,bigint,text,timestamptz,text) from public,anon;
grant execute on function public.duuk_complete_followup(uuid,bigint,text,timestamptz,text) to authenticated;

drop policy expenses_admin on public.duuk_expenses;
create policy expenses_access on public.duuk_expenses for all to authenticated using((select duuk_private.has_permission('finance'))) with check((select duuk_private.has_permission('finance')));
drop policy events_admin on public.duuk_events;
create policy events_access on public.duuk_events for all to authenticated using((select duuk_private.has_permission('agenda'))) with check((select duuk_private.has_permission('agenda')));
drop policy contracts_admin on public.duuk_contracts;
create policy contracts_access on public.duuk_contracts for select to authenticated using((select duuk_private.has_permission('contracts')));
drop policy metrics_admin on public.duuk_daily_metrics;
create policy metrics_access on public.duuk_daily_metrics for select to authenticated using((select duuk_private.has_permission('insights')));
drop policy office_document_read on storage.objects;
create policy office_document_read on storage.objects for select to authenticated using(bucket_id='duuk-documents' and (select duuk_private.has_permission('contracts')));
drop policy office_orphan_delete on storage.objects;
create policy office_orphan_delete on storage.objects for delete to authenticated using(bucket_id='duuk-documents' and (select duuk_private.has_permission('contracts')) and name ~ '^(original|signed)/[a-f0-9-]{36}/[a-f0-9-]{36}\.pdf$' and not exists(select 1 from public.duuk_contracts c where c.id::text=(storage.foldername(objects.name))[2]));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('duuk-avatars','duuk-avatars',false,2097152,array['image/jpeg','image/png','image/webp']);
-- Avatars are uploaded and signed on the server; no browser bucket access.

do $$ declare t text; begin foreach t in array array['duuk_profiles','duuk_roles','duuk_role_permissions','duuk_user_permissions','duuk_clients','duuk_activities','duuk_follow_ups','duuk_contracts','duuk_contract_signatures','duuk_expenses','duuk_events','duuk_content'] loop execute format('create trigger duuk_audit_changes after insert or update or delete on public.%I for each row execute function duuk_private.audit_changes()',t); end loop; end $$;
revoke all on function duuk_private.protect_last_super(),duuk_private.audit_changes(),duuk_private.crm_history() from public,anon,authenticated;
