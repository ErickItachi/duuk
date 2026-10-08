-- Private Realtime Presence for active DUUK members. Presence is informational only.
drop policy if exists duuk_team_presence_read on realtime.messages;
create policy duuk_team_presence_read
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'duuk:team:presence'
  and realtime.messages.extension = 'presence'
  and (select duuk_private.has_permission(null))
);

drop policy if exists duuk_team_presence_track on realtime.messages;
create policy duuk_team_presence_track
on realtime.messages
for insert
to authenticated
with check (
  (select realtime.topic()) = 'duuk:team:presence'
  and realtime.messages.extension = 'presence'
  and (select duuk_private.has_permission(null))
);
