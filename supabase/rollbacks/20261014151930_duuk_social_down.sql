-- Reverts supabase/migrations/20261014151930_duuk_social.sql and 20261014203900_duuk_social_functions.sql
-- (DUUK Social Media, Admin 2.0).
-- Use it only to remove the module, after rolling the Admin back to a version without Social Media.
-- It touches nothing that existed before that migration. It removes only what the migration created:
--  * the two cron jobs, the module's functions, triggers, policies and tables;
--  * the Vault secrets of the Meta app and of connected Instagram accounts;
--  * the `duuk-social` bucket when it is already empty (delete its files through the Storage API
--    or the dashboard first; direct SQL deletes of files are blocked by Supabase on purpose);
--  * the `social` permission key, its grants and the notifications that require it.
-- Audit entries of the module stay in the history, moved to the `permissions` scope, because the
-- `social` key no longer exists.
begin;

do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('duuk-social-dispatch', 'duuk-social-daily');
end $$;

delete from vault.secrets where id in (
  select credential_id from duuk_private.social_tokens
  union
  select credential_id from duuk_private.social_settings where credential_id is not null
);

drop trigger if exists duuk_social_audit_scope on public.duuk_audit;
drop function if exists duuk_private.social_audit_scope();

drop policy if exists social_files_read on storage.objects;
drop policy if exists social_files_upload on storage.objects;
drop policy if exists social_files_remove on storage.objects;

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'duuk-social') then
    raise notice 'O bucket duuk-social ainda tem arquivos. Apague-os pela API do Storage e remova o bucket depois.';
  else
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.buckets where id = 'duuk-social';
  end if;
end $$;

drop function if exists public.duuk_social_backend(text, jsonb);
drop function if exists public.duuk_social_media_register(jsonb);
drop function if exists public.duuk_social_media_update(jsonb);
drop function if exists public.duuk_social_media_delete(uuid, bigint);
drop function if exists public.duuk_social_post_save(jsonb);
drop function if exists public.duuk_social_post_unschedule(uuid, bigint);
drop function if exists public.duuk_social_post_delete(uuid, bigint);
drop function if exists duuk_private.social_post_json(uuid);
drop function if exists duuk_private.social_caption_counts(text);
drop function if exists duuk_private.social_actor_name(uuid);

drop table if exists
  public.duuk_social_events,
  public.duuk_social_post_media,
  public.duuk_social_snapshots,
  duuk_private.social_insights,
  duuk_private.social_tokens,
  duuk_private.social_oauth_states,
  duuk_private.social_deletions,
  duuk_private.social_settings,
  public.duuk_social_posts,
  public.duuk_social_media,
  public.duuk_social_accounts;

delete from public.duuk_notifications where required_permission = 'social';
delete from public.duuk_user_permissions where permission = 'social';
delete from public.duuk_role_permissions where permission = 'social';
update public.duuk_audit set required_permission = 'permissions' where required_permission = 'social';
delete from public.duuk_permission_keys where key = 'social';

commit;
