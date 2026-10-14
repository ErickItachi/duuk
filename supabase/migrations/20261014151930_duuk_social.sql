-- DUUK Social Media (Admin 2.0), part 1: schema and storage. Part 2 (functions, RPCs, cron) is
-- 20261014160000_duuk_social_functions.sql. Instagram API with Instagram Login, official Graph API only.
-- Additive and reversible (supabase/rollbacks/20261014151930_duuk_social_down.sql):
--  * new permission key `social`, granted to no group (super administrators keep full access);
--  * Meta app secret and account tokens only in Vault, read by the duuk-social Edge Function
--    through a service_role RPC; the browser never receives them;
--  * module tables readable by members with `social`; every write goes through RPCs that check the
--    current permission and an expected version;
--  * a private `duuk-social` bucket in the existing Supabase Storage (50 MB per file, free plan);
--  * two cron jobs: publish due posts (the HTTP call only happens when a post is due) and a daily
--    token refresh with follower snapshots.
-- Existing tables, rows and policies are untouched. Notifications reuse the `system` category.

insert into public.duuk_permission_keys(key, label) values ('social', 'Social Media') on conflict (key) do nothing;

-- Meta app (one per DUUK). The secret lives in Vault; app_mode/access_level are what the
-- administration declares about the app in Meta for Developers (the API cannot report them).
create table duuk_private.social_settings (
  singleton boolean primary key default true check (singleton),
  app_id text check (app_id is null or app_id ~ '^[0-9]{5,30}$'),
  credential_id uuid references vault.secrets(id) on delete set null,
  app_mode text not null default 'development' check (app_mode in ('development', 'live')),
  access_level text not null default 'standard' check (access_level in ('standard', 'advanced')),
  configured_by uuid references public.duuk_profiles(id) on delete set null,
  configured_at timestamptz,
  version bigint not null default 1 check (version > 0)
);
insert into duuk_private.social_settings(singleton) values (true);
create index social_settings_credential_idx on duuk_private.social_settings(credential_id);
create index social_settings_actor_idx on duuk_private.social_settings(configured_by);

create table public.duuk_social_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'instagram' check (provider = 'instagram'),
  ig_user_id text not null unique check (ig_user_id ~ '^[0-9]{1,40}$'),
  app_scoped_id text check (app_scoped_id is null or app_scoped_id ~ '^[0-9]{1,40}$'),
  username text not null check (char_length(username) between 1 and 60),
  name text not null default '' check (char_length(name) <= 160),
  account_type text not null default '' check (char_length(account_type) <= 40),
  profile_picture_url text check (profile_picture_url is null or (profile_picture_url ~ '^https://' and char_length(profile_picture_url) <= 2048)),
  followers_count integer check (followers_count >= 0),
  follows_count integer check (follows_count >= 0),
  media_count integer check (media_count >= 0),
  owner_kind text not null default 'duuk' check (owner_kind in ('duuk', 'client')),
  client_id uuid references public.duuk_clients(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error', 'disconnected')),
  permissions text[] not null default '{}' check (cardinality(permissions) <= 20),
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  last_checked_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  connected_by uuid references public.duuk_profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index duuk_social_accounts_client_idx on public.duuk_social_accounts(client_id);
create index duuk_social_accounts_actor_idx on public.duuk_social_accounts(connected_by);

create table duuk_private.social_tokens (
  account_id uuid primary key references public.duuk_social_accounts(id) on delete cascade,
  credential_id uuid not null references vault.secrets(id) on delete cascade,
  issued_at timestamptz not null default now(),
  refreshed_at timestamptz,
  expires_at timestamptz not null
);
create index social_tokens_credential_idx on duuk_private.social_tokens(credential_id);

create table duuk_private.social_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.duuk_profiles(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('duuk', 'client')),
  client_id uuid references public.duuk_clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  consumed_at timestamptz
);
create index social_oauth_states_user_idx on duuk_private.social_oauth_states(user_id);
create index social_oauth_states_client_idx on duuk_private.social_oauth_states(client_id);

-- Requests received from Meta's data deletion callback (confirmation code shown to the person).
create table duuk_private.social_deletions (
  confirmation_code text primary key check (confirmation_code ~ '^[a-f0-9]{32}$'),
  ig_user_id text not null check (ig_user_id ~ '^[0-9]{1,40}$'),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Short-lived cache of what Instagram returned (insights, recent media, quota), to save API calls.
create table duuk_private.social_insights (
  account_id uuid not null references public.duuk_social_accounts(id) on delete cascade,
  scope text not null check (scope in ('account', 'media', 'recent', 'limit')),
  key text not null check (char_length(key) between 1 and 200),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (account_id, scope, key)
);

create table public.duuk_social_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|mp4|mov)$'),
  poster_path text unique check (poster_path is null or poster_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null check (mime_type in ('image/jpeg', 'video/mp4', 'video/quicktime')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  duration_ms integer check (duration_ms between 0 and 3600000),
  title text not null default '' check (char_length(title) <= 160),
  alt_text text not null default '' check (char_length(alt_text) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'image') = (mime_type = 'image/jpeg')),
  check (poster_path is null or kind = 'video')
);
create index duuk_social_media_created_idx on public.duuk_social_media(created_at desc, id);
create index duuk_social_media_uploader_idx on public.duuk_social_media(uploaded_by);

