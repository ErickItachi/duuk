-- Official click-to-chat only: no WhatsApp sessions, credentials or automatic sends.
alter table public.duuk_clients add column project_name text not null default '' check (char_length(project_name)<=160);
alter table public.duuk_clients add column event_date date;
alter table public.duuk_clients add column stage_changed_at timestamptz not null default now();
grant insert(project_name,event_date),update(project_name,event_date) on public.duuk_clients to authenticated;

create function duuk_private.validate_commercial_phone() returns trigger language plpgsql set search_path='' as $$
declare field text; value text; digits text; begin
 foreach field in array array['phone','whatsapp'] loop
  value=to_jsonb(new)->>field;
  if value<>'' and (TG_OP='INSERT' or value is distinct from to_jsonb(old)->>field) then
   if value !~ '^\+?[0-9 ().-]+$' then raise exception 'Informe telefone com DDI e DDD, sem links ou ramais.' using errcode='PT400';end if;
   digits=regexp_replace(value,'[^0-9]','','g');
   if digits ~ '^0' then raise exception 'Use o DDI sem prefixo zero.' using errcode='PT400';end if;
   if left(value,1)<>'+' and length(digits) in (10,11) then digits='55'||digits;end if;
   if digits !~ '^[1-9][0-9]{7,14}$' then raise exception 'Telefone internacional inválido.' using errcode='PT400';end if;
   if left(digits,2)='55' and digits !~ '^55([1-9][1-9])([2-5][0-9]{7}|9[0-9]{8})$' then raise exception 'Confira DDD e número brasileiro.' using errcode='PT400';end if;
   if field='phone' then new.phone='+'||digits;else new.whatsapp='+'||digits;end if;
  end if;
 end loop;
 if TG_OP='UPDATE' and new.stage is distinct from old.stage then new.stage_changed_at=now();end if;
 return new;
end $$;
create trigger commercial_phone before insert or update on public.duuk_clients for each row execute function duuk_private.validate_commercial_phone();
revoke all on function duuk_private.validate_commercial_phone() from public,anon,authenticated;

