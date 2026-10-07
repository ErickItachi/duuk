create or replace function public.duuk_action_limit(actor uuid,action_name text,maximum integer,window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$ declare amount integer;bucket bigint:=floor(extract(epoch from now())/window_seconds);begin
 insert into duuk_private.action_limits values(actor,action_name,bucket,1) on conflict on constraint action_limits_pkey do update set count=action_limits.count+1 returning count into amount;
 delete from duuk_private.action_limits where window_start<floor(extract(epoch from now())/window_seconds)-2 and action=action_name;
 return amount<=maximum;
end; $$;
