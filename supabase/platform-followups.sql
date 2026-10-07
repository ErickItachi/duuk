create function duuk_private.client_next_followup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if pg_trigger_depth()=1 and new.next_follow_up is not null and (TG_OP='INSERT' or new.next_follow_up is distinct from old.next_follow_up) then insert into public.duuk_follow_ups(client_id,owner_id,due_at,notes) values(new.id,coalesce(new.owner_id,new.created_by),new.next_follow_up,'Próximo contato agendado no cadastro do cliente');end if;return new;
end; $$;
create function duuk_private.sync_next_followup() returns trigger language plpgsql security definer set search_path='' as $$ declare cid uuid; begin cid=case when TG_OP='DELETE' then old.client_id else new.client_id end;update public.duuk_clients set next_follow_up=(select min(due_at) from public.duuk_follow_ups where client_id=cid and completed_at is null) where id=cid; if TG_OP='DELETE' then return old;else return new;end if;end; $$;
create trigger client_next_followup after insert or update of next_follow_up on public.duuk_clients for each row execute function duuk_private.client_next_followup();
create trigger sync_next_followup after insert or update or delete on public.duuk_follow_ups for each row execute function duuk_private.sync_next_followup();
revoke all on function duuk_private.client_next_followup(),duuk_private.sync_next_followup() from public,anon,authenticated;
