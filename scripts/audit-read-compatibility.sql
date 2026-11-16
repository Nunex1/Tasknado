-- Read-only pre-deploy evidence. Run against the explicit intended project.
-- A present routine is not proof of correct RLS behavior: also run the owner/
-- stranger integration suite in staging. This script never applies migrations.
WITH required(signature) AS (VALUES
  ('public.activity_page(uuid,jsonb,text,jsonb,integer)'),
  ('public.activity_total(uuid,jsonb)'),
  ('public.activity_summary(uuid)'),
  ('public.observation_counts_for(uuid[])'),
  ('public.search_all(text,uuid,text,text,timestamp with time zone,timestamp with time zone,text,integer)'),
  ('public.export_revision()'),
  ('public.export_professional_page(text,uuid)'),
  ('public.workspace_timeline_page(uuid,timestamp with time zone,uuid)')
), routines AS (
  SELECT signature, p.oid IS NOT NULL AS present,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS result,
    p.prosecdef AS security_definer,
    p.proconfig AS settings,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    (SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname) AS overloads
  FROM required LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature)
)
SELECT json_build_object(
  'checked_at', now(),
  'routines', (SELECT json_agg(routines) FROM routines),
  'routine_gate_passed', (SELECT bool_and(present AND authenticated_execute AND NOT anon_execute AND overloads=1) FROM routines),
  'migration_versions', (SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
  'public_rls', (SELECT json_agg(json_build_object('table',c.relname,'enabled',c.relrowsecurity)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
  'search_documents', (SELECT json_agg(json_build_object('table',table_name,'generated',is_generated)) FROM information_schema.columns WHERE table_schema='public' AND column_name='search_document')
) AS compatibility;
