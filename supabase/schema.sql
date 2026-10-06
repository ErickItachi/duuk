-- Initial schema for the isolated DUUK Preview project.
create schema if not exists duuk_private;
revoke all on schema duuk_private from public;
grant usage on schema duuk_private to anon, authenticated;

create table public.duuk_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.duuk_admins enable row level security;
revoke all on public.duuk_admins from anon, authenticated;
grant select on public.duuk_admins to authenticated;
create policy own_membership on public.duuk_admins for select to authenticated
  using (user_id = (select auth.uid()));

create function duuk_private.is_admin() returns boolean language sql stable
  security invoker set search_path = '' as $$
  select exists(select 1 from public.duuk_admins where user_id = (select auth.uid()));
$$;
revoke all on function duuk_private.is_admin() from public;
grant execute on function duuk_private.is_admin() to authenticated;

create table public.duuk_content (
  key text primary key check (key in ('draft', 'published')),
  content jsonb not null check (jsonb_typeof(content->'projects') = 'array' and jsonb_typeof(content->'heroMedia') = 'object'),
  version bigint not null default 1,
  source_version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.duuk_content enable row level security;
revoke all on public.duuk_content from anon, authenticated;
grant select on public.duuk_content to anon, authenticated;
create policy published_content on public.duuk_content for select to anon using (key = 'published');
create policy admin_draft on public.duuk_content for select to authenticated using (key = 'published' or (select duuk_private.is_admin()));

create function duuk_private.references_media(document jsonb, media_id uuid) returns boolean
  language sql immutable strict security invoker set search_path = '' as $$
  select jsonb_path_exists(document, '$.** ? (@ == $ref)', jsonb_build_object('ref', 'preview-media:' || media_id::text));
$$;
create function duuk_private.media_published(media_id uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.duuk_content where key = 'published' and duuk_private.references_media(content, media_id));
$$;
revoke all on function duuk_private.references_media(jsonb, uuid), duuk_private.media_published(uuid) from public;
grant execute on function duuk_private.references_media(jsonb, uuid), duuk_private.media_published(uuid) to anon, authenticated;

create table public.duuk_media (
  id uuid primary key,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  type text not null check (type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm')),
  size bigint not null check (size between 1 and 52428800),
  deleting boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.duuk_media enable row level security;
revoke all on public.duuk_media from anon, authenticated;
grant select on public.duuk_media to anon, authenticated;
grant insert (id, path, name, type, size), delete on public.duuk_media to authenticated;
create policy published_media on public.duuk_media for select to anon
  using (not deleting and duuk_private.media_published(id));
create policy admin_media on public.duuk_media for select to authenticated using ((select duuk_private.is_admin()) or (not deleting and duuk_private.media_published(id)));
-- Check server-owned upload metadata without recursively applying Storage RLS.
create function duuk_private.upload_matches(object_path text, file_bytes bigint, mime text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists(select 1 from storage.objects where bucket_id = 'duuk-media' and name = object_path
    and owner_id = (select auth.uid())::text and (metadata->>'size')::bigint = file_bytes and metadata->>'mimetype' = mime);
$$;
revoke all on function duuk_private.upload_matches(text,bigint,text) from public, anon;
grant execute on function duuk_private.upload_matches(text,bigint,text) to authenticated;
create policy admin_upload_metadata on public.duuk_media for insert to authenticated
  with check ((select duuk_private.is_admin()) and split_part(path, '/', 1) = (select auth.uid())::text
    and split_part(split_part(path, '/', 2), '.', 1) = id::text
    and duuk_private.upload_matches(path,size,type));
create policy delete_unused_metadata on public.duuk_media for delete to authenticated
  using ((select duuk_private.is_admin()) and deleting);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('duuk-media', 'duuk-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']);
create policy duuk_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'duuk-media' and (select duuk_private.is_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy duuk_published_files on storage.objects for select to anon, authenticated
  using (bucket_id = 'duuk-media' and exists(select 1 from public.duuk_media m where m.path = storage.objects.name and not m.deleting and duuk_private.media_published(m.id)));
create policy duuk_admin_files on storage.objects for select to authenticated
  using (bucket_id = 'duuk-media' and (select duuk_private.is_admin()));
create policy duuk_delete_unused_file on storage.objects for delete to authenticated
  using (bucket_id = 'duuk-media' and (select duuk_private.is_admin())
    and (exists(select 1 from public.duuk_media m where m.path = storage.objects.name and m.deleting)
      or ((storage.foldername(name))[1] = (select auth.uid())::text and not exists(select 1 from public.duuk_media m where m.path = storage.objects.name))));

-- The browser has no table write privileges for content. All changes pass through
-- these authenticated functions, which check membership and lock the revision.
create function duuk_private.duuk_save_draft(document jsonb, expected_version bigint) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare current_version bigint; ref text;
begin
  if not duuk_private.is_admin() then raise exception 'Acesso não autorizado.' using errcode = '42501'; end if;
  select version into current_version from public.duuk_content where key = 'draft' for update;
  if current_version is distinct from expected_version then raise exception 'O rascunho foi atualizado em outra aba. Reabra a edição para continuar.' using errcode = 'PT409'; end if;
  if octet_length(document::text) > 1048576 or jsonb_typeof(document->'projects') is distinct from 'array'
    or jsonb_typeof(document->'heroMedia') is distinct from 'object' then raise exception 'Conteúdo inválido.'; end if;
  if exists(select 1 from jsonb_array_elements(document->'projects') p where coalesce(p->>'id','') = '' or coalesce(p->>'title','') = ''
      or coalesce(p->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or coalesce(p->>'status','') not in ('published','draft','archived'))
    or exists(select 1 from jsonb_array_elements(document->'projects') p group by p->>'id' having count(*) > 1)
    or exists(select 1 from jsonb_array_elements(document->'projects') p group by p->>'slug' having count(*) > 1) then raise exception 'Confira os títulos, endereços e visibilidade dos projetos.'; end if;
  for ref in select distinct value #>> '{}' from jsonb_path_query(document, '$.** ? (@.type() == "string")') value
    where (value #>> '{}') like 'preview-media:%' loop
    perform 1 from public.duuk_media where 'preview-media:' || id::text = ref and not deleting for share;
    if not found then raise exception 'Uma mídia foi removida da biblioteca. Escolha outro arquivo.'; end if;
  end loop;
  update public.duuk_content set content = jsonb_set(document, '{updatedAt}', to_jsonb(now())), version = version + 1, updated_at = now() where key = 'draft';
  return current_version + 1;
end;
$$;
create function duuk_private.duuk_publish(expected_version bigint) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare draft_row public.duuk_content; visible jsonb;
begin
  if not duuk_private.is_admin() then raise exception 'Acesso não autorizado.' using errcode = '42501'; end if;
  select * into draft_row from public.duuk_content where key = 'draft' for update;
  if draft_row.version is distinct from expected_version then raise exception 'O rascunho mudou. Confira a versão atual antes de publicar.' using errcode = 'PT409'; end if;
  select coalesce(jsonb_agg(p order by ord), '[]'::jsonb) into visible from jsonb_array_elements(draft_row.content->'projects') with ordinality as items(p, ord) where p->>'status' = 'published';
  update public.duuk_content set content = jsonb_set(draft_row.content, '{projects}', visible), version = version + 1,
    source_version = draft_row.version, updated_at = now() where key = 'published';
  return draft_row.version;
end;
$$;
create function duuk_private.duuk_prepare_media_delete(media_id uuid, cancel_delete boolean default false) returns text
  language plpgsql security definer set search_path = '' as $$
declare media_path text;
begin
  if not duuk_private.is_admin() then raise exception 'Acesso não autorizado.' using errcode = '42501'; end if;
  perform 1 from public.duuk_content order by key for update;
  if not cancel_delete and exists(select 1 from public.duuk_content where duuk_private.references_media(content, media_id)) then
    raise exception 'Esse arquivo está em uso. Troque a mídia e publique a alteração antes de removê-lo.';
  end if;
  update public.duuk_media set deleting = not cancel_delete where id = media_id returning path into media_path;
  if media_path is null then raise exception 'Arquivo não encontrado.'; end if;
  return media_path;
end;
$$;
revoke all on function duuk_private.duuk_save_draft(jsonb, bigint), duuk_private.duuk_publish(bigint), duuk_private.duuk_prepare_media_delete(uuid, boolean) from public, anon;
grant execute on function duuk_private.duuk_save_draft(jsonb, bigint), duuk_private.duuk_publish(bigint), duuk_private.duuk_prepare_media_delete(uuid, boolean) to authenticated;

-- Expose invoker wrappers; privileged bodies stay outside the Data API schemas.
create function public.duuk_save_draft(document jsonb, expected_version bigint) returns bigint
  language sql security invoker set search_path = '' as $$ select duuk_private.duuk_save_draft(document, expected_version); $$;
create function public.duuk_publish(expected_version bigint) returns bigint
  language sql security invoker set search_path = '' as $$ select duuk_private.duuk_publish(expected_version); $$;
create function public.duuk_prepare_media_delete(media_id uuid, cancel_delete boolean default false) returns text
  language sql security invoker set search_path = '' as $$ select duuk_private.duuk_prepare_media_delete(media_id, cancel_delete); $$;
revoke all on function public.duuk_save_draft(jsonb,bigint), public.duuk_publish(bigint), public.duuk_prepare_media_delete(uuid,boolean) from public, anon;
grant execute on function public.duuk_save_draft(jsonb,bigint), public.duuk_publish(bigint), public.duuk_prepare_media_delete(uuid,boolean) to authenticated;
