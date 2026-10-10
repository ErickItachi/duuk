-- New signing links require a six-digit code delivered through the connected
-- Titan mailbox. Existing links retain their original seven-day behavior.
alter table public.duuk_contract_invites
 add column verification_required boolean not null default false,
 add column recipient_email text,
 add constraint invite_verified_recipient check(not verification_required or (recipient_email is not null and char_length(recipient_email) between 3 and 254));
alter table public.duuk_contract_signatures
 add column verification_method text check(verification_method is null or verification_method='email_otp'),
 add column verified_email text,
 add column email_verified_at timestamptz,
 add column verification_challenge_id uuid,
 add constraint signature_email_evidence check(
  (verification_method is null and verified_email is null and email_verified_at is null and verification_challenge_id is null)
  or (verification_method is not null and verification_method='email_otp' and verified_email is not null and email_verified_at is not null and verification_challenge_id is not null));

create table duuk_private.sign_email_challenges (
 id uuid primary key,
 invite_id uuid not null references public.duuk_contract_invites(id) on delete cascade,
 client_request_id uuid not null,
 recipient_email text not null,
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','sent','failed','superseded','verified')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 sent_at timestamptz,
 verified_at timestamptz,
 unique(invite_id,client_request_id)
);
create index sign_email_challenges_invite_idx on duuk_private.sign_email_challenges(invite_id,created_at desc);
create index sign_email_challenges_recipient_idx on duuk_private.sign_email_challenges(recipient_email,created_at desc);
create index sign_email_challenges_created_idx on duuk_private.sign_email_challenges(created_at);
create table duuk_private.sign_email_proofs (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 invite_id uuid not null references public.duuk_contract_invites(id) on delete cascade,
 challenge_id uuid not null references duuk_private.sign_email_challenges(id) on delete cascade,
 recipient_email text not null,
 verified_at timestamptz not null,
 expires_at timestamptz not null
);
create index sign_email_proofs_invite_idx on duuk_private.sign_email_proofs(invite_id);
create index sign_email_proofs_challenge_idx on duuk_private.sign_email_proofs(challenge_id);
create index sign_email_proofs_expiry_idx on duuk_private.sign_email_proofs(expires_at);
alter table duuk_private.sign_email_challenges enable row level security;
alter table duuk_private.sign_email_proofs enable row level security;
revoke all on duuk_private.sign_email_challenges,duuk_private.sign_email_proofs from public,anon,authenticated;
grant all on duuk_private.sign_email_challenges,duuk_private.sign_email_proofs to service_role;
create policy sign_email_challenges_service on duuk_private.sign_email_challenges for all to service_role using(true) with check(true);
create policy sign_email_proofs_service on duuk_private.sign_email_proofs for all to service_role using(true) with check(true);
do $$ begin
 if not exists(select 1 from vault.secrets where name='duuk.sign.otp.pepper') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'duuk.sign.otp.pepper');
 end if;
end $$;

create function duuk_private.sign_recipient(value text) returns text
 language plpgsql immutable set search_path='' as $$
declare email text:=lower(btrim(coalesce(value,'')));
begin
 if char_length(email)>254 or email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  or left(email,1)='.' or right(split_part(email,'@',1),1)='.' or position('..' in email)>0 then
  raise exception 'Defina um e-mail válido para este participante antes de gerar o link.' using errcode='PT400';
 end if;
 return email;
end $$;
create function duuk_private.sign_email_hint(value text) returns text
 language sql immutable set search_path='' as $$
 select left(split_part(value,'@',1),1)||'***@'||split_part(value,'@',2);
$$;

