-- These legacy browser RPCs must use the same live AAL2 session gate as RLS.
-- Preserve their bodies, signatures, grants and transactional/idempotency behavior.
do $$
declare signature text; definition text;
begin
 foreach signature in array array[
  'public.duuk_import_bank_statement(jsonb)',
  'public.duuk_reconcile_bank_transaction(uuid,bigint,text,jsonb)',
  'public.duuk_remove_bank_import(uuid,timestamp with time zone)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('not duuk_private.member_permission(actor,''finance'')' in definition)=0 then
   raise exception 'Unexpected authorization body for %',signature;
  end if;
  execute replace(definition,'not duuk_private.member_permission(actor,''finance'')','not duuk_private.has_permission(''finance'')');
 end loop;
end $$;
