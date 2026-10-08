-- Biblioteca: testes transacionais, sem rede nem arquivos reais.
begin;
-- Para um banco local com permissão: load 'safeupdate';
-- MCP bloqueia LOAD; a validação do safeguard também exige as RPCs pela API REST real.
do $$
declare actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); client uuid:=gen_random_uuid(); doc jsonb; listing jsonb; internal_doc jsonb; scope jsonb; job jsonb;
begin
 insert into public.duuk_roles(id,name) values(r,'Teste biblioteca '||r);
 insert into auth.users(id,email) values(actor,actor||'@test.invalid'),(outsider,outsider||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id) values(actor,'Biblioteca',actor||'@test.invalid',r),(outsider,'Sem acesso',outsider||'@test.invalid',r);
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(actor,'drive',true);
 doc:=public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'file_name','Logo produção.png','mime_type','image/png','byte_size',1024,'sha256',repeat('d',64),'source_path','files/'||actor||'/'||gen_random_uuid()));
 internal_doc:=doc;
 if not exists(select 1 from public.duuk_drive_documents where id=(doc->>'id')::uuid and kind='file' and client_key='internal' and client_id is null and source_bucket='duuk-drive-files' and mime_type='image/png') then raise exception 'Arquivo interno não entrou na biblioteca'; end if;
 listing:=public.duuk_drive_backend('library',jsonb_build_object('user_id',actor,'search','Logo produção'));
 if jsonb_array_length(listing->'documents')<>1 then raise exception 'Busca não retornou arquivo da biblioteca'; end if;
 if (public.duuk_drive_backend('file',jsonb_build_object('user_id',actor,'document_id',doc->>'id'))->>'source_bucket')<>'duuk-drive-files' then raise exception 'Download aponta para bucket incorreto'; end if;
 begin
  perform public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'file_name','Duplicado.png','mime_type','image/png','byte_size',1024,'sha256',repeat('d',64),'source_path','files/'||actor||'/'||gen_random_uuid()));
  raise exception 'Duplicação permitida';
 exception when sqlstate 'PT409' then null; end;
 begin perform public.duuk_drive_backend('library',jsonb_build_object('user_id',outsider));raise exception 'Biblioteca exposta';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_drive_backend('file',jsonb_build_object('user_id',outsider,'document_id',doc->>'id'));raise exception 'Download exposto';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'file_name','Ataque.html','mime_type','text/html','byte_size',1024,'sha256',repeat('e',64),'source_path','files/'||actor||'/'||gen_random_uuid()));raise exception 'HTML ativo permitido';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'file_name','Grande.zip','mime_type','application/zip','byte_size',20971521,'sha256',repeat('e',64),'source_path','files/'||actor||'/'||gen_random_uuid()));raise exception 'Limite de tamanho ignorado';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'file_name','Outra conta.png','mime_type','image/png','byte_size',1024,'sha256',repeat('f',64),'source_path','files/'||outsider||'/'||gen_random_uuid()));raise exception 'Upload vinculou caminho de outro membro';exception when sqlstate 'PT400' then null;end;
 insert into public.duuk_clients(id,name,created_by) values(client,'Cliente biblioteca',actor);
 begin perform public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'client_id',client,'file_name','Briefing.txt','mime_type','text/plain','byte_size',1024,'sha256',repeat('e',64),'source_path','files/'||actor||'/'||gen_random_uuid()));raise exception 'Cliente exposto sem CRM';exception when sqlstate 'PT403' then null;end;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(actor,'crm',true),(actor,'crm.clients',true);
 doc:=public.duuk_drive_backend('add_file',jsonb_build_object('user_id',actor,'client_id',client,'file_name','Briefing.txt','mime_type','text/plain','byte_size',1024,'sha256',repeat('e',64),'source_path','files/'||actor||'/'||gen_random_uuid()));
 if not exists(select 1 from public.duuk_drive_documents where id=(doc->>'id')::uuid and client_id=client and client_key='crm:'||client) then raise exception 'Arquivo não ficou vinculado ao cliente';end if;
 -- Contratos não aparecem só porque o membro recebeu Google Drive.
 insert into public.duuk_drive_documents(kind,client_key,client_name,file_name,source_path) values('contract_original','test:'||actor,'Contrato privado','Privado.pdf','original/'||gen_random_uuid()||'/'||gen_random_uuid()||'.pdf');
 if jsonb_array_length(public.duuk_drive_backend('library',jsonb_build_object('user_id',actor,'kind','contract_original'))->'documents')<>0 then raise exception 'Contratos expostos na biblioteca';end if;
 -- O worker usa a mesma proteção do PostgREST. Estado de conexão e notificações são
 -- isolados nesta transação; nenhum arquivo é enviado e nenhum push é disparado.
 insert into public.duuk_drive_connection(google_subject,account_email) values('fixture-library','fixture@test.invalid') on conflict(singleton) do nothing;
 update public.duuk_drive_connection set status='connected',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' where singleton=true
  returning jsonb_build_object('generation',generation,'lease_id',lease_id) into scope;
 select to_jsonb(d) into job from public.duuk_drive_documents d where id=(internal_doc->>'id')::uuid;
 for i in 1..3 loop
  perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','expected_source_path',job->>'source_path','expected_source_sha256',job->>'source_sha256','error','Falha temporária do teste','retryable',true));
 end loop;
 if (select count(*) from public.duuk_notifications where user_id=actor and dedupe_key like 'drive:fail:'||(job->>'id')||'%' and required_permission='drive' and category='system' and link='/admin/drive')<>1 then raise exception 'Falha da biblioteca não gerou aviso próprio e único'; end if;
 if exists(select 1 from public.duuk_notifications where user_id=outsider and dedupe_key like 'drive:fail:'||(job->>'id')||'%') then raise exception 'Falha da biblioteca vazou para membro sem acesso'; end if;
 for i in 1..2 loop
  perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','expected_source_path',job->>'source_path','expected_source_sha256',job->>'source_sha256','drive_file_id','fixture-file-'||actor,'drive_folder_id','fixture-folder','drive_link','https://drive.google.com/file/d/fixture-file-'||actor||'/view'));
 end loop;
 if (select count(*) from public.duuk_notifications where user_id=actor and dedupe_key='drive:saved:'||(job->>'id') and required_permission='drive' and category='system' and link='/admin/drive')<>1 then raise exception 'Sucesso da biblioteca não gerou aviso próprio e único'; end if;
 if exists(select 1 from public.duuk_notifications where user_id=outsider and dedupe_key='drive:saved:'||(job->>'id')) then raise exception 'Sucesso da biblioteca vazou para membro sem acesso'; end if;
 if has_function_privilege('authenticated','public.duuk_drive_backend(text,jsonb)','execute') then raise exception 'RPC de servidor exposta';end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'')||coalesce(with_check,'')) like '%duuk-drive-files%') then raise exception 'Bucket da biblioteca exposto ao navegador';end if;
end $$;
select 'PASS: biblioteca privada, DML com filtros, MIME, tamanho, origem por membro, pastas, vínculo CRM, busca, download, duplicação, notificações e permissões' as result;
rollback;