create function duuk_private.office_invite(target uuid,side text,digest text,revision bigint,recipient text) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare item public.duuk_contracts; invite public.duuk_contract_invites; email text:=duuk_private.sign_recipient(recipient);
begin
 select * into item from public.duuk_contracts where id=target for update;
 if not found then raise exception 'Contrato não encontrado.' using errcode='PT404'; end if;
 if item.deleted_at is not null then raise exception 'Restaure o contrato antes de continuar.' using errcode='PT409'; end if;
 if item.version<>revision then raise exception 'O contrato mudou. Recarregue antes de gerar o link.' using errcode='PT409'; end if;
 if item.status not in('draft','pending','partial') then raise exception 'Este contrato não aceita novas assinaturas.' using errcode='PT409'; end if;
 if side not in('client','duuk') then raise exception 'Participante inválido.' using errcode='PT400'; end if;
 if not exists(select 1 from jsonb_array_elements(item.fields) f where f->>'party'='client' and f->>'type'='signature')
  or not exists(select 1 from jsonb_array_elements(item.fields) f where f->>'party'='duuk' and f->>'type'='signature') then
  raise exception 'Adicione um campo de assinatura para o cliente e outro para a DUUK.' using errcode='PT400';
 end if;
 if exists(select 1 from public.duuk_contract_signatures where contract_id=target and party=side) then
  raise exception 'Este participante já assinou.' using errcode='PT409';
 end if;
 update public.duuk_contract_invites set revoked_at=now() where contract_id=target and party=side and signed_at is null and revoked_at is null;
 insert into public.duuk_contract_invites(contract_id,party,token_hash,verification_required,recipient_email)
  values(target,side,digest,true,email) returning * into invite;
 update public.duuk_contracts set status=case when status='draft' then 'pending' else status end,version=version+1,updated_at=now() where id=target returning * into item;
 return jsonb_build_object('contract',to_jsonb(item),'expires_at',invite.expires_at,'verification_required',true,'recipient_email',email);
end $$;

-- Cached clients still create protected links, using the existing stored email.
create or replace function duuk_private.office_invite(target uuid,side text,digest text,revision bigint) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare email text;
begin
 select case when side='client' then c.client_email else u.email end into email
  from public.duuk_contracts c left join auth.users u on u.id=c.created_by where c.id=target;
 return duuk_private.office_invite(target,side,digest,revision,email);
end $$;
create function public.duuk_office_invite_verified(target uuid,side text,digest text,revision bigint,recipient text) returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.office_invite(target,side,digest,revision,recipient); $$;

create function duuk_private.sign_email_proof(invitation public.duuk_contract_invites,proof_hash text) returns duuk_private.sign_email_proofs
 language plpgsql stable security invoker set search_path='' as $$
declare proof duuk_private.sign_email_proofs;
begin
 select * into proof from duuk_private.sign_email_proofs p where p.token_hash=proof_hash and p.invite_id=invitation.id
  and p.recipient_email=invitation.recipient_email and p.expires_at>now();
 if proof.token_hash is null then raise exception 'Confirme o código recebido por e-mail para continuar.' using errcode='PT403'; end if;
 return proof;
end $$;

