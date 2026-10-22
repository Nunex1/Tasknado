GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE
ON public.workspaces TO authenticated;
GRANT SELECT, INSERT
ON public.activities TO authenticated;
GRANT UPDATE (title, description, archived)
ON public.activities TO authenticated;
GRANT SELECT, INSERT, UPDATE
ON public.notes TO authenticated;
GRANT SELECT, INSERT
ON public.note_entries TO authenticated;
GRANT SELECT, INSERT, DELETE
ON public.attachments TO authenticated;
GRANT SELECT
ON public.activity_events, public.audit_logs
TO authenticated;
