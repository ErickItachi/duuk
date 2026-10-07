create table duuk_private.action_limits(actor uuid not null,action text not null,window_start bigint not null,count integer not null,primary key(actor,action,window_start));
alter table duuk_private.action_limits enable row level security;
revoke all on duuk_private.action_limits from public,anon,authenticated;
create function public.duuk_action_limit(actor uuid,action_name text,maximum integer,window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$ declare amount integer;bucket bigint:=floor(extract(epoch from now())/window_seconds);begin
 insert into duuk_private.action_limits values(actor,action_name,bucket,1) on conflict(actor,action,window_start) do update set count=action_limits.count+1 returning count into amount;
 delete from duuk_private.action_limits where window_start<floor(extract(epoch from now())/window_seconds)-2 and action=action_name;
 return amount<=maximum;
end; $$;
revoke all on function public.duuk_action_limit(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.duuk_action_limit(uuid,text,integer,integer) to service_role;
create table public.duuk_mail_outbox(request_id uuid primary key,created_by uuid not null references auth.users,status text not null check(status in ('sending','sent','uncertain')),message_id text,created_at timestamptz not null default now());
create index duuk_mail_outbox_owner_idx on public.duuk_mail_outbox(created_by);
create table public.duuk_mail_cursor(mailbox text primary key,uid_validity text not null,last_uid bigint not null,updated_at timestamptz not null default now());
alter table public.duuk_mail_outbox enable row level security;
alter table public.duuk_mail_cursor enable row level security;
revoke all on public.duuk_mail_outbox,public.duuk_mail_cursor from public,anon,authenticated;
grant all on public.duuk_mail_outbox,public.duuk_mail_cursor to service_role;
create function public.duuk_record_received_mail(provider_id text,heading text,sender_address text,recipient_address text,received_at timestamptz,message_uid bigint) returns void language plpgsql security invoker set search_path='' as $$ declare cid uuid;begin
 select id into cid from public.duuk_clients where lower(email)=lower(sender_address) order by created_at limit 1;
 insert into public.duuk_mail_links(message_id,client_id,subject,direction,sender,recipient,sent_at) values(provider_id,cid,left(heading,250),'in',sender_address,recipient_address,received_at) on conflict(message_id) do nothing;
 if not found then return;end if;
 if cid is not null then insert into public.duuk_client_history(client_id,actor_name,action,details) values(cid,'GoDaddy','E-mail recebido',jsonb_build_object('subject',left(heading,250),'message_id',provider_id));end if;
 perform duuk_private.notify_members('commercial','mail','Novo e-mail de '||left(sender_address,100),heading,'/admin/comercial/emails?mensagem='||message_uid,'mail:'||provider_id);
end; $$;
revoke all on function public.duuk_record_received_mail(text,text,text,text,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.duuk_record_received_mail(text,text,text,text,timestamptz,bigint) to service_role;
-- Keep actor attribution on anonymous electronic signatures without copying signature bytes.
create or replace function duuk_private.audit_changes() returns trigger language plpgsql security definer set search_path='' as $$ declare old_data jsonb;new_data jsonb;actor uuid:=auth.uid();target text;begin
 if TG_OP<>'INSERT' then old_data=to_jsonb(old);end if;if TG_OP<>'DELETE' then new_data=to_jsonb(new);end if;
 target=coalesce(new_data->>'id',old_data->>'id',new_data->>'user_id',old_data->>'user_id',new_data->>'role_id',old_data->>'role_id',new_data->>'key',old_data->>'key','');
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details) values(actor,coalesce((select name from public.duuk_profiles where id=actor),case when TG_TABLE_NAME='duuk_contract_signatures' then new_data->>'signer_name' end,'Sistema'),lower(TG_OP),TG_TABLE_NAME,target,case when TG_TABLE_NAME='duuk_contract_signatures' then 'Assinatura eletrônica registrada' else case TG_OP when 'INSERT' then 'Registro criado' when 'DELETE' then 'Registro excluído' else 'Registro atualizado' end end,jsonb_strip_nulls(jsonb_build_object('title',coalesce(new_data->>'title',old_data->>'title'),'name',coalesce(new_data->>'name',old_data->>'name'),'permission',coalesce(new_data->>'permission',old_data->>'permission'),'allowed',new_data->'allowed','previous_stage',old_data->>'stage','stage',new_data->>'stage','previous_status',old_data->>'status','status',new_data->>'status','contract_id',new_data->>'contract_id','party',new_data->>'party')));
 if TG_OP='DELETE' then return old;else return new;end if;
end; $$;
