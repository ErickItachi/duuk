-- Apply after duuk-ai.sql. Acceptance belongs to the authenticated member,
-- survives browsers/devices, and is never inferred from an old local flag.
create table duuk_private.ai_consents (
 user_id uuid primary key references public.duuk_profiles(id) on delete cascade,
 version text not null check(char_length(version) between 1 and 40),
 accepted_at timestamptz,
 revoked_at timestamptz,
 updated_at timestamptz not null default now(),
 check(accepted_at is not null or revoked_at is not null)
);
alter table duuk_private.ai_consents enable row level security;
revoke all on duuk_private.ai_consents from public,anon,authenticated;
grant all on duuk_private.ai_consents to service_role;

create function duuk_private.ai_consent_backend(operation text,payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=nullif(payload->>'user_id','')::uuid;
 current_version constant text:='2026-10-09';
 saved duuk_private.ai_consents;
 accepted boolean;
begin
 if actor is null or not duuk_private.member_permission(actor,'ai') then
  raise exception 'Você não tem acesso ao DUUK AI.' using errcode='PT403';
 end if;
 if operation='set' then
  if payload->>'version' is distinct from current_version then
   raise exception 'O aviso de privacidade foi atualizado. Atualize a página e leia a versão atual.' using errcode='PT409';
  end if;
  if jsonb_typeof(payload->'accepted') is distinct from 'boolean' then
   raise exception 'Informe se deseja autorizar ou revogar o envio ao Gemini.' using errcode='PT400';
  end if;
  accepted:=(payload->>'accepted')::boolean;
  insert into duuk_private.ai_consents as existing(user_id,version,accepted_at,revoked_at)
   values(actor,current_version,case when accepted then now() end,case when not accepted then now() end)
   on conflict(user_id) do update set version=excluded.version,
    accepted_at=case when accepted then
     case when existing.version=current_version and existing.revoked_at is null then coalesce(existing.accepted_at,now()) else now() end
     else existing.accepted_at end,
    revoked_at=excluded.revoked_at,updated_at=now()
   where existing.user_id=actor;
 elsif operation='legacy_accept' then
  -- 1.7.1 already shows the same disclosure and requires an unchecked checkbox.
  -- Its explicit consent:true can record the FIRST acceptance, never undo a
  -- revocation or overwrite a different version. No bulk backfill is allowed.
  insert into duuk_private.ai_consents(user_id,version,accepted_at)
   values(actor,current_version,now()) on conflict(user_id) do nothing;
 elsif operation<>'status' then
  raise exception 'Operação de privacidade inválida.' using errcode='PT400';
 end if;
 select * into saved from duuk_private.ai_consents where user_id=actor;
 accepted:=saved.user_id is not null and saved.version=current_version and saved.accepted_at is not null and saved.revoked_at is null;
 return jsonb_build_object('accepted',accepted,'version',current_version,
  'accepted_at',case when accepted then saved.accepted_at end);
end;
$$;
create function public.duuk_ai_consent_backend(operation text,payload jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.ai_consent_backend(operation,payload); $$;
revoke all on function duuk_private.ai_consent_backend(text,jsonb),public.duuk_ai_consent_backend(text,jsonb) from public,anon,authenticated;
grant execute on function duuk_private.ai_consent_backend(text,jsonb),public.duuk_ai_consent_backend(text,jsonb) to service_role;
notify pgrst,'reload schema';