create function duuk_private.sign_verification_backend(operation text,payload jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare invitation public.duuk_contract_invites; item public.duuk_contracts; challenge duuk_private.sign_email_challenges;
 proof duuk_private.sign_email_proofs; target uuid; requested_email text; pepper text; retry_at timestamptz;
begin
 if operation='secrets' then
  select decrypted_secret into pepper from vault.decrypted_secrets where name='duuk.sign.otp.pepper';
  if pepper is null then raise exception 'A confirmação por e-mail aguarda configuração.' using errcode='PT503'; end if;
  return jsonb_build_object('pepper',pepper);
 end if;
 select contract_id into target from public.duuk_contract_invites where token_hash=payload->>'digest';
 if not found then raise exception 'Link inválido.' using errcode='PT404'; end if;
 -- Same lock order as office_sign and office_invite, including delivery callbacks.
 select * into item from public.duuk_contracts where id=target for update;
 select * into invitation from public.duuk_contract_invites where token_hash=payload->>'digest' for update;
 if invitation.revoked_at is not null or invitation.expires_at<=now() or item.status='cancelled' or item.deleted_at is not null then
  raise exception 'Este link expirou ou foi cancelado.' using errcode='PT410';
 end if;
 if operation='access' then
  if not invitation.verification_required then return jsonb_build_object('required',false,'verified',false); end if;
  proof:=duuk_private.sign_email_proof(invitation,payload->>'proof_hash');
  return jsonb_build_object('required',true,'verified',true,'email_hint',duuk_private.sign_email_hint(proof.recipient_email),'email',proof.recipient_email,'verified_at',proof.verified_at,'method','email_otp');
 end if;
 if not invitation.verification_required then raise exception 'Este link não solicita código por e-mail.' using errcode='PT400'; end if;
 if operation='prepare' then
  requested_email:=duuk_private.sign_recipient(payload->>'email');
  if requested_email<>invitation.recipient_email then raise exception 'Informe o e-mail vinculado a este link de assinatura.' using errcode='PT400'; end if;
  if coalesce(payload->>'code_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Solicitação inválida.' using errcode='PT400'; end if;
  select * into challenge from duuk_private.sign_email_challenges where invite_id=invitation.id and client_request_id=(payload->>'client_request_id')::uuid;
  if challenge.id is not null then
   if challenge.status in('sent','verified') and challenge.expires_at>now() then
    return jsonb_build_object('deliver',false,'challenge_id',challenge.id,'expires_at',challenge.expires_at,'retry_at',challenge.created_at+interval '60 seconds','email_hint',duuk_private.sign_email_hint(challenge.recipient_email));
   end if;
   if challenge.status='pending' then raise exception 'O código está sendo enviado. Aguarde um minuto antes de solicitar outro.' using errcode='PT409'; end if;
   raise exception 'Solicite um novo código para continuar.' using errcode='PT409';
  end if;
  -- Serialize limits across links sharing an email and across the free mailbox.
  perform pg_catalog.pg_advisory_xact_lock(1196770635,7301);
  select max(created_at)+interval '60 seconds' into retry_at from duuk_private.sign_email_challenges where invite_id=invitation.id;
  if retry_at>now() then raise exception 'Aguarde um minuto antes de solicitar outro código.' using errcode='PT429'; end if;
  if (select count(*) from duuk_private.sign_email_challenges where invite_id=invitation.id and created_at>now()-interval '15 minutes')>=3
   or (select count(*) from duuk_private.sign_email_challenges where recipient_email=requested_email and created_at>now()-interval '15 minutes')>=3 then
   raise exception 'Limite de códigos atingido. Aguarde 15 minutos para tentar novamente.' using errcode='PT429';
  end if;
  if (select count(*) from duuk_private.sign_email_challenges where created_at>now()-interval '1 hour')>=30 then
   raise exception 'O envio de códigos está temporariamente limitado. Tente novamente mais tarde.' using errcode='PT429';
  end if;
  update duuk_private.sign_email_challenges set status='superseded' where invite_id=invitation.id and status in('pending','sent','verified');
  insert into duuk_private.sign_email_challenges(id,invite_id,client_request_id,recipient_email,code_hash,expires_at)
   values((payload->>'challenge_id')::uuid,invitation.id,(payload->>'client_request_id')::uuid,requested_email,payload->>'code_hash',least(now()+interval '10 minutes',invitation.expires_at)) returning * into challenge;
  return jsonb_build_object('deliver',true,'challenge_id',challenge.id,'expires_at',challenge.expires_at,'retry_at',challenge.created_at+interval '60 seconds','email_hint',duuk_private.sign_email_hint(requested_email),'recipient_email',requested_email);
 elsif operation='delivery' then
  select * into challenge from duuk_private.sign_email_challenges where id=(payload->>'challenge_id')::uuid and invite_id=invitation.id for update;
  if challenge.id is null or challenge.status<>'pending' then raise exception 'Este código não está mais disponível. Solicite outro.' using errcode='PT409'; end if;
  update duuk_private.sign_email_challenges set status=case when payload->>'sent'='true' then 'sent' else 'failed' end,
   sent_at=case when payload->>'sent'='true' then now() else null end where id=challenge.id;
  return '{}'::jsonb;
 elsif operation='verify' then
  if coalesce(payload->>'proof_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Confirmação inválida.' using errcode='PT400'; end if;
  select * into challenge from duuk_private.sign_email_challenges where id=(payload->>'challenge_id')::uuid and invite_id=invitation.id for update;
  if challenge.id is null or challenge.status not in('sent','verified') or challenge.expires_at<=now() then
   return jsonb_build_object('error','Este código expirou ou foi substituído. Solicite um novo.','status',400);
  end if;
  if challenge.attempts>=5 then return jsonb_build_object('error','Limite de tentativas atingido. Solicite um novo código.','status',429); end if;
  if challenge.code_hash is distinct from payload->>'code_hash' then
   -- A returned error commits this counter; raising would roll it back.
   update duuk_private.sign_email_challenges set attempts=attempts+1 where id=challenge.id;
   return jsonb_build_object('error',case when challenge.attempts+1>=5 then 'Limite de tentativas atingido. Solicite um novo código.' else 'Código inválido. Confira os seis dígitos recebidos.' end,'status',case when challenge.attempts+1>=5 then 429 else 400 end);
  end if;
  if (select count(*) from duuk_private.sign_email_proofs where challenge_id=challenge.id)>=10 then
   return jsonb_build_object('error','Este código já foi confirmado várias vezes. Solicite um novo código.','status',429);
  end if;
  update duuk_private.sign_email_challenges set status='verified',verified_at=coalesce(verified_at,now()) where id=challenge.id returning * into challenge;
  insert into duuk_private.sign_email_proofs(token_hash,invite_id,challenge_id,recipient_email,verified_at,expires_at)
   values(payload->>'proof_hash',invitation.id,challenge.id,invitation.recipient_email,challenge.verified_at,least(now()+interval '30 minutes',invitation.expires_at));
  return jsonb_build_object('verified',true,'verified_at',challenge.verified_at,'email',invitation.recipient_email,'email_hint',duuk_private.sign_email_hint(invitation.recipient_email),'method','email_otp');
 else raise exception 'Operação inválida.' using errcode='PT400';
 end if;
end $$;
create function public.duuk_sign_verification_backend(operation text,payload jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select duuk_private.sign_verification_backend(operation,payload); $$;

-- Keep the existing signature transaction, versioning, triggers and Drive queue.
create or replace function duuk_private.office_sign(digest text,payload jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare item public.duuk_contracts; invitation public.duuk_contract_invites; target uuid; proof duuk_private.sign_email_proofs;
begin
 select contract_id into target from public.duuk_contract_invites where token_hash=digest;
 if not found then raise exception 'Link inválido.' using errcode='PT404'; end if;
 select * into item from public.duuk_contracts where id=target for update;
 select * into invitation from public.duuk_contract_invites where token_hash=digest for update;
 if invitation.revoked_at is not null or invitation.expires_at<=now() or item.status='cancelled' or item.deleted_at is not null then
  raise exception 'Este link expirou ou foi cancelado.' using errcode='PT410';
 end if;
 if invitation.verification_required then proof:=duuk_private.sign_email_proof(invitation,payload->>'verification_hash'); end if;
 if invitation.signed_at is null then
  insert into public.duuk_contract_signatures(contract_id,invite_id,party,signer_name,png,field_values,consent,ip_address,user_agent,
   verification_method,verified_email,email_verified_at,verification_challenge_id)
   values(target,invitation.id,invitation.party,payload->>'name',payload->>'png',payload->'values',payload->>'consent',payload->>'ip',left(payload->>'user_agent',300),
    case when invitation.verification_required then 'email_otp' end,proof.recipient_email,proof.verified_at,proof.challenge_id);
  update public.duuk_contract_invites set signed_at=now() where id=invitation.id;
  update public.duuk_contracts set status=case when (select count(*) from public.duuk_contract_signatures where contract_id=target)=2 then 'signed' else 'partial' end,
   version=version+1,updated_at=now() where id=target returning * into item;
 end if;
 return jsonb_build_object('contract',to_jsonb(item),'signatures',coalesce((select jsonb_agg(to_jsonb(s) order by signed_at) from public.duuk_contract_signatures s where contract_id=target),'[]'::jsonb));
end $$;

revoke all on function duuk_private.sign_recipient(text),duuk_private.sign_email_hint(text),duuk_private.sign_email_proof(public.duuk_contract_invites,text),
 duuk_private.office_invite(uuid,text,text,bigint,text),duuk_private.office_invite(uuid,text,text,bigint),duuk_private.office_sign(text,jsonb),
 duuk_private.sign_verification_backend(text,jsonb),public.duuk_sign_verification_backend(text,jsonb),public.duuk_office_invite_verified(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function duuk_private.sign_recipient(text),duuk_private.sign_email_hint(text),duuk_private.sign_email_proof(public.duuk_contract_invites,text),
 duuk_private.office_invite(uuid,text,text,bigint,text),duuk_private.office_invite(uuid,text,text,bigint),duuk_private.office_sign(text,jsonb),
 duuk_private.sign_verification_backend(text,jsonb),public.duuk_sign_verification_backend(text,jsonb),public.duuk_office_invite_verified(uuid,text,text,bigint,text) to service_role;

-- Challenges and proofs contain no plaintext codes. Keep the successful proof
-- reference in the signature evidence while removing expired temporary rows.
select cron.schedule('duuk-sign-verification-retention','25 3 * * *',$job$
 delete from duuk_private.sign_email_proofs where expires_at<now()-interval '1 day';
 delete from duuk_private.sign_email_challenges where created_at<now()-interval '30 days';
$job$);
