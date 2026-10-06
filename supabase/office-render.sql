-- Preserve received signatures when cancellation overlaps PDF generation.
-- This migration does not reactivate links or permit new signatures.
create or replace function duuk_private.office_render(target uuid, revision bigint, object_path text, digest text) returns boolean
 language plpgsql security invoker set search_path = '' as $$
begin
 update public.duuk_contracts set signed_path=object_path,signed_sha256=digest,rendered_version=revision
  where id=target and version=revision and status in ('partial','signed','cancelled')
    and exists(select 1 from public.duuk_contract_signatures where contract_id=target);
 return found;
end; $$;
revoke all on function duuk_private.office_render(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function duuk_private.office_render(uuid,bigint,text,text) to service_role;