create table public.duuk_social_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.duuk_social_accounts(id) on delete restrict,
  format text not null check (format in ('image', 'carousel', 'reel', 'story')),
  caption text not null default '' check (char_length(caption) <= 2200),
  share_to_feed boolean not null default true,
  thumb_offset_ms integer check (thumb_offset_ms between 0 and 900000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  -- Planned date for drafts; publishing time once scheduled.
  scheduled_at timestamptz,
  scheduled_by uuid references public.duuk_profiles(id) on delete set null,
  publish_requested_by uuid references public.duuk_profiles(id) on delete set null,
  ig_container_id text check (ig_container_id is null or ig_container_id ~ '^[0-9]{1,40}$'),
  processing_started_at timestamptz,
  publish_attempted_at timestamptz,
  ig_media_id text check (ig_media_id is null or ig_media_id ~ '^[0-9]{1,40}$'),
  permalink text check (permalink is null or (permalink ~ '^https://(www\.)?instagram\.com/' and char_length(permalink) <= 500)),
  published_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 50),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 40),
  client_request_id uuid unique,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or (scheduled_at is not null and scheduled_by is not null)),
  check (status <> 'published' or published_at is not null)
);
create index duuk_social_posts_due_idx on public.duuk_social_posts(scheduled_at) where status = 'scheduled';
create index duuk_social_posts_publishing_idx on public.duuk_social_posts(next_attempt_at) where status = 'publishing';
create index duuk_social_posts_calendar_idx on public.duuk_social_posts(coalesce(published_at, scheduled_at, created_at));
create index duuk_social_posts_account_idx on public.duuk_social_posts(account_id);
create index duuk_social_posts_creator_idx on public.duuk_social_posts(created_by);
create index duuk_social_posts_updater_idx on public.duuk_social_posts(updated_by);
create index duuk_social_posts_scheduler_idx on public.duuk_social_posts(scheduled_by);
create index duuk_social_posts_requester_idx on public.duuk_social_posts(publish_requested_by);

create table public.duuk_social_post_media (
  post_id uuid not null references public.duuk_social_posts(id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  media_id uuid references public.duuk_social_media(id) on delete set null,
  alt_text text not null default '' check (char_length(alt_text) <= 1000),
  ig_container_id text check (ig_container_id is null or ig_container_id ~ '^[0-9]{1,40}$'),
  primary key (post_id, position)
);
create index duuk_social_post_media_media_idx on public.duuk_social_post_media(media_id);

create table public.duuk_social_events (
  id bigint generated always as identity primary key,
  post_id uuid references public.duuk_social_posts(id) on delete cascade,
  account_id uuid references public.duuk_social_accounts(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  message text not null default '' check (char_length(message) <= 500),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index duuk_social_events_post_idx on public.duuk_social_events(post_id, created_at desc);
create index duuk_social_events_account_idx on public.duuk_social_events(account_id, created_at desc);
create index duuk_social_events_actor_idx on public.duuk_social_events(actor_id);

-- Daily follower numbers recorded by DUUK, so growth is real even where Insights has no data.
create table public.duuk_social_snapshots (
  account_id uuid not null references public.duuk_social_accounts(id) on delete cascade,
  day date not null,
  followers_count integer check (followers_count >= 0),
  follows_count integer check (follows_count >= 0),
  media_count integer check (media_count >= 0),
  captured_at timestamptz not null default now(),
  primary key (account_id, day)
);

create trigger social_account_revision before update on public.duuk_social_accounts for each row execute function duuk_private.expense_revision();
create trigger social_media_revision before update on public.duuk_social_media for each row execute function duuk_private.expense_revision();
create trigger social_post_revision before update on public.duuk_social_posts for each row execute function duuk_private.expense_revision();

do $$
declare name text;
begin
  foreach name in array array['duuk_social_accounts', 'duuk_social_media', 'duuk_social_posts', 'duuk_social_post_media', 'duuk_social_events', 'duuk_social_snapshots'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on public.%I from public, anon, authenticated', name);
    execute format('grant select on public.%I to authenticated', name);
    execute format('grant all on public.%I to service_role', name);
    execute format('create policy %I on public.%I for select to authenticated using ((select duuk_private.has_permission(''social'')))', name || '_read', name);
  end loop;
  foreach name in array array['social_settings', 'social_tokens', 'social_oauth_states', 'social_deletions', 'social_insights'] loop
    execute format('alter table duuk_private.%I enable row level security', name);
    execute format('revoke all on duuk_private.%I from public, anon, authenticated', name);
    execute format('grant all on duuk_private.%I to service_role', name);
  end loop;
end $$;
grant usage, select on sequence public.duuk_social_events_id_seq to service_role;

-- Audit entries of this module are visible only to members who also have `social`.
create function duuk_private.social_audit_scope() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.entity = 'duuk_social' then new.required_permission := 'social'; end if;
  return new;
end;
$$;
revoke all on function duuk_private.social_audit_scope() from public, anon, authenticated;
create trigger duuk_social_audit_scope before insert on public.duuk_audit for each row execute function duuk_private.social_audit_scope();

-- Storage: same Supabase Storage the Admin already uses, in a private bucket for this module.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('duuk-social', 'duuk-social', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
create policy social_files_read on storage.objects for select to authenticated
  using (bucket_id = 'duuk-social' and (select duuk_private.has_permission('social')));
create policy social_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'duuk-social' and (select duuk_private.has_permission('social')) and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Files can be removed only after their library entry is gone (see duuk_social_media_delete).
create policy social_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'duuk-social' and (select duuk_private.has_permission('social'))
    and not exists (select 1 from public.duuk_social_media m where m.storage_path = objects.name or m.poster_path = objects.name));

