-- RLS and Edge Functions share a live session + TOTP requirement. The
-- actor-only permission helper remains available to scheduled backend jobs.
create function duuk_private.valid_admin_session(actor uuid, session uuid, assurance text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(assurance = 'aal2', false) and exists (
    select 1 from auth.sessions s
    join auth.mfa_factors f on f.id = s.factor_id and f.user_id = s.user_id
    where s.id = session and s.user_id = actor and s.aal = 'aal2'
      and (s.not_after is null or s.not_after > now())
      and f.status = 'verified' and f.factor_type = 'totp'
  );
$$;
revoke all on function duuk_private.valid_admin_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function duuk_private.valid_admin_session(uuid,uuid,text) to service_role;

create or replace function duuk_private.has_permission(requested text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := auth.jwt(); session uuid;
begin
  -- A malformed/missing claim must deny access, including legacy access tokens.
  begin session := (claims->>'session_id')::uuid;
  exception when invalid_text_representation then return false; end;
  return duuk_private.valid_admin_session(auth.uid(),session,claims->>'aal')
    and duuk_private.member_permission(auth.uid(),requested);
end;
$$;

-- Callable only by the service role after auth.getUser verifies the JWT.
create function public.duuk_authorize_session(actor uuid, session uuid, assurance text)
returns boolean language sql stable security definer set search_path = '' as $$
  select duuk_private.valid_admin_session(actor,session,assurance)
    and duuk_private.member_permission(actor,null);
$$;
revoke all on function public.duuk_authorize_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.duuk_authorize_session(uuid,uuid,text) to service_role;

-- This RLS helper previously used the actor-only backend permission helper.
create or replace function duuk_private.drive_library_file_visible(document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select duuk_private.has_permission('drive') and exists (
    select 1 from public.duuk_drive_documents d where d.id=document_id and d.kind='file'
      and duuk_private.drive_folder_can_access(auth.uid(),duuk_private.drive_document_folder_key(d))
  );
$$;
alter policy own_membership on public.duuk_admins
  using (user_id = (select auth.uid()) and (select duuk_private.has_permission(null)));

comment on function public.duuk_authorize_session(uuid,uuid,text) is
  'Server-only: verified JWT session must still exist and reference a verified TOTP factor at AAL2.';
