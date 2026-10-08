-- Todas as contas, clientes, contratos, assinaturas, segredos e notificações fictícios são desfeitos no rollback.
-- Nenhuma chamada externa ao Google é feita por este teste.
begin;
do $$
declare admin_id uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); sales uuid:=gen_random_uuid();
 admin_role uuid:=gen_random_uuid(); staff_role uuid:=gen_random_uuid(); outsider_role uuid:=gen_random_uuid(); sales_role uuid:=gen_random_uuid();
 crm_client uuid:=gen_random_uuid(); first_contract uuid:=gen_random_uuid(); second_contract uuid:=gen_random_uuid(); third_contract uuid:=gen_random_uuid(); other_contract uuid:=gen_random_uuid();
 invite_a uuid:=gen_random_uuid(); invite_b uuid:=gen_random_uuid();
 state text; lease jsonb; scope jsonb; jobs jsonb; job jsonb; proposal jsonb; total integer; revision bigint; folder_name text; sha text:=repeat('a',64);
begin
 insert into public.duuk_roles(id,name) values(admin_role,'Teste Drive A '||admin_role),(staff_role,'Teste Drive B '||staff_role),(outsider_role,'Teste Drive C '||outsider_role),(sales_role,'Teste Drive D '||sales_role);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(staff_role,'contracts',true),(sales_role,'crm',true),(sales_role,'crm.clients',true);
 insert into auth.users(id,email) values(admin_id,admin_id||'@test.invalid'),(staff,staff||'@test.invalid'),(outsider,outsider||'@test.invalid'),(sales,sales||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,is_super_admin) values(admin_id,'Teste administrador',admin_id||'@test.invalid',admin_role,true),(staff,'Teste contratos',staff||'@test.invalid',staff_role,false),(outsider,'Teste sem acesso',outsider||'@test.invalid',outsider_role,false),(sales,'Teste comercial',sales||'@test.invalid',sales_role,false);
 insert into public.duuk_clients(id,name,company,email,created_by) values(crm_client,'Maria Souza','Apollo Grill','contato@apollo.test',admin_id);

 -- Contrato novo: pendência criada na mesma transação, com nome profissional e cliente do CRM.
 insert into public.duuk_contracts(id,title,client_name,client_email,duuk_name,original_path,original_sha256,pages,created_by)
 values(first_contract,'Prestação de serviços','Apollo Grill','','Representante DUUK','original/'||first_contract||'/'||gen_random_uuid()||'.pdf',repeat('1',64),'[{"width":595,"height":842,"rotation":0}]',admin_id);
 select count(*) into total from public.duuk_drive_documents where contract_id=first_contract and kind='contract_original' and status='pending' and file_name='Contrato Apollo Grill.pdf' and client_key='crm:'||crm_client;
 if total<>1 then raise exception 'Original não entrou na fila com nome e cliente esperados'; end if;
 if exists(select 1 from public.duuk_drive_documents where contract_id=first_contract and kind='contract_signed') then raise exception 'Contrato sem assinaturas gerou PDF assinado'; end if;

 -- Segundo contrato do mesmo cliente não repete o nome do arquivo.
 insert into public.duuk_contracts(id,title,client_name,client_email,duuk_name,original_path,original_sha256,pages,created_by)
 values(second_contract,'Aditivo','apollo grill','','Representante DUUK','original/'||second_contract||'/'||gen_random_uuid()||'.pdf',repeat('2',64),'[{"width":595,"height":842,"rotation":0}]',admin_id);
 if (select file_name from public.duuk_drive_documents where contract_id=second_contract and kind='contract_original')<>'Contrato apollo grill (2).pdf' then raise exception 'Nome duplicado não recebeu numeração'; end if;
 if (select client_key from public.duuk_drive_documents where contract_id=second_contract and kind='contract_original')<>'crm:'||crm_client then raise exception 'Mesmo cliente recebeu identificador diferente'; end if;

 -- Cliente sem cadastro: mesmo nome com e-mail distinto não compartilha pasta; nomes inseguros são limpos.
 insert into public.duuk_contracts(id,title,client_name,client_email,duuk_name,original_path,original_sha256,pages,created_by)
 values(third_contract,'Contrato','Nova/Empresa: "Teste"','a@externo.test','Representante DUUK','original/'||third_contract||'/'||gen_random_uuid()||'.pdf',repeat('3',64),'[{"width":595,"height":842,"rotation":0}]',admin_id),
       (other_contract,'Contrato','Nova/Empresa: "Teste"','b@externo.test','Representante DUUK','original/'||other_contract||'/'||gen_random_uuid()||'.pdf',repeat('4',64),'[{"width":595,"height":842,"rotation":0}]',admin_id);
 if (select count(distinct client_key) from public.duuk_drive_documents where contract_id in(third_contract,other_contract))<>2 then raise exception 'Clientes com nomes iguais foram misturados'; end if;
 if exists(select 1 from public.duuk_drive_documents where file_name ~ '[/:"]') then raise exception 'Nome de arquivo inseguro'; end if;

 -- Assinatura parcial e PDF antigo nunca viram contrato finalizado.
 insert into public.duuk_contract_invites(id,contract_id,party,token_hash) values(invite_a,first_contract,'client',repeat('b',64)),(invite_b,first_contract,'duuk',repeat('c',64));
 insert into public.duuk_contract_signatures(contract_id,invite_id,party,signer_name,png,consent) values(first_contract,invite_a,'client','Cliente Teste',repeat('p',120),'aceite');
 update public.duuk_contracts set status='partial',version=version+1 where id=first_contract;
 update public.duuk_contracts set signed_path='signed/'||first_contract||'/'||gen_random_uuid()||'.pdf',signed_sha256=repeat('5',64),rendered_version=version where id=first_contract;
 if exists(select 1 from public.duuk_drive_documents where contract_id=first_contract and kind='contract_signed') then raise exception 'Contrato parcial foi tratado como finalizado'; end if;
 insert into public.duuk_contract_signatures(contract_id,invite_id,party,signer_name,png,consent) values(first_contract,invite_b,'duuk','DUUK Teste',repeat('p',120),'aceite');
 update public.duuk_contracts set status='signed',version=version+1 where id=first_contract;
 if exists(select 1 from public.duuk_drive_documents where contract_id=first_contract and kind='contract_signed') then raise exception 'PDF final enfileirado antes de ser gerado para a versão atual'; end if;
 update public.duuk_contracts set signed_path='signed/'||first_contract||'/'||gen_random_uuid()||'.pdf',signed_sha256=repeat('6',64),rendered_version=version where id=first_contract;
 if (select file_name from public.duuk_drive_documents where contract_id=first_contract and kind='contract_signed')<>'Contrato Apollo Grill - Assinado.pdf' then raise exception 'Contrato assinado não entrou na fila com o nome esperado'; end if;
 if (select client_key from public.duuk_drive_documents where contract_id=first_contract and kind='contract_signed')<>'crm:'||crm_client then raise exception 'Assinado ficou em outro cliente'; end if;
 update public.duuk_contracts set signed_path=signed_path,rendered_version=version where id=first_contract;
 if (select count(*) from public.duuk_drive_documents where contract_id=first_contract)<>2 then raise exception 'Reprocessar o contrato duplicou documentos'; end if;

 -- Falha no gatilho jamais interrompe o contrato: força um erro e confirma que o insert continua válido.
 alter table public.duuk_drive_documents add constraint test_force_failure check (file_name <> 'Contrato Forçado.pdf');
 insert into public.duuk_contracts(id,title,client_name,client_email,duuk_name,original_path,original_sha256,pages,created_by)
 values(gen_random_uuid(),'Contrato','Forçado','','Representante DUUK','original/x/'||gen_random_uuid()||'.pdf',repeat('7',64),'[{"width":595,"height":842,"rotation":0}]',admin_id);
 if not exists(select 1 from public.duuk_contracts where client_name='Forçado') then raise exception 'Falha do Drive interrompeu o contrato'; end if;
 alter table public.duuk_drive_documents drop constraint test_force_failure;

 -- Somente super administradores gerenciam a conexão; credenciais ficam no Vault.
 begin perform public.duuk_drive_backend('start',jsonb_build_object('user_id',staff,'state_hash','x','verifier','x'));raise exception 'Membro comum iniciou OAuth';exception when sqlstate 'PT403' then null;end;
 state:='drv.teste-'||admin_id;
 perform public.duuk_drive_backend('start',jsonb_build_object('user_id',admin_id,'state_hash',state,'verifier','verificador'));
 begin perform public.duuk_drive_backend('consume',jsonb_build_object('user_id',staff,'state_hash',state));raise exception 'State atravessou contas';exception when sqlstate 'PT400' then null;end;
 perform public.duuk_drive_backend('consume',jsonb_build_object('user_id',admin_id,'state_hash',state));
 begin perform public.duuk_drive_backend('consume',jsonb_build_object('user_id',admin_id,'state_hash',state));raise exception 'State repetido aceito';exception when sqlstate 'PT400' then null;end;
 perform public.duuk_drive_backend('connect',jsonb_build_object('user_id',admin_id,'state_hash',state,'google_subject','sub-drive','account_email','duukfilms@gmail.com','tokens',jsonb_build_object('access_token','FAKE_ACCESS_TOKEN','refresh_token','FAKE_REFRESH_TOKEN','expires_at',0)));
 if not exists(select 1 from public.duuk_drive_connection c join vault.secrets v on v.id=c.credential_id where v.secret like '%FAKE_REFRESH_TOKEN%') then raise exception 'Credencial não foi guardada no Vault'; end if;
 if (public.duuk_drive_backend('status',jsonb_build_object('user_id',admin_id)))::text like '%FAKE_%' then raise exception 'Status expôs token'; end if;
 state:='drv.teste-novo-'||admin_id;
 perform public.duuk_drive_backend('start',jsonb_build_object('user_id',admin_id,'state_hash',state,'verifier','verificador-novo'));
 perform public.duuk_drive_backend('consume',jsonb_build_object('user_id',admin_id,'state_hash',state));
 lease:=public.duuk_drive_backend('connect',jsonb_build_object('user_id',admin_id,'state_hash',state,'google_subject','sub-drive','account_email','duukfilms@gmail.com','tokens',jsonb_build_object('access_token','NEW_ACCESS_TOKEN','refresh_token','NEW_REFRESH_TOKEN','expires_at',0)));
 if lease#>>'{replaced_tokens,refresh_token}'<>'FAKE_REFRESH_TOKEN' then raise exception 'Reconexão não devolveu a credencial anterior para revogação'; end if;
 if exists(select 1 from vault.secrets where secret like '%FAKE_REFRESH_TOKEN%') or not exists(select 1 from public.duuk_drive_connection c join vault.secrets v on v.id=c.credential_id where v.secret like '%NEW_REFRESH_TOKEN%') then raise exception 'Reconexão não substituiu a credencial no Vault'; end if;
 begin perform public.duuk_drive_backend('status',jsonb_build_object('user_id',staff));raise exception 'Status liberado para membro comum';exception when sqlstate 'PT403' then null;end;

 -- Fila: um único worker por vez, estrutura de pastas única e nome desambiguado.
 lease:=public.duuk_drive_backend('claim');
 if lease is null or not (lease->>'quota_due')::boolean then raise exception 'Claim não entregou a conexão'; end if;
 if public.duuk_drive_backend('claim') is not null then raise exception 'Dois workers receberam a mesma conexão'; end if;
 if (select lease_until from public.duuk_drive_connection) < now() + interval '4 minutes' then raise exception 'Lease não cobre uma transferência resumível'; end if;
 scope:=jsonb_build_object('generation',lease->>'generation','lease_id',lease->>'lease_id');
 perform public.duuk_drive_backend('folder_save',scope||jsonb_build_object('key','root','drive_id','drv-root','name','DUUK'));
 perform public.duuk_drive_backend('folder_save',scope||jsonb_build_object('key','section:contracts','drive_id','drv-contracts','name','Contratos','parent_key','root'));
 perform public.duuk_drive_backend('folder_save',scope||jsonb_build_object('key','section:contracts','drive_id','drv-contracts','name','Contratos','parent_key','root'));
 if (select count(*) from public.duuk_drive_folders where key='section:contracts')<>1 then raise exception 'Pasta duplicada no banco'; end if;
 perform public.duuk_drive_backend('folder_save',scope||jsonb_build_object('key','client:contracts:ext:1','drive_id','drv-c1','name','Cliente Homônimo','parent_key','section:contracts','client_key','ext:1'));
 folder_name:=(public.duuk_drive_backend('unique_name',scope||jsonb_build_object('parent_key','section:contracts','client_key','ext:2','name','Cliente Homônimo')))#>>'{}';
 if folder_name<>'Cliente Homônimo (2)' then raise exception 'Clientes de mesmo nome compartilharam a pasta: %',folder_name; end if;
 if (public.duuk_drive_backend('unique_name',scope||jsonb_build_object('parent_key','section:contracts','client_key','ext:1','name','Cliente Homônimo')))#>>'{}'<>'Cliente Homônimo' then raise exception 'Cliente existente perdeu a própria pasta'; end if;
 jobs:=public.duuk_drive_backend('jobs',scope||'{"limit":10}'::jsonb);
 if jsonb_array_length(jobs)<>5 then raise exception 'Número inesperado de documentos pendentes: %',jsonb_array_length(jobs); end if;
 if jobs->0->>'kind'<>'contract_signed' then raise exception 'O contrato finalizado deveria ser priorizado'; end if;
 if jobs::text like '%FAKE_%' or jobs::text like '%drive_file_id%' then raise exception 'Jobs expuseram dados indevidos'; end if;

 -- Sucesso, repetição de confirmação e proteção contra novo envio do assinado.
 select to_jsonb(d) into job from public.duuk_drive_documents d where contract_id=first_contract and kind='contract_signed';
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','drive_file_id','drv-file-signed','drive_folder_id','drv-signed','drive_link','https://drive.google.com/file/d/drv-file-signed/view'));
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','drive_file_id','drv-OUTRO','drive_folder_id','x','drive_link','x'));
 if (select drive_file_id from public.duuk_drive_documents where id=(job->>'id')::uuid)<>'drv-file-signed' then raise exception 'Confirmação repetida sobrescreveu o arquivo assinado'; end if;
 if not exists(select 1 from public.duuk_notifications where user_id=staff and dedupe_key='drive:signed:'||(job->>'id')) then raise exception 'Notificação de contrato salvo ausente'; end if;
 if exists(select 1 from public.duuk_notifications where user_id in(outsider,sales) and dedupe_key like 'drive:%') then raise exception 'Notificação vazou para quem não tem acesso'; end if;
 update public.duuk_contracts set signed_path='signed/'||first_contract||'/'||gen_random_uuid()||'.pdf',signed_sha256=repeat('9',64),rendered_version=version where id=first_contract;
 if (select source_sha256 from public.duuk_drive_documents where id=(job->>'id')::uuid)<>repeat('6',64) then raise exception 'Documento assinado já salvo foi alterado'; end if;

 -- Falhas: três tentativas geram um único aviso; recuperação gera aviso próprio e zera o erro.
 select to_jsonb(d) into job from public.duuk_drive_documents d where contract_id=first_contract and kind='contract_original';
 for i in 1..4 loop
  perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','error','Falha de teste','retryable',true));
 end loop;
 if (select status||attempts from public.duuk_drive_documents where id=(job->>'id')::uuid)<>'error4' then raise exception 'Tentativas não foram contadas'; end if;
 if (select count(*) from public.duuk_notifications where user_id=staff and dedupe_key like 'drive:fail:'||(job->>'id')||'%')<>1 then raise exception 'Aviso de falha duplicado ou ausente'; end if;
 if (select next_attempt_at from public.duuk_drive_documents where id=(job->>'id')::uuid)<=now() then raise exception 'Nova tentativa sem espera'; end if;
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','drive_file_id','drv-file-original','drive_folder_id','drv-generated','drive_link','https://drive.google.com/file/d/drv-file-original/view'));
 if (select status||attempts||coalesce(last_error,'ok') from public.duuk_drive_documents where id=(job->>'id')::uuid)<>'synced0ok' then raise exception 'Recuperação não limpou o estado'; end if;
 if not exists(select 1 from public.duuk_notifications where user_id=staff and dedupe_key like 'drive:recovered:'||(job->>'id')||'%') then raise exception 'Aviso de recuperação ausente'; end if;
 begin update public.duuk_drive_documents set drive_file_id=null where id=(job->>'id')::uuid;raise exception 'Documento sincronizado ficou sem arquivo';exception when check_violation then null;end;

 -- Retry respeita permissão por documento; sincronizados não são reenviados.
 select to_jsonb(d) into job from public.duuk_drive_documents d where contract_id=second_contract and kind='contract_original';
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','error','Falha permanente','retryable',false));
 if (select attempts from public.duuk_drive_documents where id=(job->>'id')::uuid)<>8 then raise exception 'Erro permanente continuaria sendo tentado'; end if;
 begin perform public.duuk_drive_backend('retry',jsonb_build_object('user_id',outsider,'document_id',job->>'id'));raise exception 'Retry sem permissão';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_drive_backend('retry',jsonb_build_object('user_id',staff,'document_id',(select id from public.duuk_drive_documents where contract_id=first_contract and kind='contract_original')));raise exception 'Reenvio de documento já salvo';exception when sqlstate 'PT409' then null;end;
 perform public.duuk_drive_backend('retry',jsonb_build_object('user_id',staff,'document_id',job->>'id'));
 if (select status||attempts from public.duuk_drive_documents where id=(job->>'id')::uuid)<>'pending0' then raise exception 'Retry não reenfileirou'; end if;

 -- Cota próxima do limite gera um único aviso mensal, somente para administradores de permissões.
 perform public.duuk_drive_backend('quota',scope||jsonb_build_object('limit',1000,'usage',950));
 perform public.duuk_drive_backend('quota',scope||jsonb_build_object('limit',1000,'usage',960));
 if (select count(*) from public.duuk_notifications where user_id=admin_id and dedupe_key like 'drive:quota:%')<>1 then raise exception 'Aviso de cota duplicado ou ausente'; end if;
 if exists(select 1 from public.duuk_notifications where user_id=staff and dedupe_key like 'drive:quota:%') then raise exception 'Aviso de cota técnico enviado a membro comum'; end if;

 -- Propostas: cliente do CRM, nome profissional, permissão e deduplicação por conteúdo.
 begin perform public.duuk_drive_backend('add_proposal',jsonb_build_object('user_id',staff,'client_id',crm_client,'source_path','proposal/x.pdf','sha256',sha));raise exception 'Proposta sem permissão comercial';exception when sqlstate 'PT403' then null;end;
 proposal:=public.duuk_drive_backend('add_proposal',jsonb_build_object('user_id',sales,'client_id',crm_client,'source_path','proposal/'||crm_client||'/a.pdf','sha256',sha));
 if proposal->>'file_name'<>'Proposta Comercial Apollo Grill.pdf' then raise exception 'Nome da proposta incorreto: %',proposal->>'file_name'; end if;
 begin perform public.duuk_drive_backend('add_proposal',jsonb_build_object('user_id',sales,'client_id',crm_client,'source_path','proposal/'||crm_client||'/b.pdf','sha256',sha));raise exception 'Proposta duplicada aceita';exception when sqlstate 'PT409' then null;end;
 proposal:=public.duuk_drive_backend('add_proposal',jsonb_build_object('user_id',sales,'client_id',crm_client,'source_path','proposal/'||crm_client||'/c.pdf','sha256',repeat('d',64)));
 if proposal->>'file_name'<>'Proposta Comercial Apollo Grill (2).pdf' then raise exception 'Segunda proposta sem numeração'; end if;
 total:=jsonb_array_length(public.duuk_drive_backend('documents',jsonb_build_object('user_id',sales,'client_id',crm_client)));
 if total<>2 then raise exception 'Listagem de propostas incorreta'; end if;
 begin perform public.duuk_drive_backend('documents',jsonb_build_object('user_id',outsider,'contract_id',first_contract));raise exception 'Listagem sem permissão';exception when sqlstate 'PT403' then null;end;
 if (public.duuk_drive_backend('documents',jsonb_build_object('user_id',staff,'contract_id',first_contract)))::text like '%drive_file_id%' or (public.duuk_drive_backend('documents',jsonb_build_object('user_id',staff,'contract_id',first_contract)))::text not like '%drive.google.com/file/d/drv-file-original/view%' then raise exception 'Campos do Drive expostos de forma incorreta'; end if;
 begin perform public.duuk_drive_backend('file',jsonb_build_object('user_id',staff,'document_id',(select id from public.duuk_drive_documents where kind='proposal' limit 1)));raise exception 'Proposta acessada sem permissão comercial';exception when sqlstate 'PT403' then null;end;
 delete from public.duuk_clients where id=crm_client;
 select to_jsonb(d) into job from public.duuk_drive_documents d where kind='proposal' order by created_at limit 1;
 for i in 1..3 loop
  perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','error','Falha de proposta','retryable',true));
 end loop;
 if not exists(select 1 from public.duuk_notifications where user_id=sales and dedupe_key like 'drive:fail:'||(job->>'id')||'%' and link='/admin/comercial/clientes') then raise exception 'Falha da proposta sem cliente não gerou destino seguro'; end if;
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','drive_file_id','drv-proposal-orphan','drive_folder_id','drv-proposals','drive_link','https://drive.google.com/file/d/drv-proposal-orphan/view'));
 if not exists(select 1 from public.duuk_notifications where user_id=sales and dedupe_key like 'drive:recovered:'||(job->>'id')||'%' and link='/admin/comercial/clientes') then raise exception 'Recuperação da proposta sem cliente não foi registrada'; end if;

 -- Exclusão do contrato preserva a referência e os arquivos do Drive.
 select to_jsonb(d) into job from public.duuk_drive_documents d where contract_id=second_contract and kind='contract_original';
 perform public.duuk_drive_backend('finish',scope||jsonb_build_object('document_id',job->>'id','drive_file_id','drv-file-second','drive_folder_id','drv-generated','drive_link','https://drive.google.com/file/d/drv-file-second/view'));
 delete from public.duuk_contracts where id=second_contract;
 if not exists(select 1 from public.duuk_drive_documents where drive_file_id='drv-file-second' and contract_id is null) then raise exception 'Excluir contrato apagou o registro do Drive'; end if;
 delete from public.duuk_contracts where id=third_contract;
 if exists(select 1 from public.duuk_drive_documents where client_key like 'ext:%' and contract_id is null) or exists(select 1 from public.duuk_drive_documents where contract_id=third_contract) then raise exception 'Rascunho excluído deixou pendência órfã'; end if;

 -- Reconexão com erro volta a tentar; desconexão remove credenciais mas não registros.
 perform public.duuk_drive_backend('error',scope||jsonb_build_object('error','A autorização do Google expirou.'));
 if (select status from public.duuk_drive_connection)<>'error' then raise exception 'Erro de autorização não marcou a conexão'; end if;
 if not exists(select 1 from public.duuk_notifications where user_id=admin_id and dedupe_key like 'drive:auth:%') then raise exception 'Aviso de reconexão ausente'; end if;
 perform public.duuk_drive_backend('disconnect',jsonb_build_object('user_id',admin_id));
 if exists(select 1 from public.duuk_drive_connection where credential_id is not null) or exists(select 1 from vault.secrets where secret like '%FAKE_REFRESH_TOKEN%') then raise exception 'Desconexão manteve credenciais'; end if;
 if not exists(select 1 from public.duuk_drive_documents where drive_file_id='drv-file-signed') then raise exception 'Desconexão apagou referências'; end if;
 if public.duuk_drive_backend('claim') is not null then raise exception 'Conexão desconectada continuou processando'; end if;

 -- Leitura pelo navegador respeita permissão, inclusive no bucket compartilhado, e não vê IDs do Drive.
 insert into storage.objects(bucket_id,name) values
  ('duuk-documents','original/'||first_contract||'/'||gen_random_uuid()||'.pdf'),
  ('duuk-documents','proposal/'||gen_random_uuid()||'/'||gen_random_uuid()||'.pdf');
 grant select on storage.objects to authenticated;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
 set local role authenticated;
 if (select count(*) from public.duuk_drive_documents where kind in('contract_original','contract_signed'))=0 then raise exception 'Equipe de contratos não vê o estado da sincronização'; end if;
 if exists(select 1 from public.duuk_drive_documents where kind='proposal') then raise exception 'Contratos enxergou propostas'; end if;
 if not exists(select 1 from storage.objects where name like 'original/%') or exists(select 1 from storage.objects where name like 'proposal/%') then raise exception 'Contratos acessou o caminho de propostas no Storage'; end if;
 begin perform drive_file_id from public.duuk_drive_documents;raise exception 'Navegador leu ID do Drive';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.duuk_drive_connection;raise exception 'Navegador leu a conexão';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',sales,'role','authenticated')::text,true);
 if not exists(select 1 from storage.objects where name like 'proposal/%') or exists(select 1 from storage.objects where name like 'original/%') then raise exception 'CRM recebeu acesso incorreto ao bucket de documentos'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 if (select count(*) from public.duuk_drive_documents)<>0 then raise exception 'Usuário sem permissão leu documentos'; end if;
 reset role;
end $$;
reset role;
rollback;
select 'PASS: fila transacional, nomes, clientes homônimos, pastas sem duplicação, assinatura final, falhas, retry, notificações, propostas, permissões e credenciais no Vault' as result;
