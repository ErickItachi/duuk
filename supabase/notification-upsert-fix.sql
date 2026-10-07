-- Applied with Supabase MCP: allow_own_notification_settings_upsert.
-- PostgREST upsert updates every submitted column, including the conflict key.
-- Existing USING and WITH CHECK policies keep user_id equal to auth.uid().
grant update(user_id) on public.duuk_release_seen to authenticated;
grant update(user_id) on public.duuk_notification_preferences to authenticated;
