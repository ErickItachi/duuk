-- Notifications are generated transactionally by real changes, never by frontend guesses.
alter table public.duuk_notification_preferences add column projects boolean not null default true;
grant insert(projects),update(projects) on public.duuk_notification_preferences to authenticated;
alter table public.duuk_notifications drop constraint duuk_notifications_category_check;
alter table public.duuk_notifications add constraint duuk_notifications_category_check check(category in ('agenda','projects','contracts','finance','commercial','system'));
create function duuk_private.notify_action(cat text,permission text,heading text,message text,destination text,dedupe text) returns void language sql security definer set search_path='' as $$
 insert into public.duuk_notifications(user_id,category,required_permission,title,body,link,dedupe_key)
 select p.id,cat,permission,left(heading,180),left(message,500),destination,dedupe
 from public.duuk_profiles p left join public.duuk_notification_preferences pref on pref.user_id=p.id
 where p.active and p.id is distinct from auth.uid() and duuk_private.member_permission(p.id,permission)
 and coalesce((to_jsonb(pref)->>cat)::boolean,true) on conflict(user_id,dedupe_key) do nothing;
$$;
create function duuk_private.agenda_action_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare heading text; item public.duuk_events; begin
 if TG_OP='DELETE' then item=old;heading='Compromisso excluído';
 elsif TG_OP='INSERT' then item=new;heading='Novo compromisso na agenda';
 else
  if (to_jsonb(new)-array['version','updated_at'])=(to_jsonb(old)-array['version','updated_at']) then return new;end if;
  item=new;heading=case when new.status='cancelled' and old.status<>'cancelled' then 'Compromisso cancelado' else 'Compromisso atualizado' end;
 end if;
 perform duuk_private.notify_action('agenda','agenda',heading,item.title,'/admin/agenda?dia='||item.start_date,'agenda:action:'||item.id||':'||TG_OP||':'||item.version);
 if TG_OP='INSERT' or (TG_OP='UPDATE' and new.responsible_id is distinct from old.responsible_id) then
  perform duuk_private.notify_members('agenda','agenda','Você é responsável por um compromisso',item.title,'/admin/agenda?dia='||item.start_date,'agenda:assigned:'||item.id||':'||item.version,item.responsible_id);
 end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
create trigger agenda_action_notification after insert or update or delete on public.duuk_events for each row execute function duuk_private.agenda_action_notification();

create function duuk_private.commercial_action_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare client_name text; label text; begin
 if TG_TABLE_NAME='duuk_clients' then
  if TG_OP='INSERT' then
   perform duuk_private.notify_action('commercial','crm.clients','Novo cliente cadastrado',new.name,'/admin/comercial/clientes?cliente='||new.id,'client:new:'||new.id);
   if new.stage in ('proposal','negotiation') then perform duuk_private.notify_action('commercial','crm.pipeline','Nova oportunidade comercial',new.name,'/admin/comercial/pipeline?cliente='||new.id,'client:opportunity:'||new.id);end if;
  elsif new.stage is distinct from old.stage then
   label=case new.stage when 'new' then 'Novo lead' when 'contacted' then 'Contato realizado' when 'waiting' then 'Aguardando resposta' when 'followup' then 'Follow-up' when 'meeting' then 'Reunião' when 'proposal' then 'Proposta' when 'negotiation' then 'Negociação' when 'won' then 'Fechado' else 'Perdido' end;
   perform duuk_private.notify_action('commercial','crm.pipeline',case when new.stage='won' then 'Negociação fechada' when new.stage='lost' then 'Negociação encerrada' else 'Negociação avançou no pipeline' end,new.name||' · '||label,'/admin/comercial/pipeline?cliente='||new.id,'client:stage:'||new.id||':'||new.version);
  end if;
 elsif TG_TABLE_NAME='duuk_activities' then
  select name into client_name from public.duuk_clients where id=new.client_id;
  perform duuk_private.notify_action('commercial','crm.activities','Novo contato registrado',coalesce(client_name,'Cliente')||case when new.result<>'' then ' · '||left(new.result,160) else '' end,'/admin/comercial/contatos?cliente='||new.client_id,'activity:new:'||new.id);
 end if;
 return new;
end $$;
create trigger commercial_client_notification after insert or update on public.duuk_clients for each row execute function duuk_private.commercial_action_notification();
create trigger commercial_activity_notification after insert on public.duuk_activities for each row execute function duuk_private.commercial_action_notification();

create function duuk_private.project_action_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; previous jsonb; label text; begin
 if new.key<>'draft' then return new;end if;
 for item in select * from jsonb_array_elements(new.content->'projects') loop
  select p into previous from jsonb_array_elements(old.content->'projects') p where p->>'id'=item->>'id';
  if previous is null then
   perform duuk_private.notify_action('projects','site','Novo projeto no portfólio',item->>'title','/admin/portfolio?projeto='||(item->>'id'),'project:new:'||(item->>'id'));
  elsif previous->>'status' is distinct from item->>'status' then
   label=case item->>'status' when 'published' then 'Visível no portfólio' when 'draft' then 'Rascunho' else 'Arquivado' end;
   perform duuk_private.notify_action('projects','site','Visibilidade do projeto alterada',(item->>'title')||' · '||label,'/admin/portfolio?projeto='||(item->>'id'),'project:status:'||(item->>'id')||':'||new.version);
  end if;
 end loop;
 return new;
end $$;
create trigger project_action_notification after update on public.duuk_content for each row execute function duuk_private.project_action_notification();

create function public.duuk_admin_notice(actor uuid,heading text,message text,request_id uuid) returns void language plpgsql security invoker set search_path='' as $$ begin
 if not exists(select 1 from public.duuk_profiles where id=actor and active and is_super_admin) then raise exception 'Acesso restrito.' using errcode='PT403';end if;
 if char_length(trim(heading)) not between 1 and 120 or char_length(trim(message)) not between 1 and 500 then raise exception 'Confira o título e o aviso.' using errcode='PT400';end if;
 if request_id is null then raise exception 'Identificador do aviso inválido.' using errcode='PT400';end if;
 perform duuk_private.notify_members('system',null,trim(heading),trim(message),'/admin/notificacoes','notice:'||actor||':'||request_id);
end $$;
revoke all on function duuk_private.notify_action(text,text,text,text,text,text),duuk_private.agenda_action_notification(),duuk_private.commercial_action_notification(),duuk_private.project_action_notification(),public.duuk_admin_notice(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.duuk_admin_notice(uuid,text,text,uuid),duuk_private.notify_action(text,text,text,text,text,text) to service_role;
create function public.duuk_generate_action_reminders() returns void language plpgsql security invoker set search_path='' as $$ declare f record; begin
 for f in select u.*,c.name from public.duuk_follow_ups u join public.duuk_clients c on c.id=u.client_id
 where u.completed_at is null and u.due_at between now()+interval '55 minutes' and now()+interval '65 minutes' loop
  perform duuk_private.notify_members('commercial','crm.followups','Follow-up em 1 hora',f.name,'/admin/comercial/follow-ups?filtro=upcoming','followup:hour:'||f.id||':'||f.due_at,f.owner_id);
 end loop;
end $$;
revoke all on function public.duuk_generate_action_reminders() from public,anon,authenticated;
grant execute on function public.duuk_generate_action_reminders() to service_role;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duuk_notifications') then alter publication supabase_realtime add table public.duuk_notifications;end if;end $$;
