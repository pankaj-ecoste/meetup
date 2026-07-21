-- Add FK from tasks.meeting_id → meetings.id now that meetings table exists
alter table tasks
  add constraint tasks_meeting_id_fkey
  foreign key (meeting_id) references meetings(id) on delete set null;
