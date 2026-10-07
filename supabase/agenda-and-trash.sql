-- Agenda privada, com datas e horários locais de Brasília.
create table public.duuk_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 1 and 160),
 description text not null default '' check (char_length(description) <= 2000),
 location text not null default '' check (char_length(location) <= 200),
 client_name text not null default '' check (char_length(client_name) <= 160),
 start_date date not null check (start_date between date '1900-01-01' and date '2100-12-31'),
 end_date date not null check (end_date between start_date and start_date + 366),
 all_day boolean not null default true,
 start_time time,
 end_time time,
 category text not null default 'filming' check (category in ('filming','editing','meeting','delivery','other')),
 status text not null default 'planned' check (status in ('planned','confirmed','done','cancelled')),
 created_by uuid not null default auth.uid() references auth.users(id),
 responsible_id uuid not null default auth.uid() references public.duuk_profiles(id) on delete restrict,
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((all_day and start_time is null and end_time is null) or (not all_day and start_time is not null)),
 check (end_time is null or end_date > start_date or end_time > start_time)
);
create index duuk_events_dates_idx on public.duuk_events(start_date, end_date);
create index duuk_events_created_by_idx on public.duuk_events(created_by);
create index duuk_events_responsible_idx on public.duuk_events(responsible_id);
alter table public.duuk_events enable row level security;
revoke all on public.duuk_events from public, anon, authenticated;
grant select, delete on public.duuk_events to authenticated;
grant insert(title,description,location,client_name,start_date,end_date,all_day,start_time,end_time,category,status,responsible_id),
 update(title,description,location,client_name,start_date,end_date,all_day,start_time,end_time,category,status,responsible_id) on public.duuk_events to authenticated;
grant all on public.duuk_events to service_role;
create policy events_admin on public.duuk_events for all to authenticated
 using ((select duuk_private.is_admin())) with check ((select duuk_private.is_admin()));
create trigger event_revision before update on public.duuk_events for each row execute function duuk_private.expense_revision();

-- A lixeira revoga os links, preservando documentos e evidências de assinatura.
alter table public.duuk_contracts add column deleted_at timestamptz;
create index duuk_contracts_active_idx on public.duuk_contracts(created_at desc) where deleted_at is null;

create function duuk_private.office_trash(target uuid, revision bigint, restore boolean) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de continuar.' using errcode='PT409'; end if;
 if restore and item.deleted_at is null then raise exception 'Este contrato já está na lista ativa.' using errcode='PT409'; end if;
 if not restore and item.deleted_at is not null then raise exception 'Este contrato já está na lixeira.' using errcode='PT409'; end if;
 if not restore then
  update public.duuk_contract_invites set revoked_at=now() where contract_id=target and revoked_at is null;
 end if;
 update public.duuk_contracts set deleted_at=case when restore then null else now() end,
  version=version+1,updated_at=now() where id=target returning * into item;
 return to_jsonb(item);
end; $$;
create function public.duuk_office_trash(target uuid, revision bigint, restore boolean) returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.office_trash(target,revision,restore); $$;
revoke all on function duuk_private.office_trash(uuid,bigint,boolean),public.duuk_office_trash(uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function duuk_private.office_trash(uuid,bigint,boolean),public.duuk_office_trash(uuid,bigint,boolean) to service_role;


create or replace function duuk_private.office_fields(target uuid, document jsonb, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.deleted_at is not null then raise exception 'Restaure o contrato antes de continuar.' using errcode='PT409'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de salvar.' using errcode='PT409'; end if;
 if item.status <> 'draft' then raise exception 'Os campos ficam bloqueados depois de gerar links de assinatura.' using errcode='PT409'; end if;
 update public.duuk_contracts set fields=document,version=version+1,updated_at=now() where id=target returning * into item;
 return to_jsonb(item);
end; $$;

create or replace function duuk_private.office_invite(target uuid, side text, digest text, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts; invite public.duuk_contract_invites;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.deleted_at is not null then raise exception 'Restaure o contrato antes de continuar.' using errcode='PT409'; end if;
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

create or replace function duuk_private.office_sign(digest text, payload jsonb) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts; invitation public.duuk_contract_invites; target uuid;
begin
 select contract_id into target from public.duuk_contract_invites where token_hash=digest;
 if not found then raise exception 'Link inválido.' using errcode='PT404'; end if;
 select * into item from public.duuk_contracts where id=target for update;
 select * into invitation from public.duuk_contract_invites where token_hash=digest for update;
 if invitation.revoked_at is not null or invitation.expires_at < now() or item.status='cancelled' or item.deleted_at is not null then
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

create or replace function duuk_private.office_cancel(target uuid, revision bigint) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.deleted_at is not null then raise exception 'Restaure o contrato antes de continuar.' using errcode='PT409'; end if;
 if item.version <> revision then raise exception 'O contrato mudou. Recarregue antes de cancelar.' using errcode='PT409'; end if;
 if item.status='signed' then raise exception 'Contratos concluídos são preservados.' using errcode='PT409'; end if;
 update public.duuk_contract_invites set revoked_at=now() where contract_id=target and revoked_at is null;
 update public.duuk_contracts set status='cancelled',version=version+1,updated_at=now() where id=target returning * into item;
 return to_jsonb(item);
end; $$;

create or replace function duuk_private.office_delete(target uuid, revision bigint) returns text
 language plpgsql security invoker set search_path = '' as $$
declare item public.duuk_contracts;
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.version <> revision or item.deleted_at is null or exists(select 1 from public.duuk_contract_signatures where contract_id=target) then
  raise exception 'Só é possível excluir definitivamente contratos sem assinaturas que estejam na lixeira.' using errcode='PT409'; end if;
 delete from public.duuk_contracts where id=target;
 return item.original_path;
end; $$;
