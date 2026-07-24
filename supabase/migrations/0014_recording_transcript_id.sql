-- 0014: submit+webhook recording pipeline needs to correlate an AssemblyAI
-- webhook callback back to its recording_jobs row. AssemblyAI's callback
-- carries only the transcript id, so we store it on the job at submit time
-- and look the job up by it in the webhook handler.
alter table recording_jobs add column if not exists transcript_id text;

create index if not exists idx_jobs_transcript_id on recording_jobs (transcript_id);
