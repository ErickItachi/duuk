-- Private business records. Public visitors have no table access.
create table public.duuk_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  category text not null check (category in ('production','equipment','suppliers','travel','marketing','taxes','other')),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid' and paid_date is not null) or (status = 'pending' and paid_date is null))
);
create index duuk_expenses_due_date_idx on public.duuk_expenses(due_date);
create index duuk_expenses_created_by_idx on public.duuk_expenses(created_by);
alter table public.duuk_expenses enable row level security;
revoke all on public.duuk_expenses from anon, authenticated;
grant select, delete on public.duuk_expenses to authenticated;
grant insert(title,description,amount_cents,category,due_date,status,paid_date), update(title,description,amount_cents,category,due_date,status,paid_date) on public.duuk_expenses to authenticated;
grant all on public.duuk_expenses to service_role;
create policy expenses_admin on public.duuk_expenses for all to authenticated
  using ((select duuk_private.is_admin())) with check ((select duuk_private.is_admin()));
create function duuk_private.expense_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end;
$$;
revoke all on function duuk_private.expense_revision() from public, anon, authenticated;
create trigger expense_revision before update on public.duuk_expenses for each row execute function duuk_private.expense_revision();

create table public.duuk_contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  client_name text not null check (char_length(trim(client_name)) between 1 and 160),
  client_email text not null default '' check (char_length(client_email) <= 254),
  duuk_name text not null check (char_length(trim(duuk_name)) between 1 and 160),
  original_path text not null unique,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  pages jsonb not null check (jsonb_typeof(pages) = 'array' and jsonb_array_length(pages) between 1 and 30),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 30),
  status text not null default 'draft' check (status in ('draft','pending','partial','signed','cancelled')),
  signed_path text,
  signed_sha256 text check (signed_sha256 ~ '^[a-f0-9]{64}$'),
  rendered_version bigint,
  created_by uuid not null references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index duuk_contracts_created_at_idx on public.duuk_contracts(created_at desc);
create index duuk_contracts_created_by_idx on public.duuk_contracts(created_by);
alter table public.duuk_contracts enable row level security;
revoke all on public.duuk_contracts from anon, authenticated;
grant select on public.duuk_contracts to authenticated;
grant all on public.duuk_contracts to service_role;
create policy contracts_admin on public.duuk_contracts for select to authenticated using ((select duuk_private.is_admin()));

