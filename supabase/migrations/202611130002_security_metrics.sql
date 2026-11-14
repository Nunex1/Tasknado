-- Operational counters for the trusted health check. Aggregates only: no
-- identifiers, names, paths or content leave the database. Not callable by
-- clients. Safe to run more than once.
create or replace function public.security_metrics() returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object(
  'generated_at',clock_timestamp(),
  'database_bytes',pg_database_size(current_database()),
  'accounts',(select count(*) from auth.users),
  'uploads_pending',(select count(*) from attachments where scan_status='pending'),
  'uploads_pending_overdue',(select count(*) from attachments where scan_status='pending' and created_at<clock_timestamp()-interval '15 minutes'),
  'oldest_pending_seconds',(select coalesce(extract(epoch from clock_timestamp()-min(created_at))::bigint,0) from attachments where scan_status='pending'),
  'uploads_clean_24h',(select count(*) from attachments where scan_status='clean' and scanned_at>clock_timestamp()-interval '24 hours'),
  'uploads_rejected_24h',(select count(*) from attachments where scan_status='rejected' and scanned_at>clock_timestamp()-interval '24 hours'),
  'cleanup_backlog',(select count(*) from storage_cleanup),
  'cleanup_overdue',(select count(*) from storage_cleanup where created_at<clock_timestamp()-interval '15 minutes'),
  'reserved_bytes',(select coalesce(sum(reserved_bytes),0) from attachment_paths),
  -- 90% of the 1 GiB reservation ceiling enforced by reserve_attachment_path.
  'accounts_near_storage_quota',(select count(*) from (select 1 from attachment_paths group by owner_id having sum(reserved_bytes)>=966367641) near),
  'audited_changes_1h',(select count(*) from audit_logs where created_at>clock_timestamp()-interval '1 hour'),
  'busiest_account_changes_1m',(select coalesce(max(changes),0) from (select count(*) changes from audit_logs where created_at>clock_timestamp()-interval '1 minute' group by owner_id) busy));
$$;
revoke all on function public.security_metrics() from public,anon,authenticated;
grant execute on function public.security_metrics() to service_role;
