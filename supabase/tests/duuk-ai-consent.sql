-- Run after duuk-ai-consent.sql. All synthetic accounts and acceptance roll back.
begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();disabled uuid:=gen_random_uuid();r uuid:=gen_random_uuid();
 result jsonb; first_accept text;
begin
 insert into public.duuk_roles(id,name) values(r,'Teste AI privacidade '||r);
 insert into auth.users(id,email) values(a,a||'@test.invalid'),(b,b||'@test.invalid'),(disabled,disabled||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active) values
  (a,'AI consent A',a||'@test.invalid',r,true),(b,'AI consent B',b||'@test.invalid',r,true),(disabled,'AI consent desativado',disabled||'@test.invalid',r,false);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(r,'ai',true);
 if has_function_privilege('authenticated','public.duuk_ai_consent_backend(text,jsonb)','execute') or has_function_privilege('anon','public.duuk_ai_consent_backend(text,jsonb)','execute') then raise exception 'RPC de consentimento exposta';end if;
 if has_table_privilege('authenticated','duuk_private.ai_consents','select') or has_table_privilege('authenticated','duuk_private.ai_consents','insert') or has_table_privilege('anon','duuk_private.ai_consents','select') then raise exception 'Tabela privada exposta';end if;
 if not (select relrowsecurity from pg_class where oid='duuk_private.ai_consents'::regclass) then raise exception 'RLS não ativado';end if;
 result:=public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',a));
 if (result->>'accepted')::boolean or result->>'version'<>'2026-10-09' or result->>'accepted_at' is not null then raise exception 'Aceite inferido sem autorização';end if;
 begin perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted',true,'version','old'));raise exception 'Versão antiga aceita';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted','true','version','2026-10-09'));raise exception 'Aceite textual aceito';exception when sqlstate 'PT400' then null;end;
 result:=public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted',true,'version','2026-10-09'));
 first_accept:=result->>'accepted_at';
 if not (result->>'accepted')::boolean or first_accept is null then raise exception 'Aceite não persistido';end if;
 if public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',a))<>result then raise exception 'Aceite não recuperado na mesma conta';end if;
 if (public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',b))->>'accepted')::boolean then raise exception 'Outra pessoa herdou aceite';end if;
 -- now() is constant within a transaction: age the synthetic receipt so a
 -- faulty upsert that resets it to now() would actually fail this assertion.
 update duuk_private.ai_consents set accepted_at=now()-interval '1 day' where user_id=a;
 first_accept:=public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',a))->>'accepted_at';
 if public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted',true,'version','2026-10-09'))->>'accepted_at'<>first_accept then raise exception 'Repetição alterou aceite';end if;
 result:=public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted',false,'version','2026-10-09'));
 if (result->>'accepted')::boolean then raise exception 'Revogação ignorada';end if;
 if (public.duuk_ai_consent_backend('legacy_accept',jsonb_build_object('user_id',a))->>'accepted')::boolean then raise exception 'Cliente legado reautorizou aceite revogado';end if;
 if not (public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',a,'accepted',true,'version','2026-10-09'))->>'accepted')::boolean then raise exception 'Novo aceite explícito recusado';end if;
 if not (public.duuk_ai_consent_backend('legacy_accept',jsonb_build_object('user_id',b))->>'accepted')::boolean then raise exception 'Primeiro aceite legado explícito não persistiu';end if;
 update duuk_private.ai_consents set version='old' where user_id=b;
 if (public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',b))->>'accepted')::boolean then raise exception 'Versão antiga herdada';end if;
 if (public.duuk_ai_consent_backend('legacy_accept',jsonb_build_object('user_id',b))->>'accepted')::boolean then raise exception 'Legado sobrescreveu versão antiga';end if;
 begin perform public.duuk_ai_consent_backend('set',jsonb_build_object('user_id',disabled,'accepted',true,'version','2026-10-09'));raise exception 'Conta desativada autorizou';exception when sqlstate 'PT403' then null;end;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(a,'ai',false);
 begin perform public.duuk_ai_consent_backend('status',jsonb_build_object('user_id',a));raise exception 'Permissão revogada ignorada';exception when sqlstate 'PT403' then null;end;
end;
$$;
rollback;
select 'PASS: per-member persistent consent, explicit version, idempotence, revocation, legacy migration, isolation and server-only access' result;