create table public.duuk_whatsapp_templates (
 id uuid primary key default gen_random_uuid(), seed_key text unique,
 title text not null check(length(trim(title)) between 1 and 120),
 body text not null check(length(trim(body)) between 1 and 3000),
 active boolean not null default true, version bigint not null default 1,
 created_by uuid not null default auth.uid() references auth.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index duuk_whatsapp_templates_creator_idx on public.duuk_whatsapp_templates(created_by);
alter table public.duuk_whatsapp_templates enable row level security;
revoke all on public.duuk_whatsapp_templates from public,anon,authenticated;
grant all on public.duuk_whatsapp_templates to service_role;
grant select on public.duuk_whatsapp_templates to authenticated;
grant insert(title,body,active),update(title,body,active) on public.duuk_whatsapp_templates to authenticated;
create policy whatsapp_templates_read on public.duuk_whatsapp_templates for select to authenticated using ((select duuk_private.crm_read()));
create policy whatsapp_templates_insert on public.duuk_whatsapp_templates for insert to authenticated with check ((select duuk_private.has_permission('crm.activities')));
create policy whatsapp_templates_update on public.duuk_whatsapp_templates for update to authenticated using ((select duuk_private.has_permission('crm.activities'))) with check ((select duuk_private.has_permission('crm.activities')));
create trigger whatsapp_template_revision before update on public.duuk_whatsapp_templates for each row execute function duuk_private.expense_revision();
create or replace function duuk_private.audit_scope() returns trigger language plpgsql set search_path='' as $$ begin
 new.required_permission=case new.entity when 'duuk_expenses' then 'finance' when 'duuk_contracts' then 'contracts' when 'duuk_contract_signatures' then 'contracts' when 'duuk_events' then 'agenda' when 'duuk_content' then 'site' when 'duuk_clients' then 'crm' when 'duuk_activities' then 'crm' when 'duuk_whatsapp_templates' then 'crm.activities' when 'duuk_follow_ups' then 'crm' when 'duuk_mail_links' then 'mail' when 'duuk_profiles' then 'team' when 'duuk_roles' then 'permissions' when 'duuk_role_permissions' then 'permissions' when 'duuk_user_permissions' then 'permissions' when 'duuk_permissions' then 'permissions' else null end;
 return new;
end; $$;

create function duuk_private.whatsapp_template_audit() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.duuk_audit(actor_id,actor_name,action,entity,entity_id,summary,details)
 values(auth.uid(),coalesce((select name from public.duuk_profiles where id=auth.uid()),'Sistema'),lower(TG_OP),'duuk_whatsapp_templates',new.id,'Modelo de WhatsApp '||case when TG_OP='INSERT' then 'criado' else 'atualizado' end,jsonb_build_object('title',new.title));
 return new;
end $$;
create trigger whatsapp_template_audit after insert or update on public.duuk_whatsapp_templates for each row execute function duuk_private.whatsapp_template_audit();
revoke all on function duuk_private.whatsapp_template_audit() from public,anon,authenticated;

insert into public.duuk_whatsapp_templates(seed_key,title,body,created_by)
select t.key,t.title,replace(t.body,chr(92)||'n',chr(10)),p.id from (values
 ('first','Primeiro contato comercial','Olá, {nome_cliente}! Sou da DUUK Films. Queremos conhecer os próximos planos da {nome_empresa} e conversar sobre como o audiovisual pode fazer parte deles. Podemos marcar uma conversa?'),
 ('intro','Apresentação da DUUK','Olá, {nome_cliente}! A DUUK é uma produtora audiovisual em São Paulo. Criamos filmes de marca, campanhas e conteúdos com direção e produção próprias. Nosso trabalho está em https://www.duukfilms.com. O que a {nome_empresa} está preparando?'),
 ('proposal','Envio de proposta','Olá, {nome_cliente}! A proposta para {nome_projeto} está pronta. Vou compartilhar o material por aqui para vocês avaliarem. Depois, podemos conversar sobre os detalhes.\n\nEquipe DUUK'),
 ('budget','Follow-up de orçamento','Olá, {nome_cliente}! Conseguiram avaliar a proposta de {nome_projeto}? Se algum ponto precisar de ajuste, podemos conversar.\n\nEquipe DUUK'),
 ('meeting','Confirmação de reunião','Olá, {nome_cliente}! Confirmando nossa reunião em {data_evento} para conversar sobre {nome_projeto}. Podemos manter o horário combinado?\n\nEquipe DUUK'),
 ('filming','Confirmação de gravação','Olá, {nome_cliente}! Confirmando a gravação de {nome_projeto} em {data_evento}. Vamos alinhar por aqui os últimos detalhes de horário e local.\n\nEquipe DUUK'),
 ('delivery','Aviso de entrega de projeto','Olá, {nome_cliente}! O material de {nome_projeto} está pronto para compartilhar. Vou enviar o acesso por aqui. Conte com a gente para os próximos passos.\n\nEquipe DUUK'),
 ('thanks','Agradecimento após conclusão','Olá, {nome_cliente}! Obrigado pela parceria em {nome_projeto} e pela confiança da {nome_empresa}. Foi um prazer criar esse trabalho juntos. Até a próxima!\n\nEquipe DUUK')
) t(key,title,body) cross join lateral (select id from public.duuk_profiles where active and is_super_admin order by created_at limit 1) p;

-- A single authorized transaction records contact + stage + optional next contact.
-- Definer is necessary for client summary updates; every optional module is checked separately.
create function duuk_private.record_contact(target uuid,revision bigint,request_id uuid,contacted_at timestamptz,contact_channel text,contact_notes text,outcome text,next_step text,next_due timestamptz,new_stage text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.duuk_clients; a public.duuk_activities; begin
 if auth.uid() is null or not duuk_private.has_permission('crm.activities') then raise exception 'Sem acesso aos contatos.' using errcode='PT403';end if;
 if new_stage is not null and not (duuk_private.has_permission('crm.pipeline') or duuk_private.has_permission('crm.clients')) then raise exception 'Sem acesso para alterar negociações.' using errcode='PT403';end if;
 if next_due is not null and not duuk_private.has_permission('crm.followups') then raise exception 'Sem acesso aos follow-ups.' using errcode='PT403';end if;
 if request_id is null or contacted_at is null or contacted_at>now()+interval '5 minutes' or length(trim(coalesce(contact_notes,''))) not between 1 and 3000 then raise exception 'Confira data e observação do contato realizado.' using errcode='PT400';end if;
 select * into c from public.duuk_clients where id=target for update;
 if not found then raise exception 'Cliente não encontrado.' using errcode='PT404';end if;
 select * into a from public.duuk_activities where id=request_id;
 if found then
  if a.client_id<>target or a.user_id<>auth.uid() then raise exception 'Identificador já utilizado.' using errcode='PT409';end if;
  return to_jsonb(a);
 end if;
 if c.version is distinct from revision then raise exception 'O cliente mudou. Atualize antes de registrar.' using errcode='PT409';end if;
 if next_due is not null and next_due<=now() then raise exception 'Escolha uma data futura para o próximo contato.' using errcode='PT400';end if;
 insert into public.duuk_activities(id,client_id,user_id,occurred_at,channel,notes,result,next_step)
 values(request_id,target,auth.uid(),contacted_at,contact_channel,trim(contact_notes),coalesce(outcome,''),coalesce(next_step,'')) returning * into a;
 if new_stage is not null then update public.duuk_clients set stage=new_stage where id=target;end if;
 if next_due is not null then insert into public.duuk_follow_ups(client_id,owner_id,due_at,notes)
 values(target,case when duuk_private.member_permission(c.owner_id,'crm.followups') then c.owner_id else auth.uid() end,next_due,coalesce(nullif(next_step,''),'Retomar contato'));end if;
 return to_jsonb(a);
end $$;
create function public.duuk_record_contact(target uuid,revision bigint,request_id uuid,contacted_at timestamptz,contact_channel text,contact_notes text,outcome text default '',next_step text default '',next_due timestamptz default null,new_stage text default null) returns jsonb language sql security invoker set search_path='' as $$
 select duuk_private.record_contact(target,revision,request_id,contacted_at,contact_channel,contact_notes,outcome,next_step,next_due,new_stage);
$$;
revoke all on function duuk_private.record_contact(uuid,bigint,uuid,timestamptz,text,text,text,text,timestamptz,text),public.duuk_record_contact(uuid,bigint,uuid,timestamptz,text,text,text,text,timestamptz,text) from public,anon;
grant execute on function duuk_private.record_contact(uuid,bigint,uuid,timestamptz,text,text,text,text,timestamptz,text),public.duuk_record_contact(uuid,bigint,uuid,timestamptz,text,text,text,text,timestamptz,text) to authenticated;

-- Preserve completion and additionally check the requested pipeline mutation.
create or replace function public.duuk_complete_followup(target uuid,revision bigint,outcome text,next_due timestamptz default null,new_stage text default null) returns jsonb language plpgsql security invoker set search_path='' as $$ begin
 if not duuk_private.has_permission('crm.followups') then raise exception 'Sem acesso aos follow-ups.' using errcode='PT403';end if;
 if new_stage is not null and not (duuk_private.has_permission('crm.pipeline') or duuk_private.has_permission('crm.clients')) then raise exception 'Sem acesso para alterar negociações.' using errcode='PT403';end if;
 return duuk_private.duuk_complete_followup(target,revision,outcome,next_due,new_stage);
end $$;

-- Only the existing backend scheduler can generate notifications.
create function duuk_private.commercial_reminders(reference_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare n timestamp:=reference_at at time zone 'America/Sao_Paulo'; p record; f record; begin
  for p in select owner_id,count(distinct client_id) as contacts from public.duuk_follow_ups where completed_at is null and (due_at at time zone 'America/Sao_Paulo')::date=n::date group by owner_id loop
   perform duuk_private.notify_members('commercial','crm.followups','Você tem '||p.contacts||case when p.contacts=1 then ' cliente para contatar hoje' else ' clientes para contatar hoje' end,'Confira os próximos contatos da sua agenda comercial.','/admin/comercial/follow-ups?filtro=today','commercial:today:'||n::date,p.owner_id);
  end loop;
  for f in select u.*,c.name from public.duuk_follow_ups u join public.duuk_clients c on c.id=u.client_id where u.completed_at is null and (u.due_at at time zone 'America/Sao_Paulo')::date=n::date+1 loop
   perform duuk_private.notify_members('commercial','crm.followups','Follow-up com '||f.name||' amanhã',f.notes,'/admin/comercial/follow-ups?filtro=tomorrow','commercial:tomorrow:'||f.id||':'||f.due_at,f.owner_id);
  end loop;
  for f in select * from public.duuk_clients c where c.owner_id is not null and c.stage='proposal' and greatest(c.stage_changed_at,coalesce(c.last_contact,c.created_at))<=reference_at-interval '3 days' loop
   perform duuk_private.notify_members('commercial','crm.pipeline','Proposta aguardando retorno',f.name||' · retome a conversa sobre a proposta.','/admin/comercial/pipeline?cliente='||f.id,'commercial:proposal:'||f.id||':'||greatest(f.stage_changed_at,coalesce(f.last_contact,f.created_at)),f.owner_id);
  end loop;
  for f in select * from public.duuk_clients c where c.owner_id is not null and c.stage not in ('won','lost') and greatest(c.stage_changed_at,coalesce(c.last_contact,c.created_at))<=reference_at-interval '7 days' loop
   perform duuk_private.notify_members('commercial','crm.pipeline','Negociação sem atualização há 7 dias',f.name||' · registre o contato ou revise a etapa.','/admin/comercial/pipeline?cliente='||f.id,'commercial:stale:'||f.id||':'||greatest(f.stage_changed_at,coalesce(f.last_contact,f.created_at)),f.owner_id);
  end loop;

end $$;
revoke all on function duuk_private.commercial_reminders(timestamptz) from public,anon,authenticated;
grant execute on function duuk_private.commercial_reminders(timestamptz) to service_role;

-- Daily commercial reminders use the existing dispatcher and dedupe store.
create or replace function public.duuk_generate_notifications() returns void language plpgsql security invoker set search_path='' as $$ declare e public.duuk_events; f record; p record; n timestamp:=now() at time zone 'America/Sao_Paulo'; total bigint; begin
 for e in select * from public.duuk_events where status in ('planned','confirmed') and start_date between n::date and n::date+1 loop
  if e.start_date=n::date+1 and extract(hour from n)=9 then perform duuk_private.notify_members('agenda','agenda',e.title||' amanhã',case when e.all_day then 'Dia inteiro' else 'Às '||to_char(e.start_time,'HH24:MI') end,'/admin/agenda?dia='||e.start_date,'agenda:tomorrow:'||e.id||':'||e.start_date);end if;
  if not e.all_day and (e.start_date+e.start_time) between n+interval '55 minutes' and n+interval '65 minutes' then perform duuk_private.notify_members('agenda','agenda','Compromisso em 1 hora',e.title||' · '||to_char(e.start_time,'HH24:MI'),'/admin/agenda?dia='||e.start_date,'agenda:hour:'||e.id||':'||e.start_date||':'||e.start_time);end if;
 end loop;

 if extract(hour from n)=9 then
  perform duuk_private.commercial_reminders(now());
  for p in select owner_id,count(*) as pending from public.duuk_follow_ups where completed_at is null and due_at<now() group by owner_id loop perform duuk_private.notify_members('commercial','crm.followups',p.pending||' follow-ups pendentes','Organize os próximos contatos da equipe.','/admin/comercial/follow-ups?filtro=overdue','followup:pending:'||n::date,p.owner_id);end loop;
  if extract(day from n)=1 then select coalesce(sum(amount_cents),0) into total from public.duuk_expenses where due_date >= date_trunc('month',n)::date-interval '1 month' and due_date<date_trunc('month',n)::date;
   perform duuk_private.notify_members('finance','finance','Resumo financeiro de '||to_char(n-interval '1 month','MM/YYYY'),'O mês anterior terminou com R$ '||replace(to_char(total::numeric/100,'FM999999999990.00'),'.',',')||' em despesas.','/admin/financeiro?mes='||to_char(n-interval '1 month','YYYY-MM'),'finance:month:'||date_trunc('month',n)::date);
  end if;
 end if;
 delete from public.duuk_notifications where created_at<now()-interval '180 days';
end; $$;

create or replace function duuk_private.duuk_complete_followup(target uuid,revision bigint,outcome text,next_due timestamptz default null,new_stage text default null) returns jsonb language plpgsql security definer set search_path='' as $$ declare f public.duuk_follow_ups; begin
 if not duuk_private.has_permission('crm.followups') then raise exception 'Sem acesso ao Comercial.' using errcode='PT403'; end if;
 if char_length(trim(outcome)) not between 1 and 1000 then raise exception 'Informe o resultado do contato.' using errcode='PT400'; end if;
 select * into f from public.duuk_follow_ups where id=target for update;
 if not found then raise exception 'Follow-up não encontrado.' using errcode='PT404'; end if;
 if f.version<>revision or f.completed_at is not null then raise exception 'O follow-up mudou. Atualize os dados.' using errcode='PT409'; end if;
 update public.duuk_follow_ups set completed_at=now(),result=trim(outcome) where id=target returning * into f;
 if next_due is not null then insert into public.duuk_follow_ups(client_id,owner_id,due_at,notes) values(f.client_id,f.owner_id,next_due,'Continuação: '||left(outcome,500)); end if;
 if new_stage is not null and not (duuk_private.has_permission('crm.pipeline') or duuk_private.has_permission('crm.clients')) then raise exception 'Sem acesso para alterar negociações.' using errcode='PT403';end if;
 if new_stage is not null then update public.duuk_clients set stage=new_stage where id=f.client_id; end if;
 return to_jsonb(f);
end; $$;
