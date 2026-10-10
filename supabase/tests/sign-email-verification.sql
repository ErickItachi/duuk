-- Isolated fixtures; no SMTP, Google, push or real signatures. Roll back everything.
begin;
do $$
declare actor uuid:=gen_random_uuid(); role_id uuid:=gen_random_uuid(); target_contract uuid:=gen_random_uuid(); legacy_contract uuid:=gen_random_uuid();
 target_invite uuid; legacy_invite uuid; challenge_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); result jsonb; replay jsonb;
 email text:=gen_random_uuid()||'@test.invalid'; payload jsonb; protected_digest text:=repeat('1',64); legacy_digest text:=repeat('2',64);
 proof_hash text:=repeat('a',64); hash text:=repeat('b',64); i integer; second_challenge uuid; second_request uuid; additional_digest text:=repeat('3',64); duuk_invite uuid;
begin
 if has_function_privilege('anon','public.duuk_sign_verification_backend(text,jsonb)','execute')
  or has_function_privilege('authenticated','public.duuk_sign_verification_backend(text,jsonb)','execute')
  or has_function_privilege('authenticated','public.duuk_office_invite_verified(uuid,text,text,bigint,text)','execute')
  or has_table_privilege('authenticated','duuk_private.sign_email_challenges','select')
  or has_table_privilege('anon','duuk_private.sign_email_proofs','select') then raise exception 'Verificação exposta';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='duuk_private' and c.relname in('sign_email_challenges','sign_email_proofs') and not c.relrowsecurity) then raise exception 'RLS ausente';end if;
 insert into public.duuk_roles(id,name) values(role_id,'Fixture assinatura '||role_id);
 insert into auth.users(id,email) values(actor,actor||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,is_super_admin) values(actor,'Fixture assinatura',actor||'@test.invalid',role_id,true);
 insert into public.duuk_contracts(id,title,client_name,client_email,duuk_name,original_path,original_sha256,pages,fields,created_by)
 values(target_contract,'Contrato privado','Cliente privado',email,'DUUK','original/'||target_contract||'/'||gen_random_uuid()||'.pdf',repeat('c',64),'[{"width":595,"height":842,"rotation":0}]','[{"type":"signature","party":"client"},{"type":"signature","party":"duuk"}]',actor),
 (legacy_contract,'Legado privado','Cliente legado',email,'DUUK','original/'||legacy_contract||'/'||gen_random_uuid()||'.pdf',repeat('d',64),'[{"width":595,"height":842,"rotation":0}]','[{"type":"signature","party":"client"},{"type":"signature","party":"duuk"}]',actor);
 result:=public.duuk_office_invite(target_contract,'client',protected_digest,1);
 select id into target_invite from public.duuk_contract_invites where token_hash=protected_digest;
 if not (select verification_required from public.duuk_contract_invites where id=target_invite) then raise exception 'Cliente antigo gerou link sem proteção';end if;
 if (select recipient_email from public.duuk_contract_invites where id=target_invite)<>email then raise exception 'Snapshot do destinatário inválido';end if;
 insert into public.duuk_contract_invites(id,contract_id,party,token_hash) values(gen_random_uuid(),legacy_contract,'client',legacy_digest) returning id into legacy_invite;
 payload:=jsonb_build_object('digest',protected_digest,'email',email,'client_request_id',request_id,'challenge_id',challenge_id,'code_hash',hash);
 begin perform public.duuk_sign_verification_backend('prepare',payload||jsonb_build_object('email','outro@test.invalid'));raise exception 'Destinatário arbitrário aceito';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_office_sign(protected_digest,jsonb_build_object('name','Teste','png',repeat('p',120),'values','{}'::jsonb,'consent','aceite','user_agent','fixture'));raise exception 'Assinatura sem verificação aceita';exception when sqlstate 'PT403' then null;end;
 result:=public.duuk_sign_verification_backend('prepare',payload);
 if not (result->>'deliver')::boolean then raise exception 'Envio não reservado';end if;
 begin perform public.duuk_sign_verification_backend('prepare',payload);raise exception 'Replay em andamento reenviou';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_sign_verification_backend('delivery',jsonb_build_object('digest',protected_digest,'challenge_id',challenge_id,'sent',true));
 replay:=public.duuk_sign_verification_backend('prepare',payload);
 if (replay->>'deliver')::boolean or replay->>'challenge_id'<>challenge_id::text then raise exception 'Replay entregue reenviou ou mudou desafio';end if;
 begin perform public.duuk_sign_verification_backend('prepare',payload||jsonb_build_object('client_request_id',gen_random_uuid(),'challenge_id',gen_random_uuid()));raise exception 'Reenvio antes de 60s aceito';exception when sqlstate 'PT429' then null;end;
 for i in 1..5 loop
  result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',challenge_id,'code_hash',repeat('0',64),'proof_hash',proof_hash));
  if not result?'error' or (select attempts from duuk_private.sign_email_challenges where id=challenge_id)<>i then raise exception 'Tentativa incorreta não persistiu';end if;
 end loop;
 result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',challenge_id,'code_hash',hash,'proof_hash',proof_hash));
 if result->>'status'<>'429' then raise exception 'Cinco tentativas não bloquearam o código';end if;
 update duuk_private.sign_email_challenges set created_at=now()-interval '61 seconds' where id=challenge_id;
 second_challenge:=gen_random_uuid();second_request:=gen_random_uuid();
 payload:=payload||jsonb_build_object('client_request_id',second_request,'challenge_id',second_challenge);
 perform public.duuk_sign_verification_backend('prepare',payload);
 if (select status from duuk_private.sign_email_challenges where id=challenge_id)<>'superseded' then raise exception 'Reenvio não invalidou código anterior';end if;
 result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'code_hash',hash,'proof_hash',proof_hash));
 if not result?'error' then raise exception 'Código ainda não enviado aceito';end if;
 perform public.duuk_sign_verification_backend('delivery',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'sent',true));
 update duuk_private.sign_email_challenges set expires_at=now()-interval '1 second' where id=second_challenge;
 result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'code_hash',hash,'proof_hash',proof_hash));
 if not result?'error' then raise exception 'Código expirado aceito';end if;
 update duuk_private.sign_email_challenges set expires_at=now()+interval '10 minutes' where id=second_challenge;
 result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'code_hash',hash,'proof_hash',proof_hash));
 if not (result->>'verified')::boolean then raise exception 'Código correto rejeitado';end if;
 begin perform public.duuk_sign_verification_backend('access',jsonb_build_object('digest',protected_digest,'proof_hash',repeat('f',64)));raise exception 'Prova inexistente aceita';exception when sqlstate 'PT403' then null;end;
 result:=public.duuk_sign_verification_backend('access',jsonb_build_object('digest',protected_digest,'proof_hash',proof_hash));
 if result->>'email'<>email or result->>'method'<>'email_otp' then raise exception 'Prova não vinculada ao destinatário';end if;
 for i in 1..9 loop
  result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'code_hash',hash,'proof_hash',encode(extensions.digest(i::text,'sha256'),'hex')));
  if not (result->>'verified')::boolean then raise exception 'Nova tentativa após resposta perdida não recuperou acesso';end if;
 end loop;
 result:=public.duuk_sign_verification_backend('verify',jsonb_build_object('digest',protected_digest,'challenge_id',second_challenge,'code_hash',hash,'proof_hash',repeat('e',64)));
 if result->>'status'<>'429' then raise exception 'Código conhecido permitiu criação ilimitada de provas';end if;
 update duuk_private.sign_email_proofs set expires_at=now()-interval '1 second' where token_hash=proof_hash;
 begin perform public.duuk_office_sign(protected_digest,jsonb_build_object('verification_hash',proof_hash));raise exception 'Prova expirada assinou';exception when sqlstate 'PT403' then null;end;
 update duuk_private.sign_email_proofs set expires_at=now()+interval '30 minutes' where token_hash=proof_hash;
 result:=public.duuk_office_sign(protected_digest,jsonb_build_object('name','Nome informado','png',repeat('p',120),'values','{}'::jsonb,'consent','aceite','user_agent','fixture','verification_hash',proof_hash,'verified_email','spoof@test.invalid'));
 if not exists(select 1 from public.duuk_contract_signatures where invite_id=target_invite and verified_email=email and verification_method='email_otp' and email_verified_at is not null and verification_challenge_id=second_challenge) then raise exception 'Evidências de confirmação ausentes ou falsificadas';end if;
 begin update public.duuk_contract_signatures set verification_method=null where invite_id=target_invite;raise exception 'Método NULL burlou integridade das evidências';exception when check_violation then null;end;
 perform public.duuk_office_sign(protected_digest,jsonb_build_object('name','Replay','png',repeat('p',120),'values','{}'::jsonb,'consent','aceite','user_agent','fixture','verification_hash',proof_hash));
 if (select count(*) from public.duuk_contract_signatures where contract_id=target_contract and party='client')<>1 then raise exception 'Assinatura repetida duplicou';end if;
 result:=public.duuk_office_invite_verified(target_contract,'duuk',additional_digest,(select version from public.duuk_contracts where id=target_contract),email);
 select id into duuk_invite from public.duuk_contract_invites where token_hash=additional_digest;
 begin perform public.duuk_sign_verification_backend('access',jsonb_build_object('digest',additional_digest,'proof_hash',proof_hash));raise exception 'Prova de outro participante aceita';exception when sqlstate 'PT403' then null;end;
 result:=public.duuk_sign_verification_backend('prepare',payload);
 if result->>'challenge_id'<>second_challenge::text then raise exception 'Contrato assinado não permite confirmar nova leitura';end if;
 update duuk_private.sign_email_challenges set created_at=now()-interval '61 seconds' where id=second_challenge;
 payload:=payload||jsonb_build_object('client_request_id',gen_random_uuid(),'challenge_id',gen_random_uuid());
 perform public.duuk_sign_verification_backend('prepare',payload);
 perform public.duuk_sign_verification_backend('delivery',jsonb_build_object('digest',protected_digest,'challenge_id',payload->>'challenge_id','sent',false));
 begin perform public.duuk_sign_verification_backend('prepare',payload);raise exception 'Falha SMTP foi reportada como entregue';exception when sqlstate 'PT409' then null;end;
 update duuk_private.sign_email_challenges set created_at=now()-interval '61 seconds' where id=(payload->>'challenge_id')::uuid;
 begin perform public.duuk_sign_verification_backend('prepare',payload||jsonb_build_object('client_request_id',gen_random_uuid(),'challenge_id',gen_random_uuid()));raise exception 'Quarto código em15min aceito';exception when sqlstate 'PT429' then null;end;
 begin perform public.duuk_sign_verification_backend('prepare',payload||jsonb_build_object('digest',additional_digest,'client_request_id',gen_random_uuid(),'challenge_id',gen_random_uuid()));raise exception 'Limite por e-mail contornado com outro convite';exception when sqlstate 'PT429' then null;end;
 update duuk_private.sign_email_challenges set created_at=now()-interval '20 minutes' where invite_id=target_invite;
 for i in 1..30 loop
  insert into duuk_private.sign_email_challenges(id,invite_id,client_request_id,recipient_email,code_hash,status,created_at,expires_at)
   values(gen_random_uuid(),duuk_invite,gen_random_uuid(),email,hash,'failed',now()-interval '55 minutes',now()-interval '45 minutes');
 end loop;
 begin perform public.duuk_sign_verification_backend('prepare',payload||jsonb_build_object('digest',additional_digest,'client_request_id',gen_random_uuid(),'challenge_id',gen_random_uuid()));raise exception 'Limite global ignorado';exception when sqlstate 'PT429' then null;end;
 update public.duuk_contract_invites set revoked_at=now() where id=target_invite;
 begin perform public.duuk_sign_verification_backend('access',jsonb_build_object('digest',protected_digest,'proof_hash',proof_hash));raise exception 'Link revogado manteve acesso';exception when sqlstate 'PT410' then null;end;
 result:=public.duuk_sign_verification_backend('access',jsonb_build_object('digest',legacy_digest));
 if (result->>'required')::boolean then raise exception 'Legado foi bloqueado';end if;
 perform public.duuk_office_sign(legacy_digest,jsonb_build_object('name','Legado','png',repeat('p',120),'values','{}'::jsonb,'consent','aceite','user_agent','fixture'));
 if exists(select 1 from public.duuk_contract_signatures where invite_id=legacy_invite and verification_method is not null) then raise exception 'Legado fabricou evidência';end if;
 update public.duuk_contract_invites set expires_at=now()-interval '1 second' where id=duuk_invite;
 begin perform public.duuk_sign_verification_backend('access',jsonb_build_object('digest',additional_digest));raise exception 'Link expirado manteve acesso';exception when sqlstate 'PT410' then null;end;
 update public.duuk_contract_invites set expires_at=now()+interval '1 day' where id=duuk_invite;
 update public.duuk_contracts set deleted_at=now() where id=target_contract;
 begin perform public.duuk_sign_verification_backend('access',jsonb_build_object('digest',additional_digest));raise exception 'Contrato excluído manteve acesso';exception when sqlstate 'PT410' then null;end;
end $$;
select 'PASS: email signing verification, private grants/RLS, protected new links, legacy links, recipient binding, delivery replay, 60s resend, persisted five attempts, code/proof expiry, revocation, signature evidence and idempotence' as result;
rollback;
