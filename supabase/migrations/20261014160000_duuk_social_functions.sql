-- DUUK Social Media (Admin 2.0), part 2: functions, RPCs and scheduling.
-- Applied after 20261014151930_duuk_social.sql; reverted by supabase/rollbacks/20261014151930_duuk_social_down.sql.

create function duuk_private.social_post_json(target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select (to_jsonb(p) - 'lease_token') || jsonb_build_object('media', coalesce((
    select jsonb_agg(jsonb_build_object('position', pm.position, 'media_id', pm.media_id, 'alt_text', pm.alt_text, 'ig_container_id', pm.ig_container_id,
      'kind', m.kind, 'mime_type', m.mime_type, 'storage_path', m.storage_path, 'poster_path', m.poster_path, 'width', m.width, 'height', m.height,
      'duration_ms', m.duration_ms, 'size_bytes', m.size_bytes) order by pm.position)
    from public.duuk_social_post_media pm left join public.duuk_social_media m on m.id = pm.media_id where pm.post_id = p.id), '[]'::jsonb))
  from public.duuk_social_posts p where p.id = target
$$;
revoke all on function duuk_private.social_post_json(uuid) from public, anon, authenticated;

create function duuk_private.social_caption_counts(caption text, out hashtags integer, out mentions integer)
language sql immutable set search_path = '' as $$
  select (select count(*)::integer from regexp_matches(coalesce(caption, ''), '(^|[^[:alnum:]_&#])#[[:alnum:]_]+', 'g')),
         (select count(*)::integer from regexp_matches(coalesce(caption, ''), '(^|[^[:alnum:]_@.])@[[:alnum:]_.]+', 'g'))
$$;
revoke all on function duuk_private.social_caption_counts(text) from public, anon, authenticated;

create function duuk_private.social_actor_name(actor uuid) returns text
language sql stable security definer set search_path = '' as $$ select coalesce((select name from public.duuk_profiles where id = actor), 'Sistema DUUK') $$;
revoke all on function duuk_private.social_actor_name(uuid) from public, anon, authenticated;

-- Library ---------------------------------------------------------------------------------------
create function public.duuk_social_media_register(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  path text := payload->>'storage_path';
  poster text := nullif(payload->>'poster_path', '');
  file_mime text; file_size bigint; poster_mime text; media_kind text;
  saved public.duuk_social_media;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  if path is null or path !~ ('^' || actor::text || '/[0-9a-f-]{36}\.(jpg|mp4|mov)$') then raise exception 'Arquivo inválido. Envie novamente.' using errcode = 'PT400'; end if;
  select o.metadata->>'mimetype', (o.metadata->>'size')::bigint into file_mime, file_size from storage.objects o where o.bucket_id = 'duuk-social' and o.name = path;
  if not found then raise exception 'O arquivo ainda não terminou de enviar. Tente novamente.' using errcode = 'PT404'; end if;
  media_kind := case file_mime when 'image/jpeg' then 'image' when 'video/mp4' then 'video' when 'video/quicktime' then 'video' end;
  if media_kind is null then raise exception 'Envie imagens JPEG ou vídeos MP4/MOV.' using errcode = 'PT400'; end if;
  if poster is not null then
    if media_kind <> 'video' or poster !~ ('^' || actor::text || '/[0-9a-f-]{36}\.jpg$') then raise exception 'Capa inválida.' using errcode = 'PT400'; end if;
    select o.metadata->>'mimetype' into poster_mime from storage.objects o where o.bucket_id = 'duuk-social' and o.name = poster;
    if poster_mime is distinct from 'image/jpeg' then raise exception 'A capa do vídeo não foi enviada.' using errcode = 'PT400'; end if;
  end if;
  insert into public.duuk_social_media(storage_path, poster_path, kind, mime_type, size_bytes, width, height, duration_ms, title, alt_text, tags, uploaded_by)
  values (path, poster, media_kind, file_mime, file_size,
    nullif(payload->>'width', '')::integer, nullif(payload->>'height', '')::integer, nullif(payload->>'duration_ms', '')::integer,
    left(trim(coalesce(payload->>'title', '')), 160), case when media_kind = 'image' then left(trim(coalesce(payload->>'alt_text', '')), 1000) else '' end,
    coalesce((select array_agg(distinct left(lower(trim(tag)), 40)) from jsonb_array_elements_text(coalesce(payload->'tags', '[]'::jsonb)) tag where trim(tag) <> ''), '{}'),
    actor)
  on conflict (storage_path) do nothing
  returning * into saved;
  if saved.id is null then select * into saved from public.duuk_social_media where storage_path = path; end if;
  return to_jsonb(saved);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'Confira os dados da mídia.' using errcode = 'PT400';
end;
$$;

create function public.duuk_social_media_update(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); saved public.duuk_social_media;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  update public.duuk_social_media set
    title = left(trim(coalesce(payload->>'title', title)), 160),
    alt_text = case when kind = 'image' then left(trim(coalesce(payload->>'alt_text', alt_text)), 1000) else '' end,
    tags = case when payload ? 'tags' then coalesce((select array_agg(distinct left(lower(trim(tag)), 40)) from jsonb_array_elements_text(payload->'tags') tag where trim(tag) <> ''), '{}') else tags end
  where id = (payload->>'id')::uuid and version = (payload->>'expected_version')::bigint
  returning * into saved;
  if saved.id is null then
    if exists (select 1 from public.duuk_social_media where id = (payload->>'id')::uuid) then raise exception 'Esta mídia mudou em outra tela. Atualize a biblioteca.' using errcode = 'PT409'; end if;
    raise exception 'Mídia não encontrada.' using errcode = 'PT404';
  end if;
  return to_jsonb(saved);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'Confira os dados da mídia.' using errcode = 'PT400';
end;
$$;

-- Removes the library entry and returns the file paths for the browser to delete from Storage.
create function public.duuk_social_media_delete(media_id uuid, expected_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.duuk_social_media; pending integer;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  select * into target from public.duuk_social_media where id = media_id for update;
  if not found then raise exception 'Mídia não encontrada.' using errcode = 'PT404'; end if;
  if target.version <> expected_version then raise exception 'Esta mídia mudou em outra tela. Atualize a biblioteca.' using errcode = 'PT409'; end if;
  select count(distinct p.id) into pending from public.duuk_social_post_media pm join public.duuk_social_posts p on p.id = pm.post_id
  where pm.media_id = target.id and p.status in ('draft', 'scheduled', 'publishing', 'failed');
  if pending > 0 then raise exception 'Esta mídia está em % publicação(ões) ainda não enviada(s). Retire-a delas antes de excluir.', pending using errcode = 'PT409'; end if;
  delete from public.duuk_social_media where id = target.id;
  return jsonb_build_object('paths', to_jsonb(array_remove(array[target.storage_path, target.poster_path], null)));
end;
$$;

-- Posts -----------------------------------------------------------------------------------------
create function public.duuk_social_post_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  intent text := coalesce(payload->>'intent', 'draft');
  post_format text := payload->>'format';
  post_caption text := coalesce(payload->>'caption', '');
  items jsonb := coalesce(payload->'media', '[]'::jsonb);
  planned timestamptz := nullif(payload->>'scheduled_at', '')::timestamptz;
  request_id uuid := nullif(payload->>'client_request_id', '')::uuid;
  target public.duuk_social_posts;
  account public.duuk_social_accounts;
  item jsonb; picked public.duuk_social_media; counts record; item_total integer;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  if intent not in ('draft', 'schedule') then raise exception 'Ação inválida.' using errcode = 'PT400'; end if;
  if post_format is null or post_format not in ('image', 'carousel', 'reel', 'story') then raise exception 'Escolha o formato da publicação.' using errcode = 'PT400'; end if;
  if jsonb_typeof(items) <> 'array' then raise exception 'Escolha as mídias da publicação.' using errcode = 'PT400'; end if;
  select * into account from public.duuk_social_accounts where id = nullif(payload->>'account_id', '')::uuid;
  if not found then raise exception 'Escolha uma conta do Instagram conectada.' using errcode = 'PT400'; end if;
  item_total := jsonb_array_length(items);
  if (post_format in ('image', 'reel', 'story') and item_total <> 1) or (post_format = 'carousel' and item_total not between 2 and 10) then
    raise exception '%', case when post_format = 'carousel' then 'Carrossel precisa de 2 a 10 mídias.' else 'Escolha exatamente 1 mídia para este formato.' end using errcode = 'PT400';
  end if;
  if char_length(post_caption) > 2200 then raise exception 'A legenda passa de 2.200 caracteres.' using errcode = 'PT400'; end if;
  if post_format = 'story' and char_length(trim(post_caption)) > 0 then raise exception 'Stories publicados pela API não aceitam legenda.' using errcode = 'PT400'; end if;
  counts := duuk_private.social_caption_counts(post_caption);
  if counts.hashtags > 30 then raise exception 'Use até 30 hashtags.' using errcode = 'PT400'; end if;
  if counts.mentions > 20 then raise exception 'Use até 20 menções.' using errcode = 'PT400'; end if;
  if planned is not null and (planned < now() - interval '2 years' or planned > now() + interval '2 years') then raise exception 'Confira a data planejada.' using errcode = 'PT400'; end if;
  if intent = 'schedule' then
    if account.status <> 'active' then raise exception 'A conta @% precisa ser reconectada antes de agendar.', account.username using errcode = 'PT409'; end if;
    if account.owner_kind = 'client' and (select access_level from duuk_private.social_settings where singleton) <> 'advanced' then
      raise exception 'Contas de clientes dependem do Acesso Avançado aprovado pela Meta.' using errcode = 'PT409';
    end if;
    if planned is null or planned < now() + interval '1 minute' or planned > now() + interval '366 days' then
      raise exception 'Escolha um horário entre 1 minuto e 1 ano à frente.' using errcode = 'PT400';
    end if;
  end if;
  for item in select value from jsonb_array_elements(items) loop
    select * into picked from public.duuk_social_media where id = nullif(item->>'media_id', '')::uuid;
    if not found then raise exception 'Uma das mídias não está mais na biblioteca.' using errcode = 'PT400'; end if;
    if (post_format = 'image' and picked.kind <> 'image') or (post_format = 'reel' and picked.kind <> 'video') then
      raise exception '%', case when post_format = 'reel' then 'Reels aceitam somente vídeo.' else 'Foto aceita somente imagem.' end using errcode = 'PT400';
    end if;
    if char_length(coalesce(item->>'alt_text', '')) > 1000 then raise exception 'O texto alternativo pode ter até 1.000 caracteres.' using errcode = 'PT400'; end if;
    if coalesce(item->>'alt_text', '') <> '' and (picked.kind <> 'image' or post_format not in ('image', 'carousel')) then
      raise exception 'Texto alternativo vale somente para imagens de foto ou carrossel.' using errcode = 'PT400';
    end if;
  end loop;

  if nullif(payload->>'id', '') is not null then
    select * into target from public.duuk_social_posts where id = (payload->>'id')::uuid for update;
    if not found then raise exception 'Publicação não encontrada.' using errcode = 'PT404'; end if;
    if target.version is distinct from (payload->>'expected_version')::bigint then raise exception 'Esta publicação mudou em outra tela. Atualize antes de salvar.' using errcode = 'PT409'; end if;
    if target.status in ('publishing', 'published') then raise exception 'Publicações enviadas ou em envio não podem ser editadas.' using errcode = 'PT409'; end if;
    update public.duuk_social_posts set account_id = account.id, format = post_format, caption = post_caption,
      share_to_feed = coalesce((payload->>'share_to_feed')::boolean, true), thumb_offset_ms = nullif(payload->>'thumb_offset_ms', '')::integer,
      status = case when intent = 'schedule' then 'scheduled' else 'draft' end, scheduled_at = planned,
      scheduled_by = case when intent = 'schedule' then actor end, publish_requested_by = null, updated_by = actor,
      ig_container_id = null, processing_started_at = null, publish_attempted_at = null, attempts = 0, next_attempt_at = null,
      last_error = null, last_error_code = null, lease_token = null, lease_until = null
    where id = target.id returning * into target;
    delete from public.duuk_social_post_media where post_id = target.id;
  else
    if request_id is not null then
      select * into target from public.duuk_social_posts where client_request_id = request_id;
      if found then return duuk_private.social_post_json(target.id); end if;
    end if;
    insert into public.duuk_social_posts(account_id, format, caption, share_to_feed, thumb_offset_ms, status, scheduled_at, scheduled_by, client_request_id, created_by, updated_by)
    values (account.id, post_format, post_caption, coalesce((payload->>'share_to_feed')::boolean, true), nullif(payload->>'thumb_offset_ms', '')::integer,
      case when intent = 'schedule' then 'scheduled' else 'draft' end, planned, case when intent = 'schedule' then actor end, request_id, actor, actor)
    returning * into target;
  end if;
  insert into public.duuk_social_post_media(post_id, position, media_id, alt_text)
  select target.id, (entry.ordinality - 1)::smallint, (entry.value->>'media_id')::uuid, left(coalesce(entry.value->>'alt_text', ''), 1000)
  from jsonb_array_elements(items) with ordinality as entry(value, ordinality);
  insert into public.duuk_social_events(post_id, account_id, kind, message, actor_id)
  values (target.id, account.id, case when intent = 'schedule' then 'scheduled' else 'saved' end,
    case when intent = 'schedule' then 'Agendada para ' || to_char(planned at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') else 'Rascunho salvo' end, actor);
  if intent = 'schedule' then
    insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
    values (actor, duuk_private.social_actor_name(actor), 'update', 'duuk_social', target.id::text, 'Publicação agendada no Instagram @' || account.username,
      jsonb_build_object('format', post_format, 'scheduled_at', planned), 'social');
  end if;
  return duuk_private.social_post_json(target.id);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
  raise exception 'Confira os dados da publicação.' using errcode = 'PT400';
end;
$$;

create function public.duuk_social_post_unschedule(post_id uuid, expected_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.duuk_social_posts;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  select * into target from public.duuk_social_posts where id = post_id for update;
  if not found then raise exception 'Publicação não encontrada.' using errcode = 'PT404'; end if;
  if target.version <> expected_version then raise exception 'Esta publicação mudou em outra tela. Atualize antes de continuar.' using errcode = 'PT409'; end if;
  if target.status <> 'scheduled' then raise exception 'Somente publicações agendadas podem voltar para rascunho.' using errcode = 'PT409'; end if;
  update public.duuk_social_posts set status = 'draft', scheduled_by = null, updated_by = actor where id = target.id;
  insert into public.duuk_social_events(post_id, account_id, kind, message, actor_id) values (target.id, target.account_id, 'unscheduled', 'Agendamento cancelado; voltou para rascunho', actor);
  insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
  values (actor, duuk_private.social_actor_name(actor), 'update', 'duuk_social', target.id::text, 'Agendamento de publicação cancelado', '{}'::jsonb, 'social');
  return duuk_private.social_post_json(target.id);
end;
$$;

create function public.duuk_social_post_delete(post_id uuid, expected_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.duuk_social_posts;
begin
  if actor is null or not duuk_private.has_permission('social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  select * into target from public.duuk_social_posts where id = post_id for update;
  if not found then raise exception 'Publicação não encontrada.' using errcode = 'PT404'; end if;
  if target.version <> expected_version then raise exception 'Esta publicação mudou em outra tela. Atualize antes de continuar.' using errcode = 'PT409'; end if;
  if target.status in ('publishing', 'published') then raise exception 'Publicações enviadas ou em envio ficam no histórico.' using errcode = 'PT409'; end if;
  delete from public.duuk_social_posts where id = target.id;
  insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
  values (actor, duuk_private.social_actor_name(actor), 'delete', 'duuk_social', target.id::text, 'Publicação não enviada excluída', jsonb_build_object('status', target.status, 'format', target.format), 'social');
  return jsonb_build_object('deleted', true);
end;
$$;

-- Server-only operations used by the duuk-social Edge Function (service_role). ------------------
create function public.duuk_social_backend(operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := nullif(payload->>'user_id', '')::uuid;
  cfg duuk_private.social_settings;
  account public.duuk_social_accounts;
  token_row duuk_private.social_tokens;
  pending duuk_private.social_oauth_states;
  target public.duuk_social_posts;
  secret uuid; result jsonb; affected integer; post_patch jsonb; item jsonb;
  is_admin boolean := false;
begin
  if actor is not null then
    select p.active and p.is_super_admin into is_admin from public.duuk_profiles p where p.id = actor;
    is_admin := coalesce(is_admin, false);
  end if;
  select * into cfg from duuk_private.social_settings where singleton;

  -- Reads for the function itself (no actor): app credentials and account tokens.
  if operation = 'settings' then
    return jsonb_build_object('configured', cfg.app_id is not null and cfg.credential_id is not null, 'app_id', cfg.app_id,
      'app_secret', (select decrypted_secret from vault.decrypted_secrets where id = cfg.credential_id), 'access_level', cfg.access_level, 'app_mode', cfg.app_mode);
  end if;
  if operation = 'token' then
    select * into account from public.duuk_social_accounts where id = (payload->>'account_id')::uuid;
    if not found then raise exception 'Conta do Instagram não encontrada.' using errcode = 'PT404'; end if;
    select * into token_row from duuk_private.social_tokens where account_id = account.id;
    return jsonb_build_object('account_id', account.id, 'status', account.status, 'username', account.username, 'owner_kind', account.owner_kind,
      'token', (select decrypted_secret from vault.decrypted_secrets where id = token_row.credential_id),
      'issued_at', token_row.issued_at, 'refreshed_at', token_row.refreshed_at, 'expires_at', token_row.expires_at);
  end if;
  if operation = 'actor_ok' then
    return to_jsonb(actor is not null and duuk_private.member_permission(actor, 'social'));
  end if;
  if operation = 'active_accounts' then
    return coalesce((select jsonb_agg(jsonb_build_object('account_id', a.id, 'username', a.username, 'issued_at', t.issued_at, 'refreshed_at', t.refreshed_at, 'expires_at', t.expires_at))
      from public.duuk_social_accounts a join duuk_private.social_tokens t on t.account_id = a.id where a.status = 'active'), '[]'::jsonb);
  end if;
  if operation = 'claim_due' then
    with due as (
      select p.id from public.duuk_social_posts p
      where ((p.status = 'scheduled' and p.scheduled_at <= now()) or (p.status = 'publishing' and coalesce(p.next_attempt_at, p.updated_at) <= now()))
        and (p.lease_until is null or p.lease_until < now())
      order by coalesce(p.next_attempt_at, p.scheduled_at)
      limit greatest(1, least(10, coalesce((payload->>'limit')::integer, 5)))
      for update of p skip locked
    ), claimed as (
      update public.duuk_social_posts p set status = 'publishing', lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes',
        publish_requested_by = coalesce(p.publish_requested_by, p.scheduled_by)
      from due where p.id = due.id
      returning p.id, p.lease_token
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', claimed.id, 'lease_token', claimed.lease_token)), '[]'::jsonb) into result from claimed;
    -- A separate statement, so the JSON reflects the claim made above.
    return coalesce((select jsonb_agg(duuk_private.social_post_json((c->>'id')::uuid) || jsonb_build_object('lease_token', c->>'lease_token'))
      from jsonb_array_elements(result) c), '[]'::jsonb);
  end if;
  if operation = 'progress' then
    select * into target from public.duuk_social_posts where id = (payload->>'post_id')::uuid for update;
    if not found or target.lease_token is distinct from (payload->>'lease_token')::uuid then raise exception 'Esta publicação está sendo processada em outra execução.' using errcode = 'PT409'; end if;
    post_patch := coalesce(payload->'patch', '{}'::jsonb);
    update public.duuk_social_posts set
      status = coalesce(post_patch->>'status', status),
      ig_container_id = case when post_patch ? 'ig_container_id' then post_patch->>'ig_container_id' else ig_container_id end,
      processing_started_at = case when post_patch ? 'processing_started_at' then (post_patch->>'processing_started_at')::timestamptz else processing_started_at end,
      publish_attempted_at = case when post_patch ? 'publish_attempted_at' then (post_patch->>'publish_attempted_at')::timestamptz else publish_attempted_at end,
      attempts = coalesce((post_patch->>'attempts')::integer, attempts),
      next_attempt_at = case when post_patch ? 'next_attempt_at' then (post_patch->>'next_attempt_at')::timestamptz else next_attempt_at end,
      last_error = case when post_patch ? 'last_error' then left(post_patch->>'last_error', 500) else last_error end,
      last_error_code = case when post_patch ? 'last_error_code' then left(post_patch->>'last_error_code', 40) else last_error_code end,
      ig_media_id = case when post_patch ? 'ig_media_id' then post_patch->>'ig_media_id' else ig_media_id end,
      permalink = case when post_patch ? 'permalink' then post_patch->>'permalink' else permalink end,
      published_at = case when post_patch ? 'published_at' then (post_patch->>'published_at')::timestamptz else published_at end,
      lease_token = case when (payload->>'release')::boolean then null else lease_token end,
      lease_until = case when (payload->>'release')::boolean then null else now() + interval '3 minutes' end
    where id = target.id returning * into target;
    for item in select value from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) loop
      update public.duuk_social_post_media set ig_container_id = item->>'ig_container_id' where post_id = target.id and position = (item->>'position')::smallint;
    end loop;
    if payload ? 'event' then
      insert into public.duuk_social_events(post_id, account_id, kind, message) values (target.id, target.account_id, left(payload->'event'->>'kind', 40), left(coalesce(payload->'event'->>'message', ''), 500));
    end if;
    if (payload->>'release')::boolean and target.status in ('published', 'failed') then
      select * into account from public.duuk_social_accounts where id = target.account_id;
      if target.status = 'published' then
        insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
        values (target.publish_requested_by, duuk_private.social_actor_name(target.publish_requested_by), 'create', 'duuk_social', target.id::text, 'Publicado no Instagram @' || account.username,
          jsonb_build_object('format', target.format, 'permalink', target.permalink), 'social');
      end if;
      if (payload->>'notify')::boolean and target.publish_requested_by is not null then
        perform duuk_private.notify_members('system', 'social',
          case when target.status = 'published' then 'Publicado no Instagram' else 'Não foi possível publicar no Instagram' end,
          case when target.status = 'published' then '@' || account.username || ' · a publicação agendada foi enviada.' else '@' || account.username || ' · ' || coalesce(target.last_error, 'Revise a publicação.') end,
          '/admin/social/calendario?post=' || target.id, 'social:' || target.status || ':' || target.id || ':' || target.version, target.publish_requested_by);
      end if;
    end if;
    return duuk_private.social_post_json(target.id);
  end if;
  if operation = 'account_problem' then
    update public.duuk_social_accounts set status = coalesce(payload->>'status', 'error'), last_error = left(payload->>'message', 500), last_checked_at = now()
    where id = (payload->>'account_id')::uuid and status = 'active' returning * into account;
    if account.id is not null then
      insert into public.duuk_social_events(account_id, kind, message) values (account.id, 'account_' || account.status, left(coalesce(payload->>'message', ''), 500));
      perform duuk_private.notify_members('system', 'social', 'Instagram precisa de atenção', '@' || account.username || ' · ' || coalesce(account.last_error, 'Reconecte a conta.'),
        '/admin/social/conexao', 'social:account:' || account.id || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'));
    end if;
    return jsonb_build_object('updated', account.id is not null);
  end if;
  if operation = 'account_update' then
    update public.duuk_social_accounts set
      username = coalesce(nullif(payload->>'username', ''), username), name = coalesce(payload->>'name', name), account_type = coalesce(payload->>'account_type', account_type),
      profile_picture_url = case when payload ? 'profile_picture_url' then payload->>'profile_picture_url' else profile_picture_url end,
      followers_count = coalesce((payload->>'followers_count')::integer, followers_count), follows_count = coalesce((payload->>'follows_count')::integer, follows_count),
      media_count = coalesce((payload->>'media_count')::integer, media_count), last_checked_at = now(),
      last_error = case when status = 'active' then null else last_error end
    where id = (payload->>'account_id')::uuid returning * into account;
    if account.id is not null and (payload ? 'followers_count' or payload ? 'media_count') then
      insert into public.duuk_social_snapshots(account_id, day, followers_count, follows_count, media_count)
      values (account.id, (now() at time zone 'America/Sao_Paulo')::date, account.followers_count, account.follows_count, account.media_count)
      on conflict (account_id, day) do update set followers_count = excluded.followers_count, follows_count = excluded.follows_count, media_count = excluded.media_count, captured_at = now();
    end if;
    return to_jsonb(account);
  end if;
  if operation = 'token_update' then
    select * into token_row from duuk_private.social_tokens where account_id = (payload->>'account_id')::uuid for update;
    if not found then raise exception 'Conta sem autorização salva.' using errcode = 'PT404'; end if;
    perform vault.update_secret(token_row.credential_id, payload->>'token');
    update duuk_private.social_tokens set refreshed_at = now(), expires_at = (payload->>'expires_at')::timestamptz where account_id = token_row.account_id;
    update public.duuk_social_accounts set token_expires_at = (payload->>'expires_at')::timestamptz, token_refreshed_at = now(), last_checked_at = now() where id = token_row.account_id;
    insert into public.duuk_social_events(account_id, kind, message) values (token_row.account_id, 'token_refreshed', 'Autorização renovada por mais 60 dias');
    return jsonb_build_object('updated', true);
  end if;
  if operation = 'cache_get' then
    -- The cache table has a `payload` column too, so the argument is qualified by the function name.
    select i.payload into result from duuk_private.social_insights i
    where i.account_id = (duuk_social_backend.payload->>'account_id')::uuid and i.scope = duuk_social_backend.payload->>'scope' and i.key = duuk_social_backend.payload->>'key'
      and i.fetched_at > now() - make_interval(secs => coalesce((duuk_social_backend.payload->>'max_age')::integer, 3600));
    return result;
  end if;
  if operation = 'cache_put' then
    insert into duuk_private.social_insights(account_id, scope, key, payload)
    values ((duuk_social_backend.payload->>'account_id')::uuid, duuk_social_backend.payload->>'scope', duuk_social_backend.payload->>'key', duuk_social_backend.payload->'value')
    on conflict (account_id, scope, key) do update set payload = excluded.payload, fetched_at = now();
    return jsonb_build_object('saved', true);
  end if;
  if operation in ('deauthorize', 'data_deletion') then
    for account in select * from public.duuk_social_accounts where ig_user_id = payload->>'ig_user_id' or app_scoped_id = payload->>'ig_user_id' for update loop
      delete from vault.secrets where id in (select credential_id from duuk_private.social_tokens where account_id = account.id);
      delete from duuk_private.social_tokens where account_id = account.id;
      update public.duuk_social_posts set status = 'draft', scheduled_by = null, lease_token = null, lease_until = null where account_id = account.id and status = 'scheduled';
      if operation = 'data_deletion' then
        delete from public.duuk_social_snapshots where account_id = account.id;
        delete from duuk_private.social_insights where account_id = account.id;
        update public.duuk_social_accounts set status = 'revoked', name = '', profile_picture_url = null, followers_count = null, follows_count = null, media_count = null,
          token_expires_at = null, last_error = 'Dados do Instagram removidos a pedido do titular.', disconnected_at = now() where id = account.id;
      else
        update public.duuk_social_accounts set status = 'revoked', token_expires_at = null, last_error = 'O acesso foi removido no Instagram.', disconnected_at = now() where id = account.id;
      end if;
      insert into public.duuk_social_events(account_id, kind, message) values (account.id, operation, case when operation = 'deauthorize' then 'Acesso removido pelo titular no Instagram' else 'Dados removidos a pedido do titular' end);
      perform duuk_private.notify_members('system', 'social', 'Conexão do Instagram removida', '@' || account.username || ' removeu o acesso do DUUK Admin. Agendamentos voltaram para rascunho.', '/admin/social/conexao', 'social:' || operation || ':' || account.id || ':' || extract(epoch from now())::bigint);
    end loop;
    if operation = 'data_deletion' then
      insert into duuk_private.social_deletions(confirmation_code, ig_user_id, completed_at) values (payload->>'code', payload->>'ig_user_id', now());
    end if;
    return jsonb_build_object('done', true);
  end if;
  if operation = 'deletion_status' then
    return (select jsonb_build_object('requested_at', requested_at, 'completed_at', completed_at) from duuk_private.social_deletions where confirmation_code = payload->>'code');
  end if;

  -- Everything below acts for a person: active member with `social`, some steps super admin only.
  if actor is null or not duuk_private.member_permission(actor, 'social') then raise exception 'Sua conta não tem acesso ao Social Media.' using errcode = 'PT403'; end if;
  if operation = 'status' then
    return jsonb_build_object('configured', cfg.app_id is not null and cfg.credential_id is not null, 'app_id', case when is_admin then cfg.app_id end,
      'app_mode', cfg.app_mode, 'access_level', cfg.access_level, 'version', cfg.version, 'configured_at', cfg.configured_at, 'can_configure', is_admin,
      'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.owner_kind, a.username) from public.duuk_social_accounts a), '[]'::jsonb));
  end if;
  if operation = 'claim_now' then
    select * into target from public.duuk_social_posts where id = (payload->>'post_id')::uuid for update;
    if not found then raise exception 'Publicação não encontrada.' using errcode = 'PT404'; end if;
    if target.version is distinct from (payload->>'expected_version')::bigint then raise exception 'Esta publicação mudou em outra tela. Atualize antes de publicar.' using errcode = 'PT409'; end if;
    if target.status not in ('draft', 'scheduled', 'failed') then raise exception 'Esta publicação já foi enviada ou está em envio.' using errcode = 'PT409'; end if;
    select * into account from public.duuk_social_accounts where id = target.account_id;
    if account.status <> 'active' then raise exception 'A conta @% precisa ser reconectada antes de publicar.', account.username using errcode = 'PT409'; end if;
    if account.owner_kind = 'client' and cfg.access_level <> 'advanced' then raise exception 'Contas de clientes dependem do Acesso Avançado aprovado pela Meta.' using errcode = 'PT409'; end if;
    update public.duuk_social_posts set status = 'publishing', publish_requested_by = actor, lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes',
      attempts = case when target.status = 'failed' then 0 else attempts end, next_attempt_at = null, last_error = null, last_error_code = null,
      processing_started_at = case when target.status = 'failed' then null else processing_started_at end, updated_by = actor
    where id = target.id returning * into target;
    insert into public.duuk_social_events(post_id, account_id, kind, message, actor_id) values (target.id, target.account_id, 'publish_requested', 'Publicação solicitada agora', actor);
    return duuk_private.social_post_json(target.id) || jsonb_build_object('lease_token', target.lease_token);
  end if;

  if not is_admin then raise exception 'Somente a super administração gerencia a conexão com o Instagram.' using errcode = 'PT403'; end if;
  if operation in ('configure', 'unconfigure', 'oauth_start', 'connect', 'disconnect') then perform pg_advisory_xact_lock(hashtextextended('duuk:social:settings', 0)); end if;
  if operation = 'configure' then
    if cfg.version is distinct from (payload->>'expected_version')::bigint then raise exception 'A configuração mudou. Atualize antes de salvar.' using errcode = 'PT409'; end if;
    if coalesce(payload->>'app_id', '') !~ '^[0-9]{5,30}$' then raise exception 'Confira o ID do app do Instagram.' using errcode = 'PT400'; end if;
    if coalesce(payload->>'app_mode', '') not in ('development', 'live') or coalesce(payload->>'access_level', '') not in ('standard', 'advanced') then raise exception 'Confira o modo e o nível de acesso do app.' using errcode = 'PT400'; end if;
    if nullif(payload->>'app_secret', '') is not null then
      if char_length(payload->>'app_secret') not between 16 and 128 or payload->>'app_secret' !~ '^[A-Za-z0-9]+$' then raise exception 'Confira a chave secreta do app do Instagram.' using errcode = 'PT400'; end if;
      if cfg.credential_id is null then cfg.credential_id := vault.create_secret(payload->>'app_secret'); else perform vault.update_secret(cfg.credential_id, payload->>'app_secret'); end if;
    elsif cfg.credential_id is null then raise exception 'Informe a chave secreta do app do Instagram.' using errcode = 'PT400';
    end if;
    update duuk_private.social_settings set app_id = payload->>'app_id', credential_id = cfg.credential_id, app_mode = payload->>'app_mode', access_level = payload->>'access_level',
      configured_by = actor, configured_at = now(), version = version + 1 where singleton;
    insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
    values (actor, duuk_private.social_actor_name(actor), 'update', 'duuk_social', 'app', 'App do Instagram configurado', jsonb_build_object('app_mode', payload->>'app_mode', 'access_level', payload->>'access_level'), 'social');
    return jsonb_build_object('saved', true);
  end if;
  if operation = 'unconfigure' then
    if cfg.version is distinct from (payload->>'expected_version')::bigint then raise exception 'A configuração mudou. Atualize antes de continuar.' using errcode = 'PT409'; end if;
    if exists (select 1 from public.duuk_social_accounts where status = 'active') then raise exception 'Desconecte as contas do Instagram antes de remover o app.' using errcode = 'PT409'; end if;
    if cfg.credential_id is not null then delete from vault.secrets where id = cfg.credential_id; end if;
    update duuk_private.social_settings set app_id = null, credential_id = null, configured_by = actor, configured_at = now(), version = version + 1 where singleton;
    insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
    values (actor, duuk_private.social_actor_name(actor), 'delete', 'duuk_social', 'app', 'App do Instagram removido do DUUK Admin', '{}'::jsonb, 'social');
    return jsonb_build_object('saved', true);
  end if;
  if operation = 'oauth_start' then
    if cfg.app_id is null or cfg.credential_id is null then raise exception 'Configure o app do Instagram antes de conectar uma conta.' using errcode = 'PT409'; end if;
    if coalesce(payload->>'owner_kind', 'duuk') = 'client' and cfg.access_level <> 'advanced' then raise exception 'Contas de clientes dependem do Acesso Avançado aprovado pela Meta.' using errcode = 'PT409'; end if;
    delete from duuk_private.social_oauth_states where expires_at < now() - interval '1 day';
    insert into duuk_private.social_oauth_states(state_hash, user_id, owner_kind, client_id)
    values (payload->>'state_hash', actor, coalesce(payload->>'owner_kind', 'duuk'), case when payload->>'owner_kind' = 'client' then nullif(payload->>'client_id', '')::uuid end);
    return jsonb_build_object('app_id', cfg.app_id);
  end if;
  if operation = 'oauth_consume' then
    update duuk_private.social_oauth_states set consumed_at = now()
    where state_hash = payload->>'state_hash' and user_id = actor and consumed_at is null and expires_at > now() returning * into pending;
    if pending.state_hash is null then raise exception 'Este pedido de conexão expirou ou já foi usado. Comece novamente.' using errcode = 'PT409'; end if;
    return jsonb_build_object('owner_kind', pending.owner_kind, 'client_id', pending.client_id);
  end if;
  if operation = 'connect' then
    select * into account from public.duuk_social_accounts where ig_user_id = payload->>'ig_user_id' for update;
    if account.id is null then
      insert into public.duuk_social_accounts(ig_user_id, app_scoped_id, username, name, account_type, profile_picture_url, followers_count, follows_count, media_count,
        owner_kind, client_id, status, permissions, token_expires_at, token_refreshed_at, last_checked_at, connected_by)
      values (payload->>'ig_user_id', nullif(payload->>'app_scoped_id', ''), payload->>'username', coalesce(payload->>'name', ''), coalesce(payload->>'account_type', ''),
        nullif(payload->>'profile_picture_url', ''), (payload->>'followers_count')::integer, (payload->>'follows_count')::integer, (payload->>'media_count')::integer,
        coalesce(payload->>'owner_kind', 'duuk'), nullif(payload->>'client_id', '')::uuid, 'active',
        coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(payload->'permissions', '[]'::jsonb))), '{}'),
        (payload->>'expires_at')::timestamptz, now(), now(), actor)
      returning * into account;
    else
      update public.duuk_social_accounts set app_scoped_id = coalesce(nullif(payload->>'app_scoped_id', ''), app_scoped_id), username = payload->>'username',
        name = coalesce(payload->>'name', ''), account_type = coalesce(payload->>'account_type', ''), profile_picture_url = nullif(payload->>'profile_picture_url', ''),
        followers_count = (payload->>'followers_count')::integer, follows_count = (payload->>'follows_count')::integer, media_count = (payload->>'media_count')::integer,
        owner_kind = case when status = 'disconnected' then coalesce(payload->>'owner_kind', owner_kind) else owner_kind end,
        client_id = case when status = 'disconnected' then nullif(payload->>'client_id', '')::uuid else client_id end,
        status = 'active', permissions = coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(payload->'permissions', '[]'::jsonb))), '{}'),
        token_expires_at = (payload->>'expires_at')::timestamptz, token_refreshed_at = now(), last_checked_at = now(), last_error = null,
        connected_by = actor, connected_at = now(), disconnected_at = null
      where id = account.id returning * into account;
    end if;
    select * into token_row from duuk_private.social_tokens where account_id = account.id;
    if token_row.account_id is null then
      secret := vault.create_secret(payload->>'token');
      insert into duuk_private.social_tokens(account_id, credential_id, expires_at) values (account.id, secret, (payload->>'expires_at')::timestamptz);
    else
      perform vault.update_secret(token_row.credential_id, payload->>'token');
      update duuk_private.social_tokens set issued_at = now(), refreshed_at = null, expires_at = (payload->>'expires_at')::timestamptz where account_id = account.id;
    end if;
    insert into public.duuk_social_snapshots(account_id, day, followers_count, follows_count, media_count)
    values (account.id, (now() at time zone 'America/Sao_Paulo')::date, account.followers_count, account.follows_count, account.media_count)
    on conflict (account_id, day) do update set followers_count = excluded.followers_count, follows_count = excluded.follows_count, media_count = excluded.media_count, captured_at = now();
    insert into public.duuk_social_events(account_id, kind, message, actor_id) values (account.id, 'connected', 'Conta conectada pelo Login do Instagram', actor);
    insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
    values (actor, duuk_private.social_actor_name(actor), 'update', 'duuk_social', account.id::text, 'Instagram @' || account.username || ' conectado',
      jsonb_build_object('owner_kind', account.owner_kind, 'permissions', account.permissions), 'social');
    return to_jsonb(account);
  end if;
  if operation = 'disconnect' then
    select * into account from public.duuk_social_accounts where id = (payload->>'account_id')::uuid for update;
    if not found then raise exception 'Conta do Instagram não encontrada.' using errcode = 'PT404'; end if;
    if account.version is distinct from (payload->>'expected_version')::bigint then raise exception 'A conta mudou em outra tela. Atualize antes de continuar.' using errcode = 'PT409'; end if;
    if exists (select 1 from public.duuk_social_posts where account_id = account.id and status = 'publishing') then raise exception 'Há uma publicação em envio para esta conta. Aguarde terminar.' using errcode = 'PT409'; end if;
    update public.duuk_social_posts set status = 'draft', scheduled_by = null where account_id = account.id and status = 'scheduled';
    get diagnostics affected = row_count;
    delete from vault.secrets where id in (select credential_id from duuk_private.social_tokens where account_id = account.id);
    delete from duuk_private.social_tokens where account_id = account.id;
    delete from duuk_private.social_insights where account_id = account.id;
    update public.duuk_social_accounts set status = 'disconnected', token_expires_at = null, disconnected_at = now(), last_error = null where id = account.id returning * into account;
    insert into public.duuk_social_events(account_id, kind, message, actor_id) values (account.id, 'disconnected', 'Conta desconectada do DUUK Admin', actor);
    insert into public.duuk_audit(actor_id, actor_name, action, entity, entity_id, summary, details, required_permission)
    values (actor, duuk_private.social_actor_name(actor), 'update', 'duuk_social', account.id::text, 'Instagram @' || account.username || ' desconectado',
      jsonb_build_object('unscheduled_posts', affected), 'social');
    return jsonb_build_object('disconnected', true, 'unscheduled_posts', affected);
  end if;
  raise exception 'Operação não permitida.' using errcode = 'PT400';
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
  raise exception 'Dados inválidos para o Social Media.' using errcode = 'PT400';
end;
$$;

revoke all on function public.duuk_social_backend(text, jsonb) from public, anon, authenticated;
grant execute on function public.duuk_social_backend(text, jsonb) to service_role;
revoke all on function public.duuk_social_media_register(jsonb), public.duuk_social_media_update(jsonb), public.duuk_social_media_delete(uuid, bigint),
  public.duuk_social_post_save(jsonb), public.duuk_social_post_unschedule(uuid, bigint), public.duuk_social_post_delete(uuid, bigint) from public, anon;
grant execute on function public.duuk_social_media_register(jsonb), public.duuk_social_media_update(jsonb), public.duuk_social_media_delete(uuid, bigint),
  public.duuk_social_post_save(jsonb), public.duuk_social_post_unschedule(uuid, bigint), public.duuk_social_post_delete(uuid, bigint) to authenticated;

-- Scheduling runs in the database: no browser needs to stay open. The HTTP call happens only when a
-- post is due (or waiting for Instagram to finish processing a video).
select cron.schedule('duuk-social-dispatch', '* * * * *', $cron$
  select net.http_post(url := 'https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-duuk-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'duuk.push.cron')),
    body := jsonb_build_object('action', 'dispatch'), timeout_milliseconds := 30000)
  where exists (select 1 from public.duuk_social_posts p
    where ((p.status = 'scheduled' and p.scheduled_at <= now()) or (p.status = 'publishing' and coalesce(p.next_attempt_at, p.updated_at) <= now()))
      and (p.lease_until is null or p.lease_until < now()))
$cron$);
select cron.schedule('duuk-social-daily', '10 9 * * *', $cron$
  select net.http_post(url := 'https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-duuk-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'duuk.push.cron')),
    body := jsonb_build_object('action', 'daily'), timeout_milliseconds := 30000)
  where exists (select 1 from public.duuk_social_accounts where status = 'active')
$cron$);
