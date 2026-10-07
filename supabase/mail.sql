-- CRM mail stores only metadata and editable templates; messages stay with the provider.
create table public.duuk_mail_templates(id uuid primary key default gen_random_uuid(),title text not null check(char_length(trim(title)) between 1 and 120),subject text not null check(char_length(subject)<=250),body text not null check(char_length(body)<=20000),created_by uuid not null default auth.uid() references auth.users,created_at timestamptz not null default now());
create index duuk_mail_templates_owner_idx on public.duuk_mail_templates(created_by);
create table public.duuk_mail_links(id uuid primary key default gen_random_uuid(),message_id text not null unique check(char_length(message_id)<=1000),client_id uuid references public.duuk_clients on delete set null,subject text not null default '',direction text not null check(direction in ('in','out')),sender text not null,recipient text not null,sent_at timestamptz not null,created_by uuid references auth.users on delete set null,created_at timestamptz not null default now());
create index duuk_mail_links_client_idx on public.duuk_mail_links(client_id,sent_at desc);
create index duuk_mail_links_owner_idx on public.duuk_mail_links(created_by);
alter table public.duuk_mail_templates enable row level security;
alter table public.duuk_mail_links enable row level security;
revoke all on public.duuk_mail_templates,public.duuk_mail_links from public,anon,authenticated;
grant select,delete on public.duuk_mail_templates to authenticated;
grant insert(title,subject,body),update(title,subject,body) on public.duuk_mail_templates to authenticated;
grant select on public.duuk_mail_links to authenticated;
grant all on public.duuk_mail_templates,public.duuk_mail_links to service_role;
create policy mail_templates_access on public.duuk_mail_templates for all to authenticated using((select duuk_private.has_permission('mail'))) with check((select duuk_private.has_permission('mail')));
create policy mail_links_access on public.duuk_mail_links for select to authenticated using((select duuk_private.has_permission('mail')));
create trigger mail_audit after insert or update or delete on public.duuk_mail_links for each row execute function duuk_private.audit_changes();