create table public.duuk_contract_invites (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.duuk_contracts(id) on delete cascade,
  party text not null check (party in ('client','duuk')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index duuk_contract_invites_contract_idx on public.duuk_contract_invites(contract_id);
alter table public.duuk_contract_invites enable row level security;
revoke all on public.duuk_contract_invites from anon, authenticated;
grant all on public.duuk_contract_invites to service_role;
create policy invites_service on public.duuk_contract_invites for all to service_role using (true) with check (true);

create table public.duuk_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.duuk_contracts(id) on delete cascade,
  invite_id uuid not null references public.duuk_contract_invites(id),
  party text not null check (party in ('client','duuk')),
  signer_name text not null check (char_length(trim(signer_name)) between 2 and 160),
  png text not null check (char_length(png) between 100 and 200000),
  field_values jsonb not null default '{}' check (jsonb_typeof(field_values) = 'object' and octet_length(field_values::text) <= 10000),
  consent text not null,
  ip_address text,
  user_agent text not null default '',
  signed_at timestamptz not null default now(),
  unique(contract_id,party)
);
create index duuk_contract_signatures_invite_idx on public.duuk_contract_signatures(invite_id);
alter table public.duuk_contract_signatures enable row level security;
revoke all on public.duuk_contract_signatures from anon, authenticated;
grant all on public.duuk_contract_signatures to service_role;
create policy signatures_service on public.duuk_contract_signatures for all to service_role using (true) with check (true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('duuk-documents','duuk-documents',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
create policy office_document_read on storage.objects for select to authenticated
  using (bucket_id = 'duuk-documents' and (select duuk_private.is_admin()));
create policy office_orphan_delete on storage.objects for delete to authenticated
  using (bucket_id='duuk-documents' and (select duuk_private.is_admin())
    and name ~ '^(original|signed)/[a-f0-9-]{36}/[a-f0-9-]{36}\.pdf$'
    and not exists(select 1 from public.duuk_contracts c where c.id::text=(storage.foldername(name))[2]));

grant usage on schema duuk_private to service_role;
create function duuk_private.office_fields(target uuid, document jsonb, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de salvar.' using errcode='PT409'; end if;
 if item.status <> 'draft' then raise exception 'Os campos ficam bloqueados depois de gerar links de assinatura.' using errcode='PT409'; end if;
 update public.duuk_contracts set fields=document,version=version+1,updated_at=now() where id=target returning * into item;
 return to_jsonb(item);
end; $$;

create function duuk_private.office_invite(target uuid, side text, digest text, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts; invite public.duuk_contract_invites;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de gerar o link.' using errcode='PT409'; end if;
 if item.status not in ('draft','pending','partial') then raise exception 'Este contrato não aceita novas assinaturas.' using errcode='PT409'; end if;
 if side not in ('client','duuk') then raise exception 'Participante inválido.' using errcode='PT400'; end if;
 if not exists(select 1 from jsonb_array_elements(item.fields) f where f->>'party'='client' and f->>'type'='signature') or
    not exists(select 1 from jsonb_array_elements(item.fields) f where f->>'party'='duuk' and f->>'type'='signature') then
   raise exception 'Adicione um campo de assinatura para o cliente e outro para a DUUK.' using errcode='PT400';
 end if;
 if exists(select 1 from public.duuk_contract_signatures where contract_id=target and party=side) then
   raise exception 'Este participante já assinou.' using errcode='PT409';
 end if;
 update public.duuk_contract_invites set revoked_at=now() where contract_id=target and party=side and signed_at is null and revoked_at is null;
 insert into public.duuk_contract_invites(contract_id,party,token_hash) values(target,side,digest) returning * into invite;
 update public.duuk_contracts set status=case when status='draft' then 'pending' else status end,version=version+1,updated_at=now() where id=target returning * into item;
 return jsonb_build_object('contract',to_jsonb(item),'expires_at',invite.expires_at);
end; $$;

create function duuk_private.office_sign(digest text, payload jsonb) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts; invitation public.duuk_contract_invites; target uuid;
begin
 select contract_id into target from public.duuk_contract_invites where token_hash=digest;
 if not found then raise exception 'Link inválido.' using errcode='PT404'; end if;
 select * into item from public.duuk_contracts where id=target for update;
 select * into invitation from public.duuk_contract_invites where token_hash=digest for update;
 if invitation.revoked_at is not null or invitation.expires_at < now() or item.status='cancelled' then
   raise exception 'Este link expirou ou foi cancelado.' using errcode='PT410';
 end if;
 if invitation.signed_at is null then
   insert into public.duuk_contract_signatures(contract_id,invite_id,party,signer_name,png,field_values,consent,ip_address,user_agent)
    values(target,invitation.id,invitation.party,payload->>'name',payload->>'png',payload->'values',payload->>'consent',payload->>'ip',left(payload->>'user_agent',300));
   update public.duuk_contract_invites set signed_at=now() where id=invitation.id;
   update public.duuk_contracts set status=case when (select count(*) from public.duuk_contract_signatures where contract_id=target)=2 then 'signed' else 'partial' end,
    version=version+1,updated_at=now() where id=target returning * into item;
 end if;
 return jsonb_build_object('contract',to_jsonb(item),'signatures',coalesce((select jsonb_agg(to_jsonb(s) order by signed_at) from public.duuk_contract_signatures s where contract_id=target),'[]'::jsonb));
end; $$;

create function duuk_private.office_render(target uuid, revision bigint, object_path text, digest text) returns boolean
 language plpgsql security invoker set search_path = '' as $$
begin
 update public.duuk_contracts set signed_path=object_path,signed_sha256=digest,rendered_version=revision
  where id=target and version=revision and status in ('partial','signed','cancelled')
    and exists(select 1 from public.duuk_contract_signatures where contract_id=target);
 return found;
end; $$;

create function duuk_private.office_cancel(target uuid, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de cancelar.' using errcode='PT409'; end if;
 if item.status='signed' then raise exception 'Contratos concluídos são preservados.' using errcode='PT409'; end if;
 update public.duuk_contract_invites set revoked_at=now() where contract_id=target and revoked_at is null;
 update public.duuk_contracts set status='cancelled',version=version+1,updated_at=now() where id=target returning * into item;
 return to_jsonb(item);
end; $$;

create function duuk_private.office_delete(target uuid, revision bigint) returns text
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision or item.status not in ('draft','cancelled') or exists(select 1 from public.duuk_contract_signatures where contract_id=target) then
  raise exception 'Só é possível excluir contratos sem assinaturas, em rascunho ou cancelados.' using errcode='PT409'; end if;
 delete from public.duuk_contracts where id=target;
 return item.original_path;
end; $$;

create function public.duuk_office_fields(target uuid, document jsonb, revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select duuk_private.office_fields(target,document,revision); $$;
create function public.duuk_office_invite(target uuid, side text, digest text, revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select duuk_private.office_invite(target,side,digest,revision); $$;
create function public.duuk_office_sign(digest text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select duuk_private.office_sign(digest,payload); $$;
create function public.duuk_office_render(target uuid,revision bigint,object_path text,digest text) returns boolean language sql security invoker set search_path='' as $$ select duuk_private.office_render(target,revision,object_path,digest); $$;
create function public.duuk_office_cancel(target uuid,revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select duuk_private.office_cancel(target,revision); $$;
create function public.duuk_office_delete(target uuid,revision bigint) returns text language sql security invoker set search_path='' as $$ select duuk_private.office_delete(target,revision); $$;
revoke all on function duuk_private.office_fields(uuid,jsonb,bigint),duuk_private.office_invite(uuid,text,text,bigint),duuk_private.office_sign(text,jsonb),duuk_private.office_render(uuid,bigint,text,text),duuk_private.office_cancel(uuid,bigint),duuk_private.office_delete(uuid,bigint),public.duuk_office_fields(uuid,jsonb,bigint),public.duuk_office_invite(uuid,text,text,bigint),public.duuk_office_sign(text,jsonb),public.duuk_office_render(uuid,bigint,text,text),public.duuk_office_cancel(uuid,bigint),public.duuk_office_delete(uuid,bigint) from public,anon,authenticated;
grant execute on function duuk_private.office_fields(uuid,jsonb,bigint),duuk_private.office_invite(uuid,text,text,bigint),duuk_private.office_sign(text,jsonb),duuk_private.office_render(uuid,bigint,text,text),duuk_private.office_cancel(uuid,bigint),duuk_private.office_delete(uuid,bigint),public.duuk_office_fields(uuid,jsonb,bigint),public.duuk_office_invite(uuid,text,text,bigint),public.duuk_office_sign(text,jsonb),public.duuk_office_render(uuid,bigint,text,text),public.duuk_office_cancel(uuid,bigint),public.duuk_office_delete(uuid,bigint) to service_role;

create table public.duuk_daily_metrics (
 day date not null, page text not null, event text not null check(event in ('view','play','contact')),
 device text not null check(device in ('mobile','desktop')), source text not null,
 count bigint not null default 1, primary key(day,page,event,device,source)
);
alter table public.duuk_daily_metrics enable row level security;
revoke all on public.duuk_daily_metrics from anon,authenticated;
grant select on public.duuk_daily_metrics to authenticated;
grant all on public.duuk_daily_metrics to service_role;
create policy metrics_admin on public.duuk_daily_metrics for select to authenticated using ((select duuk_private.is_admin()));
create table duuk_private.metric_limits (
 day date not null, digest text not null, minute bigint not null, count integer not null, primary key(day,digest)
);
alter table duuk_private.metric_limits enable row level security;
revoke all on duuk_private.metric_limits from public,anon,authenticated;
grant all on duuk_private.metric_limits to service_role;
create policy metric_limits_service on duuk_private.metric_limits for all to service_role using(true) with check(true);
create function duuk_private.office_metric(route text,kind text,device_kind text,source_kind text,request_digest text) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare today date := timezone('America/Sao_Paulo',now())::date; tick bigint := floor(extract(epoch from now())/60); hits integer;
begin
 if kind not in ('view','play','contact') or device_kind not in ('mobile','desktop') or source_kind not in ('Direto','Google','Instagram','YouTube','Bing','LinkedIn','Outros') then return false; end if;
 if route not in ('/','/portfolio','/sobre','/contato','/politica-de-privacidade','/sobre/douglas-felix') and not exists(select 1 from public.duuk_content c,jsonb_array_elements(c.content->'projects') p where c.key='published' and '/projeto/'||(p->>'slug')=route) then return false; end if;
 insert into duuk_private.metric_limits(day,digest,minute,count) values(today,request_digest,tick,1)
 on conflict(day,digest) do update set minute=excluded.minute,count=case when duuk_private.metric_limits.minute=excluded.minute then duuk_private.metric_limits.count+1 else 1 end returning count into hits;
 if hits>40 then return false; end if;
 insert into public.duuk_daily_metrics(day,page,event,device,source) values(today,route,kind,device_kind,source_kind)
 on conflict(day,page,event,device,source) do update set count=public.duuk_daily_metrics.count+1;
 delete from duuk_private.metric_limits where day<today-1;
 delete from public.duuk_daily_metrics where day<today-90;
 return true;
end; $$;
create function public.duuk_office_metric(route text,kind text,device_kind text,source_kind text,request_digest text) returns boolean language sql security invoker set search_path='' as $$ select duuk_private.office_metric(route,kind,device_kind,source_kind,request_digest); $$;
revoke all on function duuk_private.office_metric(text,text,text,text,text),public.duuk_office_metric(text,text,text,text,text) from public,anon,authenticated;
grant execute on function duuk_private.office_metric(text,text,text,text,text),public.duuk_office_metric(text,text,text,text,text) to service_role;
