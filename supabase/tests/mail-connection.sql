-- Run after mail-connection.sql. Every credential and audit write is rolled back.
begin;
do $$
declare owner_id uuid; other_id uuid; before_audit bigint; saved_id uuid;
begin
  select id into strict owner_id from public.duuk_profiles where active and is_super_admin limit 1;
  select id into strict other_id from public.duuk_profiles where active and not is_super_admin limit 1;
  if has_function_privilege('anon','public.duuk_mail_credentials()','EXECUTE')
    or has_function_privilege('authenticated','public.duuk_mail_credentials()','EXECUTE')
    or has_function_privilege('authenticated','duuk_private.mail_credentials()','EXECUTE')
    or has_function_privilege('anon','public.duuk_connect_mail(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.duuk_connect_mail(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','duuk_private.connect_mail(uuid,text)','EXECUTE') then
    raise exception 'Mailbox credential RPC is exposed';
  end if;
  if not has_function_privilege('service_role','public.duuk_mail_credentials()','EXECUTE')
    or not has_function_privilege('service_role','public.duuk_connect_mail(uuid,text)','EXECUTE') then
    raise exception 'Backend cannot manage mailbox';
  end if;
  begin
    perform public.duuk_connect_mail(other_id,'test-only-never-a-real-password');
    raise exception 'Non-super admin accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    perform public.duuk_connect_mail(owner_id,'');
    raise exception 'Empty credential accepted';
  exception when sqlstate 'PT400' then null; end;
  select count(*) into before_audit from public.duuk_audit where action='mail.connect';
  perform public.duuk_connect_mail(owner_id,' test-only-never-a-real-password ');
  select id into strict saved_id from vault.secrets where name='duuk.mail.password';
  if (public.duuk_mail_credentials()->>'password') <> ' test-only-never-a-real-password ' then
    raise exception 'Credential was not preserved exactly';
  end if;
  if exists(select 1 from vault.secrets where id=saved_id and secret=' test-only-never-a-real-password ') then
    raise exception 'Credential stored without encryption';
  end if;
  perform public.duuk_connect_mail(owner_id,'test-only-replacement');
  if (select id from vault.secrets where name='duuk.mail.password') <> saved_id
    or (public.duuk_mail_credentials()->>'password') <> 'test-only-replacement' then
    raise exception 'Reconnect did not replace existing credential';
  end if;
  if (select count(*) from public.duuk_audit where action='mail.connect') <> before_audit+2 then
    raise exception 'Connection audit missing';
  end if;
  if exists(select 1 from public.duuk_audit where action='mail.connect' and row_to_json(duuk_audit)::text like '%test-only%') then
    raise exception 'Credential leaked to audit';
  end if;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.duuk_mail_credentials();
    raise exception 'Authenticated user can read credential';
  exception when insufficient_privilege then null; end;
  begin
    perform public.duuk_connect_mail(gen_random_uuid(),'test-only');
    raise exception 'Authenticated user can write credential';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  if (public.duuk_mail_credentials()->>'password') <> 'test-only-replacement' then
    raise exception 'Service cannot read configured credential';
  end if;
end $$;
reset role;
rollback;
select 'mail connection security and encryption checks passed; all test writes rolled back' as result;
