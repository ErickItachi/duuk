-- Run after duuk-ai.sql. Everything, including role/profile fixtures, rolls back.
begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();disabled uuid:=gen_random_uuid();r uuid:=gen_random_uuid();
 reqid uuid:=gen_random_uuid();req2 uuid:=gen_random_uuid();cid uuid;docid uuid;project text:='ai-test-'||gen_random_uuid();
 started jsonb;completed jsonb;doc jsonb;listing jsonb;retry jsonb;input jsonb;finish jsonb;usage_count integer;
begin
 insert into public.duuk_roles(id,name) values(r,'Teste DUUK AI '||r);
 insert into auth.users(id,email) values(a,a||'@test.invalid'),(b,b||'@test.invalid'),(disabled,disabled||'@test.invalid');
 insert into public.duuk_profiles(id,name,email,role_id,active) values
  (a,'AI A',a||'@test.invalid',r,true),(b,'AI B',b||'@test.invalid',r,true),(disabled,'AI desativado',disabled||'@test.invalid',r,false);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(r,'ai',true);
 update duuk_private.ai_settings set requests_per_minute=60,requests_per_day=100,tokens_per_day=1000000 where singleton=true;
 begin perform public.duuk_ai_backend('list',jsonb_build_object('user_id',disabled));raise exception 'Conta desativada acessou AI';exception when sqlstate 'PT403' then null;end;
 begin perform public.duuk_ai_backend('configuration','{}');exception when others then raise exception 'Configuração interna falhou';end;
 if has_function_privilege('authenticated','public.duuk_ai_backend(text,jsonb)','execute') or has_function_privilege('anon','public.duuk_ai_backend(text,jsonb)','execute') then raise exception 'RPC interna exposta';end if;
 if has_table_privilege('authenticated','public.duuk_ai_conversations','insert') or has_table_privilege('authenticated','public.duuk_ai_documents','update') or has_table_privilege('authenticated','public.duuk_ai_document_versions','delete') then raise exception 'Escrita direta liberada';end if;

 input:=jsonb_build_object('user_id',a,'request_id',reqid,'message','Crie um roteiro com dados fictícios.','mode','script','selected_model','gemini-3.5-flash-lite');
 started:=public.duuk_ai_backend('begin_generation',input);cid:=(started->'conversation'->>'id')::uuid;
 if jsonb_array_length(started->'history')<>1 or started->'permissions'->>'ai'<>'true' then raise exception 'Contexto inicial inválido';end if;
 if not exists(select 1 from public.duuk_ai_usage where request_id=reqid and not usage_known and reserved_tokens>8192) then raise exception 'Reserva de tokens ausente';end if;
 begin perform public.duuk_ai_backend('begin_generation',input);raise exception 'Requisição pendente duplicada';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_backend('begin_generation',input||jsonb_build_object('message','Outro conteúdo'));raise exception 'Idempotência ignorou payload';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',req2,'conversation_id',cid,'message','Paralela','mode','free'));raise exception 'Geração concorrente permitida';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_backend('conversation',jsonb_build_object('user_id',b,'conversation_id',cid));raise exception 'Histórico de outra pessoa exposto';exception when sqlstate 'PT404' then null;end;
 if jsonb_array_length(public.duuk_ai_backend('list',jsonb_build_object('user_id',b))->'conversations')<>0 then raise exception 'Listagem de históricos exposta';end if;
 begin perform public.duuk_ai_backend('delete',jsonb_build_object('user_id',a,'id',cid));raise exception 'Conversa em uso excluída';exception when sqlstate 'PT409' then null;end;
 finish:=jsonb_build_object('user_id',a,'request_id',reqid,'lease_id',started->'request'->>'lease_id','content','CENA 01: Teste fictício.','status','complete','model','gemini-3.5-flash-lite','prompt_version','test-v1','tokens_input',50,'tokens_output',100,'usage_known',true);
 begin perform public.duuk_ai_backend('finish_generation',finish||jsonb_build_object('lease_id',gen_random_uuid()));raise exception 'Lease incorreto aceito';exception when sqlstate 'PT409' then null;end;
 completed:=public.duuk_ai_backend('finish_generation',finish);
 perform public.duuk_ai_backend('finish_generation',finish);
 retry:=public.duuk_ai_backend('begin_generation',input);
 if retry->'completed'->'message'->>'id'<>completed->'message'->>'id' then raise exception 'Replay não retornou mesma resposta';end if;
 if (select count(*) from public.duuk_ai_messages where conversation_id=cid and superseded_at is null)<>2 or (select count(*) from public.duuk_ai_usage where request_id=reqid)<>1 then raise exception 'Replay duplicou mensagens ou uso';end if;
 if (public.duuk_ai_backend('status',jsonb_build_object('user_id',a))->'usage'->>'tokens_today')::integer<>150 then raise exception 'Tokens reais incorretos';end if;

 reqid:=gen_random_uuid();input:=jsonb_build_object('user_id',a,'request_id',reqid,'conversation_id',cid,'message','Melhore a conclusão.','mode','script');
 started:=public.duuk_ai_backend('begin_generation',input);
 perform public.duuk_ai_backend('finish_generation',jsonb_build_object('user_id',a,'request_id',reqid,'lease_id',started->'request'->>'lease_id','status','failed','model','gemini-3.5-flash-lite','error_code','quota','usage_known',false));
 retry:=public.duuk_ai_backend('begin_generation',input);
 if retry->'request'->>'user_message_id'<>started->'request'->>'user_message_id' then raise exception 'Retry duplicou mensagem do usuário';end if;
 if (select count(*) from public.duuk_ai_usage where request_id=reqid)<>2 then raise exception 'Retry não contou nova tentativa';end if;
 perform public.duuk_ai_backend('finish_generation',jsonb_build_object('user_id',a,'request_id',reqid,'lease_id',retry->'request'->>'lease_id','content','Conclusão parcial','status','partial','model','gemini-3.5-flash-lite','usage_known',false));
 reqid:=gen_random_uuid();
 started:=public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',reqid,'conversation_id',cid,'regenerate',true,'mode','free'));
 if exists(select 1 from public.duuk_ai_messages where conversation_id=cid and content='Conclusão parcial' and superseded_at is null) then raise exception 'Regeneração manteve resposta antiga ativa';end if;
 perform public.duuk_ai_backend('finish_generation',jsonb_build_object('user_id',a,'request_id',reqid,'lease_id',started->'request'->>'lease_id','content','Nova conclusão','status','complete','model','gemini-3.5-flash-lite','usage_known',true));
 reqid:=gen_random_uuid();
 started:=public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',reqid,'conversation_id',cid,'edit_message_id',started->'request'->>'user_message_id','message','Revisão consciente','mode','help'));
 if started->'history'->-1->>'content'<>'Revisão consciente' then raise exception 'Edição não entrou no contexto';end if;
 perform public.duuk_ai_backend('finish_generation',jsonb_build_object('user_id',a,'request_id',reqid,'lease_id',started->'request'->>'lease_id','content','Orientação','status','complete','model','gemini-3.5-flash-lite','usage_known',true));

 doc:=public.duuk_ai_backend('save_document',jsonb_build_object('user_id',a,'conversation_id',cid,'title','Roteiro privado','content','CENA 01','document_type','script'));docid:=(doc->'document'->>'id')::uuid;
 begin perform public.duuk_ai_backend('document',jsonb_build_object('user_id',b,'id',docid));raise exception 'Documento privado exposto';exception when sqlstate 'PT404' then null;end;
 doc:=public.duuk_ai_backend('save_document',jsonb_build_object('user_id',a,'id',docid,'expected_version',1,'title','Roteiro revisado','content','CENA 01 revisada','document_type','script'));
 if (doc->'document'->>'version')::integer<>2 or jsonb_array_length(public.duuk_ai_backend('versions',jsonb_build_object('user_id',a,'id',docid))->'versions')<>2 then raise exception 'Versões não preservadas';end if;
 begin perform public.duuk_ai_backend('save_document',jsonb_build_object('user_id',a,'id',docid,'expected_version',1,'title','Velho','content','Sobrescrito'));raise exception 'Versão antiga sobrescreveu documento';exception when sqlstate 'PT409' then null;end;
 begin perform public.duuk_ai_backend('save_document',jsonb_build_object('user_id',a,'title','Compartilhamento inválido','content','Teste','shared',true));raise exception 'Compartilhou sem projeto';exception when sqlstate 'PT400' then null;end;
 begin perform public.duuk_ai_backend('projects',jsonb_build_object('user_id',a));raise exception 'Projetos expostos sem permissão';exception when sqlstate 'PT403' then null;end;
 insert into public.duuk_user_permissions(user_id,permission,allowed) values(a,'site',true),(b,'site',true);
 update public.duuk_content set content=jsonb_set(content,'{projects}',(content->'projects')||jsonb_build_array(jsonb_build_object('id',project,'title','Projeto AI fictício','status','draft'))) where key='draft';
 listing:=public.duuk_ai_backend('projects',jsonb_build_object('user_id',a));
 if not exists(select 1 from jsonb_array_elements(listing->'projects') listed_project where listed_project->>'id'=project and listed_project->>'title'='Projeto AI fictício') then raise exception 'Projetos autorizados não foram listados';end if;
 doc:=public.duuk_ai_backend('save_document',jsonb_build_object('user_id',a,'id',docid,'expected_version',2,'title','Roteiro compartilhado','content','CENA 01 pública à equipe autorizada','document_type','script','project_id',project,'shared',true));
 listing:=public.duuk_ai_backend('document',jsonb_build_object('user_id',b,'id',docid));
 if (listing->>'can_edit')::boolean or listing->'document'->>'project_id'<>project then raise exception 'Compartilhamento incorreto';end if;
 -- Actual authenticated RLS, independent of the server-only RPC checks.
 perform set_config('request.jwt.claim.sub',b::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.duuk_ai_conversations)<>0 or (select count(*) from public.duuk_ai_messages)<>0 then raise exception 'RLS expôs conversa privada';end if;
 if (select count(*) from public.duuk_ai_documents where id=docid)<>1 or (select count(*) from public.duuk_ai_document_versions where document_id=docid)<>3 then raise exception 'RLS negou documento compartilhado autorizado';end if;
 if (select count(*) from public.duuk_ai_usage)<>0 then raise exception 'RLS expôs uso de outro membro';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.duuk_ai_backend('save_document',jsonb_build_object('user_id',b,'id',docid,'expected_version',3,'title','Ataque','content','Alterar'));raise exception 'Outro membro editou documento';exception when sqlstate 'PT403' then null;end;
 update public.duuk_user_permissions set allowed=false where user_id=b and permission='site';
 begin perform public.duuk_ai_backend('document',jsonb_build_object('user_id',b,'id',docid));raise exception 'Permissão revogada ignorada';exception when sqlstate 'PT404' then null;end;

 -- Quotas apply to attempts, including retries, and reserve unknown token usage.
 update duuk_private.ai_settings set requests_per_minute=1 where singleton=true;
 begin perform public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',gen_random_uuid(),'message','Acima do limite'));raise exception 'Limite por minuto ignorado';exception when sqlstate 'PT429' then null;end;
 update duuk_private.ai_settings set requests_per_minute=60,requests_per_day=1 where singleton=true;
 begin perform public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',a,'request_id',gen_random_uuid(),'message','Acima do dia'));raise exception 'Limite diário ignorado';exception when sqlstate 'PT429' then null;end;
 update duuk_private.ai_settings set requests_per_day=100,tokens_per_day=1000 where singleton=true;
 begin perform public.duuk_ai_backend('begin_generation',jsonb_build_object('user_id',b,'request_id',gen_random_uuid(),'message','Reserva maior que orçamento'));raise exception 'Reserva de tokens ignorada';exception when sqlstate 'PT429' then null;end;
 update public.duuk_profiles set active=false where id=a;
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.duuk_ai_conversations)<>0 or (select count(*) from public.duuk_ai_documents)<>0 then raise exception 'RLS ignorou conta desativada';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.duuk_ai_backend('list',jsonb_build_object('user_id',a));raise exception 'Revogação de conta ignorada';exception when sqlstate 'PT403' then null;end;
end $$;
select 'PASS: DUUK AI auth, isolation, sharing, versions, replay, retry, leases, quotas and token reservations' as result;
rollback;
