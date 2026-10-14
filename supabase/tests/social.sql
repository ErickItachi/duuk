-- Social Media (Admin 2.0): synthetic people, files and tokens. No call reaches Instagram and
-- everything is rolled back at the end.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid(); admin2_id uuid := gen_random_uuid(); member_id uuid := gen_random_uuid();
  denied_id uuid := gen_random_uuid(); disabled_id uuid := gen_random_uuid();
  social_role uuid := gen_random_uuid(); plain_role uuid := gen_random_uuid();
  state_hash text := encode(sha256(gen_random_bytes(16)), 'hex'); request_id uuid := gen_random_uuid();
  cfg jsonb; base jsonb; result jsonb; account jsonb; media jsonb; clip jsonb; draft jsonb; post jsonb; later jsonb;
  photo text; video text; secret_id uuid; token_id uuid; version_before bigint; lease uuid; account_id uuid;
begin
  insert into public.duuk_roles(id, name) values (social_role, 'QA Social ' || social_role), (plain_role, 'QA sem Social ' || plain_role);
  insert into public.duuk_role_permissions(role_id, permission, allowed) values (social_role, 'social', true), (social_role, 'audit', true), (plain_role, 'audit', true);
  insert into auth.users(id, email) values (admin_id, admin_id || '@test.invalid'), (admin2_id, admin2_id || '@test.invalid'), (member_id, member_id || '@test.invalid'),
    (denied_id, denied_id || '@test.invalid'), (disabled_id, disabled_id || '@test.invalid');
  insert into public.duuk_profiles(id, name, email, active, is_super_admin, role_id) values
    (admin_id, 'QA Social admin', admin_id || '@test.invalid', true, true, social_role),
    (admin2_id, 'QA Social admin 2', admin2_id || '@test.invalid', true, true, plain_role),
    (member_id, 'QA Social membro', member_id || '@test.invalid', true, false, social_role),
    (denied_id, 'QA sem Social', denied_id || '@test.invalid', true, false, plain_role),
    (disabled_id, 'QA inativo', disabled_id || '@test.invalid', false, true, social_role);

  -- Nothing private reaches the browser roles.
  if has_function_privilege('authenticated', 'public.duuk_social_backend(text,jsonb)', 'execute') or has_function_privilege('anon', 'public.duuk_social_backend(text,jsonb)', 'execute') then raise exception 'Social backend exposed'; end if;
  if has_function_privilege('anon', 'public.duuk_social_post_save(jsonb)', 'execute') or has_function_privilege('anon', 'public.duuk_social_media_register(jsonb)', 'execute') then raise exception 'Anonymous RPC allowed'; end if;
  if has_table_privilege('authenticated', 'duuk_private.social_settings', 'select') or has_table_privilege('authenticated', 'duuk_private.social_tokens', 'select') or has_table_privilege('anon', 'public.duuk_social_posts', 'select') then raise exception 'Private tables exposed'; end if;
  if has_table_privilege('authenticated', 'public.duuk_social_posts', 'insert') or has_table_privilege('authenticated', 'public.duuk_social_posts', 'update') or has_table_privilege('authenticated', 'public.duuk_social_accounts', 'update') or has_table_privilege('authenticated', 'public.duuk_social_media', 'delete') then raise exception 'Direct writes allowed'; end if;
  if exists (select 1 from pg_class where oid in ('public.duuk_social_posts'::regclass, 'public.duuk_social_accounts'::regclass, 'public.duuk_social_media'::regclass, 'public.duuk_social_post_media'::regclass, 'public.duuk_social_events'::regclass, 'public.duuk_social_snapshots'::regclass, 'duuk_private.social_tokens'::regclass, 'duuk_private.social_settings'::regclass) and not relrowsecurity) then raise exception 'Missing RLS'; end if;
  if exists (select 1 from public.duuk_role_permissions where permission = 'social' and role_id <> social_role) then raise exception 'Social granted to an existing group'; end if;
  if (select public from storage.buckets where id = 'duuk-social') then raise exception 'Public bucket'; end if;

  -- App configuration: super administration only, secret in Vault and never in the status.
  cfg := public.duuk_social_backend('status', jsonb_build_object('user_id', member_id));
  if cfg->>'configured' <> 'false' or cfg->>'can_configure' <> 'false' or cfg ? 'app_secret' or cfg->>'app_id' is not null then raise exception 'Initial status incorrect'; end if;
  version_before := (cfg->>'version')::bigint;
  begin perform public.duuk_social_backend('status', jsonb_build_object('user_id', denied_id)); raise exception 'Status without permission'; exception when sqlstate 'PT403' then null; end;
  begin perform public.duuk_social_backend('status', jsonb_build_object('user_id', disabled_id)); raise exception 'Inactive member status'; exception when sqlstate 'PT403' then null; end;
  begin perform public.duuk_social_backend('status', '{}'); raise exception 'Actor-free status'; exception when sqlstate 'PT403' then null; end;
  base := jsonb_build_object('user_id', admin_id, 'expected_version', version_before, 'app_id', '123456789012345', 'app_secret', 'qasecretnotreal0123456789abcdef', 'app_mode', 'development', 'access_level', 'standard');
  begin perform public.duuk_social_backend('configure', jsonb_set(base, '{user_id}', to_jsonb(member_id))); raise exception 'Member configured the app'; exception when sqlstate 'PT403' then null; end;
  begin perform public.duuk_social_backend('configure', jsonb_set(base, '{app_id}', '"abc"')); raise exception 'Invalid app id'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_backend('configure', jsonb_set(base, '{app_secret}', '"short"')); raise exception 'Invalid secret'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_backend('configure', base - 'app_secret'); raise exception 'Missing secret'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_backend('configure', jsonb_set(base, '{access_level}', '"premium"')); raise exception 'Invalid access level'; exception when sqlstate 'PT400' then null; end;
  perform public.duuk_social_backend('configure', base);
  begin perform public.duuk_social_backend('configure', base); raise exception 'Stale configuration overwrite'; exception when sqlstate 'PT409' then null; end;
  cfg := public.duuk_social_backend('status', jsonb_build_object('user_id', admin_id));
  if cfg->>'configured' <> 'true' or cfg->>'app_id' <> '123456789012345' or cfg::text like '%qasecret%' or (cfg->>'version')::bigint <> version_before + 1 or cfg->>'can_configure' <> 'true' then raise exception 'Configured status incorrect'; end if;
  if public.duuk_social_backend('status', jsonb_build_object('user_id', member_id))->>'app_id' is not null then raise exception 'App id shown to a member'; end if;
  select credential_id into secret_id from duuk_private.social_settings where singleton;
  if not exists (select 1 from vault.decrypted_secrets where id = secret_id and decrypted_secret = 'qasecretnotreal0123456789abcdef') then raise exception 'Secret not in Vault'; end if;
  if public.duuk_social_backend('settings')->>'app_secret' <> 'qasecretnotreal0123456789abcdef' then raise exception 'Function cannot read the secret'; end if;
  if not exists (select 1 from public.duuk_audit where actor_id = admin_id and entity = 'duuk_social' and required_permission = 'social') or exists (select 1 from public.duuk_audit where entity = 'duuk_social' and details::text like '%qasecret%') then raise exception 'Configuration audit not private'; end if;
  perform public.duuk_social_backend('configure', (base - 'app_secret') || jsonb_build_object('expected_version', version_before + 1, 'app_mode', 'live'));
  if public.duuk_social_backend('settings')->>'app_secret' <> 'qasecretnotreal0123456789abcdef' or public.duuk_social_backend('settings')->>'app_mode' <> 'live' then raise exception 'Secret lost on mode change'; end if;

  -- OAuth state: bound to who started it, single use; client accounts need Advanced Access.
  begin perform public.duuk_social_backend('oauth_start', jsonb_build_object('user_id', admin_id, 'state_hash', state_hash, 'owner_kind', 'client')); raise exception 'Client account without Advanced Access'; exception when sqlstate 'PT409' then null; end;
  begin perform public.duuk_social_backend('oauth_start', jsonb_build_object('user_id', member_id, 'state_hash', state_hash)); raise exception 'Member started OAuth'; exception when sqlstate 'PT403' then null; end;
  if public.duuk_social_backend('oauth_start', jsonb_build_object('user_id', admin_id, 'state_hash', state_hash))->>'app_id' <> '123456789012345' then raise exception 'OAuth start incorrect'; end if;
  begin perform public.duuk_social_backend('oauth_consume', jsonb_build_object('user_id', admin2_id, 'state_hash', state_hash)); raise exception 'State used by another person'; exception when sqlstate 'PT403' or sqlstate 'PT409' then null; end;
  if public.duuk_social_backend('oauth_consume', jsonb_build_object('user_id', admin_id, 'state_hash', state_hash))->>'owner_kind' <> 'duuk' then raise exception 'OAuth consume incorrect'; end if;
  begin perform public.duuk_social_backend('oauth_consume', jsonb_build_object('user_id', admin_id, 'state_hash', state_hash)); raise exception 'State reused'; exception when sqlstate 'PT409' then null; end;

  -- Connection: token only in Vault, first follower snapshot recorded.
  account := public.duuk_social_backend('connect', jsonb_build_object('user_id', admin_id, 'ig_user_id', '17841400000000001', 'app_scoped_id', '9000000000000001',
    'username', 'duuk.qa', 'name', 'DUUK QA', 'account_type', 'BUSINESS', 'followers_count', 120, 'follows_count', 10, 'media_count', 30,
    'permissions', jsonb_build_array('instagram_business_basic', 'instagram_business_content_publish'), 'token', 'IGQAtokennotreal', 'expires_at', now() + interval '60 days'));
  account_id := (account->>'id')::uuid;
  if account->>'status' <> 'active' or account::text like '%IGQAtoken%' then raise exception 'Connect incorrect'; end if;
  select credential_id into token_id from duuk_private.social_tokens where social_tokens.account_id = (account->>'id')::uuid;
  if not exists (select 1 from vault.decrypted_secrets where id = token_id and decrypted_secret = 'IGQAtokennotreal') then raise exception 'Token not in Vault'; end if;
  if public.duuk_social_backend('token', jsonb_build_object('account_id', account_id))->>'token' <> 'IGQAtokennotreal' then raise exception 'Function cannot read the token'; end if;
  if not exists (select 1 from public.duuk_social_snapshots s where s.account_id = (account->>'id')::uuid and s.followers_count = 120) then raise exception 'Snapshot missing'; end if;
  if public.duuk_social_backend('status', jsonb_build_object('user_id', member_id))::text like '%IGQAtoken%' then raise exception 'Token in status'; end if;
  if public.duuk_social_backend('actor_ok', jsonb_build_object('user_id', denied_id))::boolean or not public.duuk_social_backend('actor_ok', jsonb_build_object('user_id', member_id))::boolean then raise exception 'actor_ok incorrect'; end if;
  if jsonb_array_length(public.duuk_social_backend('active_accounts')) <> 1 or public.duuk_social_backend('active_accounts')::text like '%IGQAtoken%' then raise exception 'Active accounts incorrect'; end if;

  -- Files uploaded by the member (Storage rows written directly only inside this rolled-back test).
  photo := member_id || '/' || gen_random_uuid() || '.jpg';
  video := member_id || '/' || gen_random_uuid() || '.mp4';
  insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
    ('duuk-social', photo, member_id, member_id::text, jsonb_build_object('mimetype', 'image/jpeg', 'size', 204800)),
    ('duuk-social', video, member_id, member_id::text, jsonb_build_object('mimetype', 'video/mp4', 'size', 5242880));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', member_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.duuk_social_backend('status', jsonb_build_object('user_id', member_id)); raise exception 'Browser called the backend'; exception when insufficient_privilege then null; end;
  begin insert into public.duuk_social_posts(account_id, format) values (account_id, 'image'); raise exception 'Direct insert allowed'; exception when insufficient_privilege then null; end;
  begin perform 1 from duuk_private.social_tokens; raise exception 'Tokens readable'; exception when insufficient_privilege then null; end;
  if not exists (select 1 from public.duuk_social_accounts where id = account_id) then raise exception 'Member cannot read accounts'; end if;

  media := public.duuk_social_media_register(jsonb_build_object('storage_path', photo, 'width', 1080, 'height', 1350, 'title', 'Bastidores', 'alt_text', 'Equipe filmando', 'tags', jsonb_build_array('Bastidores', 'bastidores', ' set ', '')));
  if media->>'kind' <> 'image' or (media->>'size_bytes')::bigint <> 204800 or jsonb_array_length(media->'tags') <> 2 then raise exception 'Media register incorrect'; end if;
  if public.duuk_social_media_register(jsonb_build_object('storage_path', photo))->>'id' <> media->>'id' then raise exception 'Register retry duplicated'; end if;
  clip := public.duuk_social_media_register(jsonb_build_object('storage_path', video, 'width', 1080, 'height', 1920, 'duration_ms', 15000, 'alt_text', 'ignored for video'));
  if clip->>'kind' <> 'video' or clip->>'alt_text' <> '' then raise exception 'Video register incorrect'; end if;
  begin perform public.duuk_social_media_register(jsonb_build_object('storage_path', admin_id || '/' || gen_random_uuid() || '.jpg')); raise exception 'Other folder accepted'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_media_register(jsonb_build_object('storage_path', member_id || '/' || gen_random_uuid() || '.jpg')); raise exception 'Missing file accepted'; exception when sqlstate 'PT404' then null; end;
  begin perform public.duuk_social_media_update(jsonb_build_object('id', media->>'id', 'expected_version', 99, 'title', 'x')); raise exception 'Stale media update'; exception when sqlstate 'PT409' then null; end;
  media := public.duuk_social_media_update(jsonb_build_object('id', media->>'id', 'expected_version', media->>'version', 'title', 'Bastidores do set'));
  if media->>'title' <> 'Bastidores do set' then raise exception 'Media update incorrect'; end if;

  draft := public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'caption', 'Novo filme #duuk com @parceiro',
    'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id', 'alt_text', 'Equipe filmando')), 'client_request_id', request_id));
  if draft->>'status' <> 'draft' or jsonb_array_length(draft->'media') <> 1 or draft ? 'lease_token' or draft->'media'->0->>'alt_text' <> 'Equipe filmando' then raise exception 'Draft incorrect'; end if;
  if public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')), 'client_request_id', request_id))->>'id' <> draft->>'id' then raise exception 'Retry duplicated the draft'; end if;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'story', 'account_id', account_id, 'caption', 'Oi', 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Story caption accepted'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'carousel', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'One-item carousel'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'reel', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Reel with image'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'reel', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', clip->>'id', 'alt_text', 'x')))); raise exception 'Alt text on video'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'caption', (select string_agg('#tag' || n, ' ') from generate_series(1, 31) n), 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception '31 hashtags accepted'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'intent', 'schedule', 'scheduled_at', now() + interval '20 seconds', 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Schedule too soon'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'intent', 'publish', 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Unknown intent'; exception when sqlstate 'PT400' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('id', draft->>'id', 'expected_version', 99, 'format', 'image', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Stale post save'; exception when sqlstate 'PT409' then null; end;
  post := public.duuk_social_post_save(jsonb_build_object('id', draft->>'id', 'expected_version', draft->>'version', 'intent', 'schedule', 'scheduled_at', now() + interval '10 minutes',
    'format', 'image', 'account_id', account_id, 'caption', draft->>'caption', 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id', 'alt_text', 'Equipe filmando'))));
  if post->>'status' <> 'scheduled' or (post->>'scheduled_by')::uuid <> member_id then raise exception 'Schedule incorrect'; end if;
  begin perform public.duuk_social_media_delete((media->>'id')::uuid, (media->>'version')::bigint); raise exception 'Deleted media in use'; exception when sqlstate 'PT409' then null; end;
  later := public.duuk_social_post_save(jsonb_build_object('format', 'reel', 'account_id', account_id, 'caption', 'Making of', 'intent', 'schedule', 'scheduled_at', now() + interval '2 days',
    'media', jsonb_build_array(jsonb_build_object('media_id', clip->>'id'))));
  later := public.duuk_social_post_unschedule((later->>'id')::uuid, (later->>'version')::bigint);
  if later->>'status' <> 'draft' then raise exception 'Unschedule incorrect'; end if;
  later := public.duuk_social_post_save(jsonb_build_object('id', later->>'id', 'expected_version', later->>'version', 'format', 'reel', 'account_id', account_id, 'caption', 'Making of', 'intent', 'schedule', 'scheduled_at', now() + interval '2 days',
    'media', jsonb_build_array(jsonb_build_object('media_id', clip->>'id'))));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', denied_id, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.duuk_social_posts) or exists (select 1 from public.duuk_social_accounts) or exists (select 1 from public.duuk_social_media) then raise exception 'Social rows visible without permission'; end if;
  begin perform public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Post saved without permission'; exception when sqlstate 'PT403' then null; end;
  execute 'reset role';

  -- Scheduled publication: claimed once, under a lease, by the backend.
  update public.duuk_social_posts set scheduled_at = now() - interval '1 minute' where id = (post->>'id')::uuid;
  result := public.duuk_social_backend('claim_due', '{}');
  if jsonb_array_length(result) <> 1 or result->0->>'status' <> 'publishing' or result->0->>'lease_token' is null or (result->0->>'publish_requested_by')::uuid <> member_id or jsonb_array_length(result->0->'media') <> 1 then raise exception 'Claim incorrect: %', result; end if;
  lease := (result->0->>'lease_token')::uuid;
  if jsonb_array_length(public.duuk_social_backend('claim_due', '{}')) <> 0 then raise exception 'Leased post claimed twice'; end if;
  begin perform public.duuk_social_backend('progress', jsonb_build_object('post_id', post->>'id', 'lease_token', gen_random_uuid(), 'patch', jsonb_build_object('status', 'failed'))); raise exception 'Progress without lease'; exception when sqlstate 'PT409' then null; end;
  result := public.duuk_social_backend('progress', jsonb_build_object('post_id', post->>'id', 'lease_token', lease, 'patch', jsonb_build_object('ig_container_id', '17900000000000001', 'processing_started_at', now()),
    'items', jsonb_build_array(jsonb_build_object('position', 0, 'ig_container_id', '17900000000000002'))));
  if result->>'ig_container_id' <> '17900000000000001' or result->'media'->0->>'ig_container_id' <> '17900000000000002' then raise exception 'Progress not saved'; end if;
  result := public.duuk_social_backend('progress', jsonb_build_object('post_id', post->>'id', 'lease_token', lease, 'release', true, 'notify', true,
    'patch', jsonb_build_object('status', 'published', 'published_at', now(), 'ig_media_id', '17900000000000003', 'permalink', 'https://www.instagram.com/p/QA123/'),
    'event', jsonb_build_object('kind', 'published', 'message', 'Publicado no Instagram')));
  if result->>'status' <> 'published' or (select lease_token from public.duuk_social_posts where id = (post->>'id')::uuid) is not null then raise exception 'Publish not recorded'; end if;
  if not exists (select 1 from public.duuk_notifications where user_id = member_id and required_permission = 'social' and link = '/admin/social/calendario?post=' || (post->>'id')) then raise exception 'Requester not notified'; end if;
  if exists (select 1 from public.duuk_notifications where user_id <> member_id and link = '/admin/social/calendario?post=' || (post->>'id')) then raise exception 'Someone else notified'; end if;
  if not exists (select 1 from public.duuk_audit where entity = 'duuk_social' and action = 'create' and entity_id = post->>'id' and required_permission = 'social') then raise exception 'Publish audit missing'; end if;
  if not exists (select 1 from public.duuk_social_events where post_id = (post->>'id')::uuid and kind = 'published') then raise exception 'Publish event missing'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', member_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.duuk_social_post_delete((post->>'id')::uuid, (result->>'version')::bigint); raise exception 'Published post deleted'; exception when sqlstate 'PT409' then null; end;
  begin perform public.duuk_social_post_save(jsonb_build_object('id', post->>'id', 'expected_version', result->>'version', 'format', 'image', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id')))); raise exception 'Published post edited'; exception when sqlstate 'PT409' then null; end;
  draft := public.duuk_social_post_save(jsonb_build_object('format', 'image', 'account_id', account_id, 'media', jsonb_build_array(jsonb_build_object('media_id', media->>'id'))));
  execute 'reset role';

  -- Publish now: explicit request of a member with permission, never twice.
  begin perform public.duuk_social_backend('claim_now', jsonb_build_object('user_id', denied_id, 'post_id', draft->>'id', 'expected_version', draft->>'version')); raise exception 'Publish without permission'; exception when sqlstate 'PT403' then null; end;
  result := public.duuk_social_backend('claim_now', jsonb_build_object('user_id', member_id, 'post_id', draft->>'id', 'expected_version', draft->>'version'));
  if result->>'status' <> 'publishing' or result->>'lease_token' is null or (result->>'publish_requested_by')::uuid <> member_id then raise exception 'Publish now incorrect'; end if;
  begin perform public.duuk_social_backend('claim_now', jsonb_build_object('user_id', member_id, 'post_id', draft->>'id', 'expected_version', result->>'version')); raise exception 'Double publish'; exception when sqlstate 'PT409' then null; end;
  begin perform public.duuk_social_backend('disconnect', jsonb_build_object('user_id', admin_id, 'account_id', account_id, 'expected_version', (select version from public.duuk_social_accounts where id = account_id))); raise exception 'Disconnect during publishing'; exception when sqlstate 'PT409' then null; end;
  perform public.duuk_social_backend('progress', jsonb_build_object('post_id', draft->>'id', 'lease_token', result->>'lease_token', 'release', true, 'notify', true,
    'patch', jsonb_build_object('status', 'failed', 'last_error', 'A imagem precisa estar em JPEG.', 'last_error_code', 'media')));
  if not exists (select 1 from public.duuk_notifications where user_id = member_id and title = 'Não foi possível publicar no Instagram') then raise exception 'Failure not notified'; end if;

  -- Token renewal, cache and account problems.
  perform public.duuk_social_backend('token_update', jsonb_build_object('account_id', account_id, 'token', 'IGQArefreshednotreal', 'expires_at', now() + interval '60 days'));
  if public.duuk_social_backend('token', jsonb_build_object('account_id', account_id))->>'token' <> 'IGQArefreshednotreal' then raise exception 'Token not renewed'; end if;
  perform public.duuk_social_backend('cache_put', jsonb_build_object('account_id', account_id, 'scope', 'account', 'key', 'd30', 'value', jsonb_build_object('reach', 10)));
  if public.duuk_social_backend('cache_get', jsonb_build_object('account_id', account_id, 'scope', 'account', 'key', 'd30', 'max_age', 60))->>'reach' <> '10' then raise exception 'Cache incorrect'; end if;
  perform public.duuk_social_backend('account_update', jsonb_build_object('account_id', account_id, 'followers_count', 125, 'media_count', 31));
  if (select followers_count from public.duuk_social_snapshots s where s.account_id = (account->>'id')::uuid order by day desc limit 1) <> 125 then raise exception 'Snapshot not updated'; end if;
  perform public.duuk_social_backend('account_problem', jsonb_build_object('account_id', account_id, 'status', 'expired', 'message', 'A autorização expirou.'));
  if (select status from public.duuk_social_accounts where id = account_id) <> 'expired' then raise exception 'Account problem not saved'; end if;
  if not exists (select 1 from public.duuk_notifications where user_id = admin_id and link = '/admin/social/conexao') or exists (select 1 from public.duuk_notifications where user_id = denied_id and required_permission = 'social') then raise exception 'Account problem notification incorrect'; end if;

  -- Disconnect: scheduled posts go back to draft, token removed, history kept.
  begin perform public.duuk_social_backend('disconnect', jsonb_build_object('user_id', member_id, 'account_id', account_id, 'expected_version', (select version from public.duuk_social_accounts where id = account_id))); raise exception 'Member disconnected'; exception when sqlstate 'PT403' then null; end;
  result := public.duuk_social_backend('disconnect', jsonb_build_object('user_id', admin_id, 'account_id', account_id, 'expected_version', (select version from public.duuk_social_accounts where id = account_id)));
  if (result->>'unscheduled_posts')::integer <> 1 or (select status from public.duuk_social_posts where id = (later->>'id')::uuid) <> 'draft' then raise exception 'Disconnect kept the schedule'; end if;
  if exists (select 1 from vault.secrets where id = token_id) or exists (select 1 from duuk_private.social_tokens t where t.account_id = (account->>'id')::uuid) then raise exception 'Disconnect kept the token'; end if;
  if (select status from public.duuk_social_posts where id = (post->>'id')::uuid) <> 'published' then raise exception 'History changed'; end if;

  -- Meta callbacks: reconnect, then deauthorize and data deletion by the account owner.
  account := public.duuk_social_backend('connect', jsonb_build_object('user_id', admin_id, 'ig_user_id', '17841400000000001', 'app_scoped_id', '9000000000000001', 'username', 'duuk.qa', 'token', 'IGQAtoken2notreal', 'expires_at', now() + interval '60 days'));
  if account->>'status' <> 'active' then raise exception 'Reconnect incorrect'; end if;
  begin perform public.duuk_social_backend('unconfigure', jsonb_build_object('user_id', admin_id, 'expected_version', version_before + 2)); raise exception 'App removed with an active account'; exception when sqlstate 'PT409' then null; end;
  perform public.duuk_social_backend('deauthorize', jsonb_build_object('ig_user_id', '9000000000000001'));
  if (select status from public.duuk_social_accounts where id = account_id) <> 'revoked' or exists (select 1 from duuk_private.social_tokens t where t.account_id = (account->>'id')::uuid) then raise exception 'Deauthorize incorrect'; end if;
  perform public.duuk_social_backend('data_deletion', jsonb_build_object('ig_user_id', '17841400000000001', 'code', md5('qa')));
  if exists (select 1 from public.duuk_social_snapshots s where s.account_id = (account->>'id')::uuid) or public.duuk_social_backend('deletion_status', jsonb_build_object('code', md5('qa')))->>'completed_at' is null then raise exception 'Data deletion incorrect'; end if;

  -- Removing the app: blocked while an account is active, then the secret is deleted.
  perform public.duuk_social_backend('unconfigure', jsonb_build_object('user_id', admin_id, 'expected_version', version_before + 2));
  if exists (select 1 from vault.secrets where id = secret_id) or public.duuk_social_backend('status', jsonb_build_object('user_id', admin_id))->>'configured' <> 'false' then raise exception 'Unconfigure kept the secret'; end if;
end;
$$;
rollback;
