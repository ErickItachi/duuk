-- Atomic save: both the editable document and public snapshot commit together.
create function duuk_private.duuk_save_site(document jsonb, expected_version bigint) returns bigint
  language plpgsql security invoker set search_path = '' as $$
declare next_version bigint;
begin
  next_version := duuk_private.duuk_save_draft(document, expected_version);
  perform duuk_private.duuk_publish(next_version);
  return next_version;
end;
$$;
revoke all on function duuk_private.duuk_save_site(jsonb,bigint) from public, anon;
grant execute on function duuk_private.duuk_save_site(jsonb,bigint) to authenticated;
create function public.duuk_save_site(document jsonb, expected_version bigint) returns bigint
  language sql security invoker set search_path = '' as $$ select duuk_private.duuk_save_site(document,expected_version); $$;
revoke all on function public.duuk_save_site(jsonb,bigint) from public, anon;
grant execute on function public.duuk_save_site(jsonb,bigint) to authenticated;

-- Stream only rows allowed by each subscriber's SELECT policies.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duuk_content') then
    alter publication supabase_realtime add table public.duuk_content;
  end if;
end; $$;
