-- Synthetic records and all notification inserts are rolled back; no dispatch or provider calls.
begin;
do $$
declare
 actor uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); social_peer uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid(); muted uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid();
 finance_role uuid:=gen_random_uuid(); social_role uuid:=gen_random_uuid(); plain_role uuid:=gen_random_uuid();
 income_id uuid; expense_id uuid; account_id uuid:=gen_random_uuid(); post_id uuid:=gen_random_uuid(); rev bigint; cnt integer; goal_month date;
begin
 insert into public.duuk_roles(id,name) values(finance_role,'QA finance '||finance_role),(social_role,'QA social '||social_role),(plain_role,'QA plain '||plain_role);
 insert into public.duuk_role_permissions(role_id,permission,allowed) values(finance_role,'finance',true),(social_role,'social',true);
 insert into auth.users(id,email) select id,id||'@test.invalid' from unnest(array[actor,peer,social_peer,denied,muted,disabled]) id;
 insert into public.duuk_profiles(id,name,email,role_id,active,is_super_admin) values
 (actor,'QA actor',actor||'@test.invalid',finance_role,true,true),(peer,'QA finance',peer||'@test.invalid',finance_role,true,false),
 (social_peer,'QA social',social_peer||'@test.invalid',social_role,true,false),(denied,'QA denied',denied||'@test.invalid',plain_role,true,false),
 (muted,'QA muted',muted||'@test.invalid',finance_role,true,false),(disabled,'QA disabled',disabled||'@test.invalid',finance_role,false,false);
 insert into public.duuk_notification_preferences(user_id,finance,social) values(muted,false,false);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 insert into public.duuk_income(title,amount_cents,due_date,category) values('QA receipt',10000,date '2020-01-02','Projetos') returning id,version into income_id,rev;
 if (select count(*) from public.duuk_notifications where user_id=peer and dedupe_key like 'finance:income:'||income_id||':%')<>1 then raise exception 'Income creation notice missing';end if;
 if exists(select 1 from public.duuk_notifications where user_id in(actor,denied,muted,disabled,social_peer) and dedupe_key like 'finance:income:'||income_id||':%') then raise exception 'Income notice leaked';end if;
 update public.duuk_income set description='Only metadata' where id=income_id;
 if (select count(*) from public.duuk_notifications where user_id=peer and dedupe_key like 'finance:income:'||income_id||':%')<>1 then raise exception 'Metadata caused noise';end if;
 update public.duuk_income set status='paid',paid_date=date '2020-01-02' where id=income_id;
 if not exists(select 1 from public.duuk_notifications where user_id=peer and title='Recebimento confirmado' and dedupe_key like 'finance:income:'||income_id||':%') then raise exception 'Received notice missing';end if;
 update public.duuk_income set status='pending',paid_date=null where id=income_id;
 update public.duuk_income set due_date=date '2020-02-02' where id=income_id;
 delete from public.duuk_income where id=income_id;
 if (select count(*) from public.duuk_notifications where user_id=peer and dedupe_key like 'finance:income:'||income_id||':%')<>5 then raise exception 'Income transition count wrong';end if;
 insert into public.duuk_expenses(title,amount_cents,due_date,category) values('QA expense',5000,date '2020-01-02','other') returning id into expense_id;
 update public.duuk_expenses set status='paid',paid_date=date '2020-01-02' where id=expense_id;
 if not exists(select 1 from public.duuk_notifications where user_id=peer and title='Pagamento de despesa confirmado' and dedupe_key like 'finance:expense:'||expense_id||':%') then raise exception 'Paid expense missing';end if;
 select d::date into goal_month from generate_series(date '1900-01-01',date '1905-01-01',interval '1 month') d where not exists(select 1 from public.duuk_finance_goals where month=d::date) limit 1;
 insert into public.duuk_finance_goals(month,revenue_goal_cents,expense_budget_cents) values(goal_month,10000,5000);
 if not exists(select 1 from public.duuk_notifications where user_id=peer and dedupe_key like 'finance:goals:'||goal_month||':%') then raise exception 'Goal notice missing';end if;
 insert into public.duuk_social_accounts(id,ig_user_id,username,connected_by) values(account_id,'900000000000000001','qa_resource',actor);
 insert into public.duuk_social_posts(id,account_id,format,status,scheduled_at,scheduled_by,publish_requested_by,created_by) values(post_id,account_id,'image','scheduled',now()+interval '2 days',actor,actor,actor);
 if (select count(*) from public.duuk_notifications where user_id=social_peer and category='social' and dedupe_key like 'social:scheduled:'||post_id||':%')<>1 then raise exception 'Scheduled notice missing';end if;
 if exists(select 1 from public.duuk_notifications where user_id in(actor,peer,denied,muted,disabled) and dedupe_key like 'social:%:'||post_id||':%') then raise exception 'Social notice leaked';end if;
 update public.duuk_social_posts set scheduled_at=scheduled_at+interval '1 day' where id=post_id;
 update public.duuk_social_posts set status='draft' where id=post_id;
 update public.duuk_social_posts set status='published',published_at=now() where id=post_id returning version into rev;
 select count(*) into cnt from public.duuk_notifications where user_id=social_peer and dedupe_key='social:published:'||post_id||':'||rev;
 perform duuk_private.notify_members('social','social','Published again','Should deduplicate','/admin/social','social:published:'||post_id||':'||rev,social_peer);
 if cnt<>1 or (select count(*) from public.duuk_notifications where user_id=social_peer and dedupe_key='social:published:'||post_id||':'||rev)<>1 then raise exception 'Worker duplicate';end if;
 update public.duuk_social_posts set status='failed' where id=post_id;
 if (select count(*) from public.duuk_notifications where user_id=social_peer and category='social' and dedupe_key like 'social:%:'||post_id||':%')<>5 then raise exception 'Social transitions wrong';end if;
 insert into public.duuk_notification_preferences(user_id,social) values(social_peer,false);
 update public.duuk_social_posts set status='scheduled' where id=post_id;
 if (select count(*) from public.duuk_notifications where user_id=social_peer and dedupe_key like 'social:%:'||post_id||':%')<>5 then raise exception 'Social mute ignored';end if;
 if exists(select 1 from public.duuk_notifications where dedupe_key like 'social:%:'||post_id||':%' and body like '%QA receipt%') then raise exception 'Unrelated private data copied';end if;
 if has_function_privilege('authenticated','duuk_private.finance_action_notification()','execute') or has_function_privilege('anon','duuk_private.social_action_notification()','execute') then raise exception 'Private helper exposed';end if;
 -- Changing the central connection is isolated in this transaction; no API runs.
 update duuk_private.pluggy_settings set item_id=gen_random_uuid(),account_id=gen_random_uuid(),version=version+1 where singleton=true returning version into rev;
 if not exists(select 1 from public.duuk_notifications where user_id=peer and required_permission='finance' and dedupe_key='pluggy:connection:'||rev) then raise exception 'Bank connection notice missing';end if;
 if exists(select 1 from public.duuk_notifications where user_id in(actor,denied,disabled,social_peer) and dedupe_key='pluggy:connection:'||rev) then raise exception 'Bank connection notice leaked';end if;
 insert into public.duuk_notification_preferences(user_id,system) values(peer,false) on conflict(user_id) do update set system=false;
 update duuk_private.pluggy_settings set item_id=null,account_id=null,version=version+1 where singleton=true returning version into rev;
 if exists(select 1 from public.duuk_notifications where user_id=peer and dedupe_key='pluggy:connection:'||rev) then raise exception 'System mute ignored';end if;
 -- New preference is writable only for the authenticated owner.
 execute 'set local role authenticated';
 insert into public.duuk_notification_preferences(user_id,social) values(actor,false) on conflict(user_id) do update set social=excluded.social;
 if (select social from public.duuk_notification_preferences where user_id=actor) then raise exception 'Own preference not saved';end if;
 begin insert into public.duuk_notification_preferences(user_id,social) values(peer,false);raise exception 'Foreign preference writable';exception when insufficient_privilege then null;end;
end $$;
rollback;
