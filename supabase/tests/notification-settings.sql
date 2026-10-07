-- Run through the SQL editor or MCP. All writes are rolled back.
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.duuk_profiles where active limit 1),
  'role', 'authenticated'
)::text, true);
set local role authenticated;
do $$
declare actor uuid := auth.uid(); other_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  if actor is null then raise exception 'An active profile is required'; end if;
  insert into public.duuk_release_seen(user_id,version) values(actor,'1.0.0')
    on conflict(user_id) do update set user_id=excluded.user_id,version=excluded.version;
  insert into public.duuk_release_seen(user_id,version) values(actor,'1.0.1')
    on conflict(user_id) do update set user_id=excluded.user_id,version=excluded.version;
  if (select version from public.duuk_release_seen where user_id=actor) <> '1.0.1' then
    raise exception 'Acknowledgement upsert did not update';
  end if;
  insert into public.duuk_notification_preferences(user_id,agenda) values(actor,true)
    on conflict(user_id) do update set user_id=excluded.user_id,agenda=excluded.agenda;
  insert into public.duuk_notification_preferences(user_id,agenda) values(actor,false)
    on conflict(user_id) do update set user_id=excluded.user_id,agenda=excluded.agenda;
  if (select agenda from public.duuk_notification_preferences where user_id=actor) then
    raise exception 'Preference upsert did not update';
  end if;
  begin
    update public.duuk_release_seen set user_id=other_id where user_id=actor;
    raise exception 'Acknowledgement ownership reassignment was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.duuk_release_seen(user_id,version) values(other_id,'1.0.1');
    raise exception 'Foreign acknowledgement was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.duuk_notification_preferences set user_id=other_id where user_id=actor;
    raise exception 'Preference ownership reassignment was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.duuk_notification_preferences(user_id) values(other_id);
    raise exception 'Foreign preference was allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
