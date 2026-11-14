-- A change token includes count: sequence allocation order is not commit order.
create function public.export_revision() returns text
language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 select count(*)::text || ':' || coalesce(max(id),0)::text from public.audit_logs where owner_id=(select auth.uid())
$$;
-- Same owner-only inactive-category export exception as export_professional_plans.
-- This additive API uses an immutable primary-key cursor rather than OFFSET.
create function public.export_professional_page(p_table text,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_table='career_targets' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
   select * from public.career_targets where owner_id=auth.uid() and (p_after is null or id>p_after) order by id limit 500
  ) r;
 elsif p_table='professional_development_items' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
   select * from public.professional_development_items where owner_id=auth.uid() and (p_after is null or id>p_after) order by id limit 500
  ) r;
 else raise exception 'Invalid export table'; end if;
 return result;
end $$;
revoke all on function public.export_revision(),public.export_professional_page(text,uuid) from public,anon,authenticated;
grant execute on function public.export_revision(),public.export_professional_page(text,uuid) to authenticated;
