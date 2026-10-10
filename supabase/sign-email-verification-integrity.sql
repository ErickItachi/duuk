-- Follow-up for installations created before the NULL-safe evidence check and
-- proof lookup/retention indexes. No credentials or signature records change.
create index if not exists sign_email_proofs_challenge_idx on duuk_private.sign_email_proofs(challenge_id);
create index if not exists sign_email_proofs_expiry_idx on duuk_private.sign_email_proofs(expires_at);
alter table public.duuk_contract_signatures drop constraint signature_email_evidence;
alter table public.duuk_contract_signatures add constraint signature_email_evidence check(
 (verification_method is null and verified_email is null and email_verified_at is null and verification_challenge_id is null)
 or (verification_method is not null and verification_method='email_otp' and verified_email is not null and email_verified_at is not null and verification_challenge_id is not null));
