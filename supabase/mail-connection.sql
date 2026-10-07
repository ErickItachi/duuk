-- Titan purchased through GoDaddy: one shared mailbox, managed by super admins.
-- Only the Edge Function's service role may read or write the encrypted credential.
create function duuk_private.mail_credentials() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('password', (select decrypted_secret from vault.decrypted_secrets where name = 'duuk.mail.password'));
$$;
create function public.duuk_mail_credentials() returns jsonb
language sql security invoker set search_path = '' as $$ select duuk_private.mail_credentials(); $$;

create function duuk_private.connect_mail(actor uuid, mailbox_password text) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_name text; secret_id uuid;
begin
  select name into owner_name from public.duuk_profiles where id = actor and active and is_super_admin;
  if not found then raise exception 'Somente um super administrador pode conectar a caixa.' using errcode = 'PT403'; end if;
  if mailbox_password is null or length(mailbox_password) < 1 or length(mailbox_password) > 1024 then
    raise exception 'Informe a senha da caixa de e-mail.' using errcode = 'PT400';
  end if;
  perform pg_advisory_xact_lock(hashtext('duuk-mail-connection'));
  select id into secret_id from vault.secrets where name = 'duuk.mail.password';
  if secret_id is null then
    perform vault.create_secret(mailbox_password, 'duuk.mail.password', 'Titan GoDaddy · contato@duukfilms.com');
  else
    perform vault.update_secret(secret_id, mailbox_password);
  end if;
  insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, required_permission)
    values (actor, owner_name, 'mail.connect', 'mailbox', 'contato@duukfilms.com', 'Conexão da caixa Titan atualizada.', 'mail');
end; $$;
create function public.duuk_connect_mail(actor uuid, mailbox_password text) returns void
language sql security invoker set search_path = '' as $$ select duuk_private.connect_mail(actor, mailbox_password); $$;

revoke all on function duuk_private.mail_credentials(), public.duuk_mail_credentials(), duuk_private.connect_mail(uuid,text), public.duuk_connect_mail(uuid,text) from public, anon, authenticated;
grant execute on function duuk_private.mail_credentials(), public.duuk_mail_credentials(), duuk_private.connect_mail(uuid,text), public.duuk_connect_mail(uuid,text) to service_role;
